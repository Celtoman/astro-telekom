const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { template, composition } = require('./helpers/general-home.cjs');
const { publicationSource } = require('./helpers/publication-source.cjs');
const { AdminPageTemplatesController } = require('../apps/api/dist/admin-page-templates.controller.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
const projection = existsSync(join(__dirname, '../apps/api/dist/general-home-template.js')) ? require('../apps/api/dist/general-home-template.js') : {};

function workspace() {
  let current = template();
  const site = { workingRevision: 7, publishedRevision: 6, connectionPhone: '78005557244', supportPhone: '78002507777' };
  const published = template(); published.blocks[1].data.title = 'Опубликованная проверка';
  const revisions = []; const writes = [];
  const prisma = {
    site: { findUnique: async ({ where }) => where.id === 'site-1' ? { ...site } : null },
    pageTemplate: {
      findUnique: async ({ where }) => where.siteId_kind.siteId === 'site-1' && where.siteId_kind.kind === 'HOME' ? structuredClone(current) : null,
      findUniqueOrThrow: async () => structuredClone(current),
      update: async ({ data }) => { writes.push('template'); current = { ...current, ...data }; return structuredClone(current); },
    },
    pageTemplateBlock: { update: async ({ where, data }) => { writes.push(where.id); Object.assign(current.blocks.find(block => block.id === where.id), structuredClone(data)); } },
    $queryRaw: async () => [{ homeHero: null, generalHome: null, pageTemplates: [structuredClone(published)] }],
  };
  prisma.$transaction = async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const before = structuredClone(current), revision = site.workingRevision;
    try { return await fn(prisma); } catch (error) { current = before; site.workingRevision = revision; throw error; }
  };
  const publications = { recordWorkingRevision: async (_tx, input) => { revisions.push(input); site.workingRevision++; return { siteRevision: site.workingRevision }; } };
  return { controller: new AdminPageTemplatesController(prisma, publications), prisma, site, revisions, writes, published, current: () => current };
}

test('general HOME resource is explicitly guarded and exposes separate working/published blocks', async () => {
  const context = workspace();
  assert.equal(typeof context.controller.generalHome, 'function');
  assert.equal(Reflect.getMetadata('path', AdminPageTemplatesController.prototype.generalHome), 'general-home');
  assert.equal(Reflect.getMetadata('path', AdminPageTemplatesController.prototype.updateGeneralHome), 'general-home');
  assert.ok(Reflect.getMetadata('__guards__', AdminPageTemplatesController).some(guard => guard.name === 'AdminTokenGuard'));
  const result = await context.controller.generalHome('site-1');
  assert.equal(result.version, '1.0.0'); assert.equal(result.blocks.length, 10);
  assert.equal(result.workingRevision, 7); assert.equal(result.publishedRevision, 6);
  assert.equal(result.published.blocks[1].data.title, 'Опубликованная проверка');
  assert.equal(result.blocks[1].data.title, 'Проверить адрес');
  assert.equal(result.system.connectionHours, 'Ежедневно с 8:00 до 22:00');
  assert.equal(result.system.callbackWithinMinutes, 15);
  context.prisma.$queryRaw = async () => [{ pageTemplates: [], generalHome: null }];
  assert.equal((await context.controller.generalHome('site-1')).published, null);
});

test('saving a full HOME preserves IDs/order/Hero, creates one attributed revision and never publishes', async () => {
  const context = workspace(), blocks = composition();
  blocks[1].data.title = 'Новая проверка'; blocks.at(-1).data.items = [];
  assert.equal(typeof context.controller.updateGeneralHome, 'function');
  const before = structuredClone(context.current());
  const result = await context.controller.updateGeneralHome('site-1', { expectedWorkingRevision: 7, blocks }, { user: { id: 'editor' } });
  assert.equal(result.workingRevision, 8);
  assert.deepEqual(result.missingFields, [{ block: 'home.faq', field: 'items' }]);
  assert.deepEqual(context.current().blocks.map(({ id, position, blockType, visible }) => ({ id, position, blockType, visible })), before.blocks.map(({ id, position, blockType, visible }) => ({ id, position, blockType, visible })));
  assert.deepEqual(context.current().blocks[0].data, before.blocks[0].data);
  assert.equal(context.revisions.length, 1); assert.equal(context.revisions[0].actorId, 'editor');
  assert.deepEqual(context.revisions[0].previousSnapshot, before);
  assert.equal(context.revisions[0].snapshot.blocks[1].data.title, 'Новая проверка');
  assert.equal(context.site.publishedRevision, 6);
  assert.equal(context.published.blocks[1].data.title, 'Опубликованная проверка');
});

test('stale revision, unknown site, unsafe fields and client version overrides cannot write', async () => {
  const context = workspace();
  assert.equal(typeof context.controller.updateGeneralHome, 'function');
  await assert.rejects(context.controller.updateGeneralHome('site-1', { expectedWorkingRevision: 6, blocks: composition() }), error => error.getStatus() === 409);
  await assert.rejects(context.controller.updateGeneralHome('other-site', { expectedWorkingRevision: 7, blocks: composition() }), error => error.getStatus() === 404);
  await assert.rejects(context.controller.updateGeneralHome('site-1', { expectedWorkingRevision: 7, blocks: composition(), version: '1.0.0' }), error => error.getStatus() === 400);
  const blocks = composition(); blocks[6].data.groups.payments.items.bonus.href = '/override';
  await assert.rejects(context.controller.updateGeneralHome('site-1', { expectedWorkingRevision: 7, blocks }), error => {
    assert.equal(error.getResponse().block, 'home.more_possibilities');
    assert.equal(error.getResponse().field, 'groups.payments.items.bonus.href'); return true;
  });
  assert.equal(context.writes.length, 0); assert.equal(context.revisions.length, 0);
  context.prisma.$transaction = async () => { throw { code: 'P2034' }; };
  await assert.rejects(context.controller.updateGeneralHome('site-1', { expectedWorkingRevision: 7, blocks: composition() }), error => error.getStatus() === 409);
});

test('legacy Hero editor keeps all new blocks and composition metadata intact', async () => {
  const context = workspace(), before = structuredClone(context.current());
  await context.controller.updateFirstScreen('site-1', 'HOME', { expectedWorkingRevision: 7, data: { ...before.blocks[0].data, text: 'Изменён только Hero' } });
  assert.deepEqual(context.current().blocks.slice(1), before.blocks.slice(1));
  assert.equal(context.current().content.generalHomeCompositionVersion, '1.0.0');
});

test('HOME benefit facts cannot be edited as template-local copies', async () => {
  const context = workspace(), blocks = composition();
  blocks.find(block => block.blockType === 'home.benefits').data.items.speed.factText = 'До 100 Гбит/с';
  await assert.rejects(context.controller.updateGeneralHome('site-1', { expectedWorkingRevision: 7, blocks }), error => error.block === 'home.benefits' && error.field === 'items.speed.factText' && error.reason === 'READ_ONLY');
  assert.equal(context.writes.length, 0); assert.equal(context.revisions.length, 0);
});

test('template projection rejects unknown versions/compositions and never enables extra blocks without a version', () => {
  assert.equal(typeof projection.generalHomeFromTemplate, 'function');
  const current = template();
  assert.equal(projection.generalHomeFromTemplate(current).blocks.length, 10);
  delete current.content.generalHomeCompositionVersion;
  assert.throws(() => projection.generalHomeFromTemplate(current), /верси|композиц/);
  current.blocks = [current.blocks[0]]; assert.equal(projection.generalHomeFromTemplate(current), null);
  current.content.generalHomeCompositionVersion = '99.0.0';
  assert.throws(() => projection.generalHomeFromTemplate(current), /верси/);
  const hidden = template(); hidden.blocks[2].visible = false;
  assert.throws(() => projection.generalHomeFromTemplate(hidden), /десять|состав/);
});

test('public catalog resolves nested HOME variables with real usages and keeps the source snapshot immutable', () => {
  const source = publicationSource(); source.pageTemplates = [template()];
  source.pageTemplates[0].blocks[2].data.evidence.development.text = '{PROVIDER_NAME} — {YEAR}';
  source.pageTemplates[0].blocks[0].data.title = 'Интернет <red>{PROVIDER_NAME}</red>';
  const before = structuredClone(source), catalog = new SiteCatalogService({}).renderSource(source, new Date('2026-10-16T00:00:00Z'));
  assert.ok(catalog.generalHome, 'Public catalog includes versioned HOME');
  assert.equal(catalog.generalHome.blocks[2].data.evidence.development.text, 'Дом.ру — 2026');
  assert.equal(catalog.generalHome.blocks[0].data.title, catalog.homeHero.title);
  assert.deepEqual(source, before);
  const usage = catalog.variableUsages.find(item => item.blockType === 'home.provider_about' && item.code === 'YEAR');
  assert.ok(usage); assert.equal(usage.entityType, 'PAGE_TEMPLATE_BLOCK');
  assert.match(usage.editorHref, /kind=HOME.*block=home.provider_about/);
  assert.equal(catalog.site.connectionHours, 'Ежедневно с 8:00 до 22:00');
  assert.equal(catalog.site.callbackWithinMinutes, 15);
});

test('publication preflight identifies exact HOME block/field before rendering an incomplete composition', () => {
  const source = publicationSource(); source.pageTemplates = [template()];
  source.pageTemplates[0].blocks.at(-1).data.items[0].answer = '';
  const { report } = validatePublicationSource(source, { appVersion: 'test', siteRevision: 8 }, candidate => new SiteCatalogService({}).renderSource(candidate));
  const issue = report.issues.find(issue => issue.code === 'GENERAL_HOME_NOT_READY');
  assert.ok(issue); assert.equal(issue.template, 'HOME'); assert.equal(issue.path, '/');
  assert.equal(issue.block, 'home.faq'); assert.equal(issue.field, 'items.0.answer'); assert.equal(issue.reason, 'REQUIRED');
  assert.equal(issue.severity, 'BLOCKING');
});

test('published catalog fallback is isolated and rejects unknown versions instead of mixing working content', async () => {
  const context = workspace();
  const published = projection.generalHomeFromTemplate(context.published);
  context.prisma.$queryRaw = async () => [{ pageTemplates: null, generalHome: published }];
  assert.equal((await context.controller.generalHome('site-1')).published.blocks[1].data.title, 'Опубликованная проверка');
  published.version = '99.0.0';
  await assert.rejects(context.controller.generalHome('site-1'), error => error.reason === 'VERSION');
});

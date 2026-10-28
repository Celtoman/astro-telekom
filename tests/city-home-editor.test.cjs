const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminPageTemplatesController } = require('../apps/api/dist/admin-page-templates.controller.js');
const { cityHomeDefaultBlocks } = require('../apps/api/dist/city-home-defaults.js');
const { CITY_HOME_METADATA } = require('../apps/api/dist/city-home-model.js');
const { sitePublicDisplayDefaults } = require('../apps/api/dist/site-public-display.js');
function workspace() {
  let template = { id: 'ct', kind: 'CITY_HOME', status: 'PUBLISHED', content: { ...CITY_HOME_METADATA, firstScreenPassportVersion: '1.0.0', tariffCollectionPassportVersion: '1.0.0' },
    blocks: cityHomeDefaultBlocks().map((b, index) => ({ ...b, id: `b${index}`, position: (index + 1) * 10, visible: true })) };
  const published = structuredClone(template); published.blocks[3].data.title = 'Опубликованная помощь';
  const site = { id: 's1', workingRevision: 7, publishedRevision: 6, connectionPhone: '78005557244', supportPhone: '78002507777', settings: { publicDisplay: sitePublicDisplayDefaults() } };
  const writes = [], revisions = [];
  const prisma = {
    site: { findUnique: async ({ where }) => where.id === 's1' ? structuredClone(site) : null },
    pageTemplate: { findUnique: async ({ where }) => where.siteId_kind.siteId === 's1' ? structuredClone(template) : null,
      findUniqueOrThrow: async () => structuredClone(template), update: async ({ data }) => { writes.push('template'); template = { ...template, ...data }; return structuredClone(template); } },
    pageTemplateBlock: { update: async ({ where, data }) => { writes.push(where.id); Object.assign(template.blocks.find(b => b.id === where.id), structuredClone(data)); } },
    $queryRaw: async () => [{ pageTemplates: [structuredClone(published)] }],
  };
  prisma.$transaction = async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); const before = structuredClone(template); try { return await fn(prisma); } catch (error) { template = before; throw error; } };
  const publications = { recordWorkingRevision: async (_tx, input) => { revisions.push(input); return { siteRevision: ++site.workingRevision }; } };
  return { controller: new AdminPageTemplatesController(prisma, publications), prisma, site, writes, revisions, published, current: () => structuredClone(template) };
}
test('guarded CITY workspace separates working and published content and reads shared facts', async () => {
  const ctx = workspace(); assert.equal(typeof ctx.controller.cityHome, 'function');
  assert.equal(Reflect.getMetadata('path', ctx.controller.cityHome), 'city-home-composition');
  const result = await ctx.controller.cityHome('s1');
  assert.equal(result.version, '3.0.0'); assert.equal(result.blocks.length, 10);
  assert.equal(result.published.blocks[3].data.title, 'Опубликованная помощь');
  assert.equal(result.system.publicDisplay.connectionHours, 'Ежедневно с 8:00 до 22:00');
});
test('atomic CITY save preserves identities and composition and records one working revision', async () => {
  const ctx = workspace(), before = ctx.current(), blocks = cityHomeDefaultBlocks();
  blocks[3].data.title = 'Новая помощь'; blocks[8].data.items = [];
  assert.equal(typeof ctx.controller.updateCityHomeComposition, 'function');
  const result = await ctx.controller.updateCityHomeComposition('s1', { expectedWorkingRevision: 7, blocks }, { user: { id: 'editor' } });
  assert.deepEqual(result.missingFields, [{ block: 'city.faq', field: 'items' }]);
  assert.equal(result.workingRevision, 8); assert.equal(ctx.revisions.length, 1); assert.equal(ctx.revisions[0].actorId, 'editor');
  assert.deepEqual(ctx.current().blocks.map(({ id, position, visible }) => ({ id, position, visible })), before.blocks.map(({ id, position, visible }) => ({ id, position, visible })));
  assert.equal(ctx.site.publishedRevision, 6); assert.equal(ctx.published.blocks[3].data.title, 'Опубликованная помощь');
});
test('stale, unsafe, cross-site and client composition overrides fail before writes; parallel conflict is 409', async () => {
  const ctx = workspace(), blocks = cityHomeDefaultBlocks(); assert.equal(typeof ctx.controller.updateCityHomeComposition, 'function');
  await assert.rejects(ctx.controller.updateCityHomeComposition('s1', { expectedWorkingRevision: 6, blocks }), e => e.getStatus() === 409);
  await assert.rejects(ctx.controller.updateCityHomeComposition('other', { expectedWorkingRevision: 7, blocks }), e => e.getStatus() === 404);
  await assert.rejects(ctx.controller.updateCityHomeComposition('s1', { expectedWorkingRevision: 7, blocks, version: '3.0.0' }), e => e.getStatus() === 400);
  blocks[9].data.supportPhone = '123';
  await assert.rejects(ctx.controller.updateCityHomeComposition('s1', { expectedWorkingRevision: 7, blocks }), e => e.block === 'city.contacts' && e.field === 'supportPhone');
  assert.equal(ctx.writes.length, 0); assert.equal(ctx.revisions.length, 0);
  ctx.prisma.$transaction = async () => { throw { code: 'P2034' }; };
  await assert.rejects(ctx.controller.updateCityHomeComposition('s1', { expectedWorkingRevision: 7, blocks: cityHomeDefaultBlocks() }), e => e.getStatus() === 409);
});

test('the legacy composition writer cannot replace v3 identities or change system positions', async () => {
  const ctx = workspace();
  await assert.rejects(ctx.controller.updateCityHome('s1', { expectedWorkingRevision: 7, titleTemplate: 'Город', blocks: ctx.current().blocks }), e => e.getStatus?.() === 400);
  assert.equal(ctx.writes.length, 0); assert.equal(ctx.revisions.length, 0);
});

test('a fresh site creates the complete versioned CITY template without legacy hidden rows', async () => {
  const { ensureCityHomeTemplate } = require('../apps/api/dist/page-template.js');
  const { validateCityHomeComposition } = require('../apps/api/dist/city-home.js');
  let created;
  const tx = { pageTemplate: { findUnique: async () => null, create: async input => { created = input.data; return input.data; } } };
  await ensureCityHomeTemplate(tx, 's1');
  assert.equal(created.content.homeCompositionVersion, '3.0.0');
  assert.equal(created.content.cityHomeImplementationVersion, 'city-home-v3');
  assert.equal(created.blocks.create.length, 10);
  assert.deepEqual(validateCityHomeComposition(created.blocks.create.map(({ blockType, data }) => ({ blockType, data }))), []);
});

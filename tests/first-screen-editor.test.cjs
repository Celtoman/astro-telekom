const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firstScreenDefaults, validateFirstScreen } = require('../apps/api/dist/first-screen.js');
const { AdminPageTemplatesController } = require('../apps/api/dist/admin-page-templates.controller.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
const { cityHomeTemplateBlocks } = require('../apps/api/dist/city-home-template.js');
const { publicationSource, city } = require('./helpers/publication-source.cjs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

test('first-screen migration passes PostgreSQL rollback, preservation and idempotence rehearsal', { timeout: 180_000 }, () => {
  const result = spawnSync(process.execPath, [join(__dirname, '../scripts/rehearse-first-screen-content.mjs')], { encoding: 'utf8', timeout: 170_000 });
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
});

test('first screens accept only their approved fields and own independent address labels', () => {
  for (const kind of ['HOME', 'CITY_HOME']) {
    const data = firstScreenDefaults(kind);
    data.addressPlaceholder = `${kind}: адрес`; data.checkButtonText = `${kind}: проверка`;
    assert.deepEqual(validateFirstScreen(kind, data), []);
    for (const [key, value] of [['minimumPrice', 0], ['ctaHref', '/evil'], ['script', 'alert(1)']]) assert.throws(() => validateFirstScreen(kind, { ...data, [key]: value }), /неизвестные|системные/);
    assert.throws(() => validateFirstScreen(kind, { ...data, title: '<script>' }), /без HTML/);
    assert.throws(() => validateFirstScreen(kind, { ...data, checkButtonText: 'x'.repeat(81) }), /80/);
    assert.throws(() => validateFirstScreen(kind, { ...data, addressPlaceholder: '{YEAR}' }), /только в заголовке/);
  }
  assert.throws(() => validateFirstScreen('HOME', { ...firstScreenDefaults('HOME'), chips: ['one'] }), /три/);
});

test('unsafe images and out-of-context variables fail before saving', () => {
  const data = firstScreenDefaults('HOME');
  for (const image of ['javascript:alert(1)', 'data:image/svg+xml,test', '//evil.test/x', '/images/../secret', '/images/%2e%2e/secret', 'https://user:pass@example.test/x', 'http://example.test/x']) assert.throws(() => validateFirstScreen('HOME', { ...data, image }), /изображ|путь|HTTPS/);
  validateFirstScreen('HOME', { ...data, image: 'https://example.test/image.png?w=640' });
  for (const title of ['{CITY_NAME}', '{TARIFF_PRICE}', '{UNKNOWN}', '{provider_name}', '{YEAR']) assert.throws(() => validateFirstScreen('HOME', { ...data, title }), /Переменная|код|скобок/);
  assert.throws(() => validateFirstScreen('CITY_HOME', { ...firstScreenDefaults('CITY_HOME'), title: '{TARIFF_NAME}' }), /недоступна/);
});

test('incomplete safe content saves as a working draft but cannot pass publication', () => {
  const data = { ...firstScreenDefaults('HOME'), title: '' };
  assert.deepEqual(validateFirstScreen('HOME', data, true), ['title']);
  assert.throws(() => validateFirstScreen('HOME', data), /не готов/);
  const source = publicationSource([city('moskva')]);
  source.pageTemplates = [{ id: 'home-template', kind: 'HOME', blocks: [{ id: 'root-hero', blockType: 'home.hero', data }] }];
  const catalog = new SiteCatalogService({});
  const result = validatePublicationSource(source, { appVersion: 'test', siteRevision: 1 }, (candidate, now) => catalog.renderSource(candidate, now));
  assert.equal(result.report.outcome, 'BLOCKED');
  assert.equal(result.catalog, null);
  assert.ok(result.report.issues.some(issue => issue.code === 'FIRST_SCREEN_NOT_READY'));
  const issue = result.report.issues.find(issue => issue.code === 'FIRST_SCREEN_NOT_READY');
  assert.equal(issue.template, 'HOME');
  assert.equal(issue.block, 'home.hero');
  assert.equal(issue.field, 'title');
  assert.equal(issue.reason, 'REQUIRED');
});

test('catalog resolves template titles but preserves separate root and city form labels', () => {
  const source = publicationSource([city('moskva')]);
  const cityTemplate = { id: 'city-template', kind: 'CITY_HOME', status: 'PUBLISHED', titleTemplate: 'В {CITY_NAME_PREPOSITIONAL}', content: { firstScreenPassportVersion: '1.0.0' }, blocks: cityHomeTemplateBlocks({ name: 'Москва', namePrepositional: 'Москве' }) };
  cityTemplate.blocks[0].data = { ...firstScreenDefaults('CITY_HOME'), addressPlaceholder: 'Адрес города', checkButtonText: 'Проверка города' };
  source.cities[0].pages[0].templateId = cityTemplate.id;
  source.pageTemplates = [cityTemplate, { id: 'root-template', kind: 'HOME', blocks: [{ id: 'root-block', blockType: 'home.hero', data: { ...firstScreenDefaults('HOME'), title: 'Подключение {PROVIDER_NAME}', addressPlaceholder: 'Адрес главной', checkButtonText: 'Проверка главной' } }] }];
  const catalog = new SiteCatalogService({}).renderSource(source);
  assert.equal(catalog.homeHero.title, 'Подключение Дом.ру');
  assert.equal(catalog.homeHero.addressPlaceholder, 'Адрес главной');
  assert.equal(catalog.cities[0].pages[0].blocks[0].data.addressPlaceholder, 'Адрес города');
  assert.equal(catalog.cities[0].pages[0].blocks[0].data.checkButtonText, 'Проверка города');
  assert.equal(catalog.variableUsages.find(usage => usage.path === 'homeHero.title').entityId, 'root-block');
});

test('content update preserves composition, attributes one revision and rejects stale or unsafe writes', async () => {
  let template = { id: 'template', kind: 'CITY_HOME', content: {}, blocks: cityHomeTemplateBlocks({ name: 'Москва' }).map((block, index) => ({ ...block, id: `block-${index}` })) };
  const beforeComposition = template.blocks.map(({ id, blockType, position, visible }) => ({ id, blockType, position, visible }));
  const revisions = []; let writes = 0;
  const tx = {
    site: { findUnique: async () => ({ workingRevision: 8 }) },
    pageTemplate: { findUnique: async () => structuredClone(template), update: async ({ data }) => { template.content = data.content; writes++; }, findUniqueOrThrow: async () => structuredClone(template) },
    pageTemplateBlock: { update: async ({ where, data }) => { Object.assign(template.blocks.find(block => block.id === where.id), data); writes++; } },
  };
  const controller = new AdminPageTemplatesController({ $transaction: async (callback, options) => { assert.equal(options.isolationLevel, 'Serializable'); return callback(tx); } }, { recordWorkingRevision: async (_tx, input) => { revisions.push(input); return { siteRevision: 9 }; } });
  const body = { expectedWorkingRevision: 8, data: { ...firstScreenDefaults('CITY_HOME'), text: '' } };
  await assert.rejects(controller.updateFirstScreen('site', 'CITY_HOME', { ...body, expectedWorkingRevision: 7 }), /ревизия/);
  await assert.rejects(controller.updateFirstScreen('site', 'CITY_HOME', { ...body, blocks: [] }), /контент/);
  await assert.rejects(controller.updateFirstScreen('site', 'HOME', { ...body, data: { title: '<script>' } }), /без HTML/);
  assert.equal(writes, 0);
  const result = await controller.updateFirstScreen('site', 'CITY_HOME', body, { user: { id: 'admin' } });
  assert.deepEqual(result.missingFields, ['text']); assert.equal(result.workingRevision, 9);
  assert.deepEqual(template.blocks.map(({ id, blockType, position, visible }) => ({ id, blockType, position, visible })), beforeComposition);
  assert.equal(revisions.length, 1); assert.equal(revisions[0].actorId, 'admin');
  assert.equal(revisions[0].snapshot.content.firstScreenPassportVersion, '1.0.0');
  assert.equal(revisions[0].snapshot.content.firstScreenImplementationVersion, 'first-screen-editor-v1');
});

test('editor reads published content from immutable validation source instead of current templates', async () => {
  const working = firstScreenDefaults('HOME'); const published = { ...working, checkButtonText: 'Старая подпись' };
  const controller = new AdminPageTemplatesController({
    site: { findUnique: async () => ({ workingRevision: 10, publishedRevision: 4 }) },
    pageTemplate: { findMany: async () => [{ kind: 'HOME', blocks: [{ blockType: 'home.hero', data: working }] }] },
    sitePublication: { findFirst: async () => ({ validation: { sourceSnapshot: { pageTemplates: [{ kind: 'HOME', content: { firstScreenPassportVersion: '1.0.0' }, blocks: [{ blockType: 'home.hero', data: published }] }] } } }) },
  }, {});
  const result = await controller.firstScreens('site');
  assert.equal(result.screens[0].data.checkButtonText, 'Проверить');
  assert.equal(result.screens[0].published.checkButtonText, 'Старая подпись');
  controller.prisma.sitePublication.findFirst = async () => ({ validation: { sourceSnapshot: { pageTemplates: [{ kind: 'HOME', content: {}, blocks: [{ blockType: 'home.hero', data: published }] }] } } });
  assert.equal((await controller.firstScreens('site')).screens[0].published, null);
});

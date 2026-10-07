const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { materializeCityHomeSource } = require('../apps/api/dist/page-template.js');
const { cityHomeTemplateBlocks } = require('../apps/api/dist/city-home-template.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
const { AdminPageTemplatesController } = require('../apps/api/dist/admin-page-templates.controller.js');
const { parseWorkbook } = require('../apps/api/dist/tariff-import.service.js');
const { publicationSource, city } = require('./helpers/publication-source.cjs');

const cityBlock = (block, id, pageId) => ({
  id, pageId, blockType: block.blockType, position: block.position,
  visible: block.visible, data: block.data, source: block.source, archivedAt: null,
});

test('207 city HOME pages render the same public catalog through one site template', async () => {
  const rows = await parseWorkbook(readFileSync(join(__dirname, '..', 'data', 'imports', 'cities.xlsx')), 'cities.xlsx');
  assert.equal(rows.length, 207);
  const cities = rows.map((row, index) => {
    const name = row['Город имен. падеж'];
    const namePrepositional = row['Город предлож. Падеж - dom_ru_v'];
    const slug = new URL(row['URL города']).pathname.slice(1);
    const pageId = `page-${index}`;
    return {
      id: `city-${index}`, siteId: 'site-1', regionId: 'region-1',
      name, namePrepositional, nameGenitive: row['Город родит. Падеж - gorod_v_rodit_padezhe'], slug,
      region: { name: 'Регион', slug: 'region' },
      pages: [{
        id: pageId, siteId: 'site-1', cityId: `city-${index}`, type: 'HOME', slug: '',
        title: `Домашний интернет в ${namePrepositional}`, status: 'PUBLISHED', content: {}, seo: {},
        blocks: cityHomeTemplateBlocks({ name, namePrepositional })
          .map((block, blockIndex) => cityBlock(block, `block-${index}-${blockIndex}`, pageId)),
      }],
      tariffs: [],
    };
  });
  const legacy = publicationSource(cities);
  const templateBlocks = cityHomeTemplateBlocks({ name: '{CITY_NAME_PREPOSITIONAL}', namePrepositional: '{CITY_NAME_PREPOSITIONAL}' })
    .map((block, index) => ({ ...block, id: `template-block-${index}`, templateId: 'template-1' }));
  const migrated = structuredClone(legacy);
  migrated.globalPages = migrated.globalPages.map((page) => ({ ...page, templateId: null }));
  migrated.pageTemplates = [{
    id: 'template-1', siteId: 'site-1', kind: 'CITY_HOME', status: 'PUBLISHED',
    titleTemplate: 'Домашний интернет в {CITY_NAME_PREPOSITIONAL}', content: {}, seo: {}, blocks: templateBlocks,
  }];
  migrated.cities.forEach((city) => { city.pages[0].templateId = 'template-1'; });

  const render = (source) => new SiteCatalogService({}).renderSource(source, new Date('2026-09-25T00:00:00.000Z'));
  const before = render(legacy);
  const after = render(migrated);
  delete before.variableUsages;
  delete after.variableUsages;
  assert.equal(before.cities.length, 207);
  assert.equal(JSON.stringify(after) === JSON.stringify(before), true, '207 публичных городских маршрутов должны быть эквивалентны');
  assert.equal(new Set(migrated.cities.map((city) => city.pages[0].templateId)).size, 1);
});

test('linked city HOME fails closed if its template is missing or not published', () => {
  const source = publicationSource([{ name: 'Казань', pages: [{ type: 'HOME', templateId: 'missing' }] }]);
  assert.throws(() => materializeCityHomeSource(source), /Не найден шаблон/i);
  source.pageTemplates = [{ id: 'missing', kind: 'CITY_HOME', status: 'DRAFT', blocks: [] }];
  assert.throws(() => materializeCityHomeSource(source), /не связана с опубликованным шаблоном/i);
});

test('publication preflight validates effective HOME and renders the original source once', () => {
  const source = publicationSource([city('kazan')]);
  const home = source.cities[0].pages[0];
  home.templateId = 'template-1';
  source.pageTemplates = [{
    id: 'template-1', siteId: 'site-1', kind: 'CITY_HOME', status: 'PUBLISHED',
    titleTemplate: home.title, content: {}, seo: {},
    blocks: home.blocks.map((block) => ({ ...block, id: `template-${block.id}` })),
  }];
  const catalog = new SiteCatalogService({});
  const result = validatePublicationSource(source, {
    appVersion: 'test', siteRevision: 2, now: new Date('2026-09-25T00:00:00.000Z'),
  }, (candidate, now) => catalog.renderSource(candidate, now));
  assert.notEqual(result.report.outcome, 'BLOCKED', JSON.stringify(result.report.issues));
  assert.equal(result.catalog.cities[0].pages[0].blocks.length, 2);
});

test('template edit creates one attributed working revision and rejects stale edits', async () => {
  let writes = 0;
  const revisions = [];
  let template = {
    id: 'template-1', siteId: 'site-1', kind: 'CITY_HOME', status: 'PUBLISHED',
    titleTemplate: 'Старый заголовок', content: {}, seo: {}, blocks: [],
  };
  const tx = {
    site: { findUnique: async () => ({ workingRevision: 10 }) },
    pageTemplate: {
      findUnique: async () => structuredClone(template),
      update: async ({ data }) => { writes += 1; template = { ...template, ...data }; },
      findUniqueOrThrow: async () => structuredClone(template),
    },
    pageTemplateBlock: {
      deleteMany: async () => { writes += 1; },
      createMany: async ({ data }) => { writes += 1; template.blocks = data; },
    },
  };
  const controller = new AdminPageTemplatesController(
    { $transaction: async (callback) => callback(tx) },
    { recordWorkingRevision: async (_tx, revision) => { revisions.push(revision); return { siteRevision: 11 }; } },
  );
  const blocks = cityHomeTemplateBlocks({ name: 'Казань', namePrepositional: '{CITY_NAME_PREPOSITIONAL}' });
  const body = { expectedWorkingRevision: 10, titleTemplate: 'Новый заголовок', blocks };
  await assert.rejects(controller.updateCityHome('site-1', { ...body, expectedWorkingRevision: 9 }), /ревизия сайта изменилась/i);
  assert.equal(writes, 0);
  const result = await controller.updateCityHome('site-1', body, { user: { id: 'editor-1' } });
  assert.equal(result.workingRevision, 11);
  assert.equal(result.blocks.length, 2);
  assert.equal(revisions[0].entityType, 'PAGE_TEMPLATE');
  assert.equal(revisions[0].entityId, 'template-1');
  assert.equal(revisions[0].actorId, 'editor-1');
  assert.deepEqual(revisions[0].changedFields, ['titleTemplate', 'blocks']);
});

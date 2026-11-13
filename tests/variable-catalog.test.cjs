const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = (name) => require(`../apps/api/dist/${name}.js`);

const sources = {
  site: { connectionPhone: '78005557244', supportPhone: '78002507777' },
  provider: { name: 'Дом.ру' },
  now: new Date('2026-09-23T00:00:00.000Z'),
};

const rawCatalog = () => ({
  site: { name: 'Дом.ру', slug: 'domru-site', connectionPhone: '+7 (800) 555-72-44', supportPhone: '+7 (800) 250-77-77' },
  globalPages: [{ id: 'global-1', type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera', title: 'Карта {PROVIDER_NAME}', content: {}, seo: {}, blocks: [] }],
  cities: [{ id: 'city-1', name: 'Казань', nameGenitive: 'Казани', namePrepositional: 'Казани', slug: 'kazan', pages: [
    { id: 'page-1', type: 'HOME', slug: '', title: 'Интернет', content: {}, seo: {}, blocks: [
      { id: 'block-1', blockType: 'hero', data: { title: 'Звоните {CONNECTION_PHONE} в {CITY_NAME_PREPOSITIONAL}' } },
    ] },
  ], tariffs: [{ id: 'tariff-1', cityId: 'city-1', slug: 'giga', name: 'Гига', speed: 500, standardPrice: '799', promoPrice: '599', attributes: { tv_channels_total: 150 }, promoText: 'От {TARIFF_PRICE}', seo: {} }] }],
  routes: [], redirects: [], sitemap: { excludedPaths: [] },
});

test('usage navigation opens only editable Hero fields, keeps site context and preserves immutable evidence', () => {
  const { buildVariableCatalogView } = api('variable-catalog');
  const usage = (overrides) => ({ code: 'PROVIDER_NAME', entityType: 'PAGE_TEMPLATE_BLOCK', entityId: 'hero-1',
    pageType: 'CITY_HOME', blockType: 'hero', path: 'pageTemplates[CITY_HOME].blocks[0].data.title', template: '{PROVIDER_NAME}', editorHref: null, ...overrides });
  const working = { ...rawCatalog(), variableUsages: [usage({}), usage({ pageType: 'HOME', blockType: 'home.hero', path: 'pageTemplates[HOME].blocks[0].data.text' }),
    usage({ path: 'pageTemplates[CITY_HOME].blocks[0].data.ctaText' }), usage({ blockType: 'faq' }), usage({ entityType: 'PAGE_TEMPLATE', path: 'pageTemplates[CITY_HOME].titleTemplate' }),
    usage({ entityType: 'BLOCK', pageType: 'HOME', cityId: 'city-1' }), usage({ blockType: 'tariff_grid', path: 'pageTemplates[CITY_HOME].blocks[1].data.text' })] };
  const published = { ...rawCatalog(), variableUsages: [usage({ entityType: 'BLOCK', pageType: 'HOME', cityId: 'city-1', path: 'cities[0].pages[0].blocks[0].data.title' }), usage({ entityType: 'BLOCK', pageType: 'HOME', cityId: 'city-1', blockType: 'tariff_grid', path: 'cities[0].pages[0].blocks[1].data.title' })], variableUsageVersion: 2 };
  const before = JSON.stringify({ working, published });
  const view = buildVariableCatalogView({ siteId: 'site & 2', workingRevision: 8, publishedRevision: 7, working, published });
  const item = view.items.find(item => item.code === 'PROVIDER_NAME');
  assert.deepEqual(item.workingUsages.map(usage => usage.editorHref), ['/templates/home?kind=CITY_HOME&mode=legacy&siteId=site%20%26%202', '/templates/home?kind=HOME&siteId=site%20%26%202', null, null, null, null, '/templates/tariffs?siteId=site%20%26%202']);
  assert.equal(item.publishedUsages[0].editorHref, '/templates/home?kind=CITY_HOME&mode=legacy&siteId=site%20%26%202');
  assert.equal(item.publishedUsages[1].editorHref, '/templates/tariffs?siteId=site%20%26%202');
  assert.equal(JSON.stringify({ working, published }), before);
  const legacy = buildVariableCatalogView({ siteId: 'site-1', workingRevision: 8, publishedRevision: 7, working, published: rawCatalog() });
  assert.equal(legacy.publishedUsageAvailable, false);
  assert.equal(legacy.items[0].publishedUsages, null);
});

test('registry exposes immutable operator metadata for every implemented code', () => {
  const { listVariableDefinitions } = api('variable-registry');
  const definitions = listVariableDefinitions();
  assert.equal(definitions.length, 19);
  for (const definition of definitions) {
    assert.match(definition.name, /\S/);
    assert.match(definition.description, /\S/);
    assert.match(definition.example, /\S/);
    assert.deepEqual(definition.status, 'ACTIVE');
    assert.ok(definition.allowedContexts.length > 0);
    assert.ok(definition.allowedFields.length > 0);
  }
  assert.deepEqual(definitions.find((item) => item.code === 'TARIFF_PRICE').allowedFields, ['Tariff.promoText', 'SeoTemplate.titleTemplate', 'SeoTemplate.descriptionTemplate', 'SeoTemplate.ogTitleTemplate', 'SeoTemplate.ogDescriptionTemplate']);
  assert.ok(definitions.find((item) => item.code === 'PROVIDER_NAME').allowedFields.includes('SeoTemplate.ogDescriptionTemplate'));
  assert.ok(definitions.every((item) => !item.allowedFields.includes('SeoTemplate.ogImageUrl')));
});

test('resolved catalog retains exact raw usage evidence and typed source snapshot without altering public text', () => {
  const { resolveCatalogVariables } = api('catalog-variables');
  const catalog = resolveCatalogVariables(rawCatalog(), sources);
  assert.equal(catalog.globalPages[0].title, 'Карта Дом.ру');
  assert.equal(catalog.cities[0].pages[0].blocks[0].data.title, 'Звоните +7 (800) 555-72-44 в Казани');
  assert.equal(catalog.variableSources.providerName, 'Дом.ру');
  assert.equal(catalog.variableSources.resolvedAt, '2026-09-23T00:00:00.000Z');
  assert.deepEqual(catalog.variableUsages.map(({ code, path, template, entityType, entityId }) => ({ code, path, template, entityType, entityId })), [
    { code: 'PROVIDER_NAME', path: 'globalPages[0].title', template: 'Карта {PROVIDER_NAME}', entityType: 'PAGE', entityId: 'global-1' },
    { code: 'CONNECTION_PHONE', path: 'cities[0].pages[0].blocks[0].data.title', template: 'Звоните {CONNECTION_PHONE} в {CITY_NAME_PREPOSITIONAL}', entityType: 'BLOCK', entityId: 'block-1' },
    { code: 'CITY_NAME_PREPOSITIONAL', path: 'cities[0].pages[0].blocks[0].data.title', template: 'Звоните {CONNECTION_PHONE} в {CITY_NAME_PREPOSITIONAL}', entityType: 'BLOCK', entityId: 'block-1' },
    { code: 'TARIFF_PRICE', path: 'cities[0].tariffs[0].promoText', template: 'От {TARIFF_PRICE}', entityType: 'TARIFF', entityId: 'tariff-1' },
  ]);
});

test('catalog view compares selected city and tariff working/published values and usages', () => {
  const { resolveCatalogVariables } = api('catalog-variables');
  const { buildVariableCatalogView } = api('variable-catalog');
  const working = resolveCatalogVariables(rawCatalog(), sources);
  const publishedRaw = rawCatalog();
  publishedRaw.site.connectionPhone = '+7 (800) 555-35-35';
  publishedRaw.cities[0].tariffs[0].promoPrice = '499';
  const published = resolveCatalogVariables(publishedRaw, { ...sources, site: { ...sources.site, connectionPhone: '78005553535' } });
  const view = buildVariableCatalogView({ siteId: 'site-1', workingRevision: 8, publishedRevision: 7, working, published, cityId: 'city-1', tariffId: 'tariff-1' });
  assert.equal(view.cities[0].id, 'city-1');
  assert.equal(view.tariffs[0].id, 'tariff-1');
  assert.equal(view.items.length, 19);
  const phone = view.items.find((item) => item.code === 'CONNECTION_PHONE');
  assert.deepEqual([phone.working.value, phone.published.value, phone.changed], ['+7 (800) 555-72-44', '+7 (800) 555-35-35', true]);
  assert.equal(phone.workingUsages.length, 1);
  assert.equal(phone.publishedUsages.length, 1);
  const price = view.items.find((item) => item.code === 'TARIFF_PRICE');
  assert.deepEqual([price.working.value, price.published.value, price.changed], ['599', '499', true]);
  assert.equal(view.publishedUsageAvailable, true);
});

test('missing context is explicit and historical snapshots never fabricate zero published usages', () => {
  const { resolveCatalogVariables } = api('catalog-variables');
  const { buildVariableCatalogView } = api('variable-catalog');
  const working = resolveCatalogVariables(rawCatalog(), sources);
  const historical = { ...working, variableUsages: undefined, variableSources: undefined };
  const view = buildVariableCatalogView({ siteId: 'site-1', workingRevision: 8, publishedRevision: 7, working, published: historical });
  assert.deepEqual(view.items.find((item) => item.code === 'CITY_NAME').working, { status: 'SELECT_CITY', value: null });
  assert.deepEqual(view.items.find((item) => item.code === 'TARIFF_PRICE').working, { status: 'SELECT_CITY', value: null });
  const withCity = buildVariableCatalogView({ siteId: 'site-1', workingRevision: 8, publishedRevision: 7, working, published: historical, cityId: 'city-1' });
  assert.deepEqual(withCity.items.find((item) => item.code === 'TARIFF_PRICE').working, { status: 'SELECT_TARIFF', value: null });
  assert.equal(view.items.find((item) => item.code === 'PROVIDER_NAME').published.status, 'UNAVAILABLE');
  assert.equal(view.publishedUsageAvailable, false);
  assert.equal(view.items.find((item) => item.code === 'CONNECTION_PHONE').publishedUsages, null);
  assert.throws(() => buildVariableCatalogView({ siteId: 'site-1', workingRevision: 8, publishedRevision: 7, working, published: historical, cityId: 'other' }), /город/i);
  assert.throws(() => buildVariableCatalogView({ siteId: 'site-1', workingRevision: 8, publishedRevision: 7, working, published: historical, cityId: 'city-1', tariffId: 'other' }), /тариф/i);
});

test('published SEO template usage completeness is explicit for old and new snapshots', () => {
  const { resolveCatalogVariables } = api('catalog-variables');
  const { buildVariableCatalogView } = api('variable-catalog');
  const working = resolveCatalogVariables(rawCatalog(), sources);
  const base = { siteId: 'site-1', workingRevision: 8, publishedRevision: 7, working };
  const oldView = buildVariableCatalogView({ ...base, published: working });
  assert.equal(oldView.publishedUsageAvailable, true);
  assert.equal(oldView.publishedTemplateUsageAvailable, false);
  const currentView = buildVariableCatalogView({ ...base, published: { ...working, variableUsageVersion: 2 } });
  assert.equal(currentView.publishedTemplateUsageAvailable, true);
});

test('admin catalog endpoint is authenticated, read-only and reads working and successful published snapshots', async () => {
  const { resolveCatalogVariables } = api('catalog-variables');
  const { AdminVariableCatalogController } = api('admin-variable-catalog.controller');
  const working = resolveCatalogVariables(rawCatalog(), sources);
  const templateUsage = { code: 'CONNECTION_PHONE', entityType: 'PAGE_TEMPLATE_BLOCK', entityId: 'template-block-1',
    path: 'pageTemplates[CITY_HOME].blocks[0].data.title', template: 'Звоните {CONNECTION_PHONE}', editorHref: null };
  const calls = [];
  const controller = new AdminVariableCatalogController({
    getVariableContext: async (siteId) => {
      calls.push(['working', siteId]);
      return { siteId, workingRevision: 8, publishedRevision: 7, catalog: working };
    },
    getPublishedVariableContext: async (slug, cityId) => {
      assert.equal(cityId, "city-1");
      calls.push(['published', slug]);
      return working;
    },
  }, { list: async (siteId, revision) => { calls.push(['usages', siteId, revision]); return [templateUsage]; } });
  const response = await controller.list('site-1', 'city-1', 'tariff-1');
  assert.deepEqual(calls, [['working', 'site-1'], ['usages', 'site-1', 8], ['published', 'domru-site']]);
  assert.equal(response.items.find((item) => item.code === 'TARIFF_PRICE').working.value, '599');
  assert.deepEqual(response.items.find((item) => item.code === 'CONNECTION_PHONE').workingUsages, [templateUsage]);
  assert.equal(response.items.find((item) => item.code === 'CONNECTION_PHONE').publishedUsages.length, 1);
  assert.equal(Reflect.getMetadata('path', AdminVariableCatalogController), 'admin/sites/:siteId/variable-catalog');
  assert.equal(Reflect.getMetadata('method', AdminVariableCatalogController.prototype.list), 0);
  assert.ok(Reflect.getMetadata('__guards__', AdminVariableCatalogController)?.length);
  const moduleSource = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../apps/api/src/module.ts'), 'utf8');
  assert.match(moduleSource, /AdminVariableCatalogController/);
});

test('admin exposes a lightweight guarded variable definition list without building a site preview', () => {
  const { AdminVariableCatalogController } = api('admin-variable-catalog.controller');
  const controller = new AdminVariableCatalogController({ getVariableContext: () => assert.fail('preview must not run') }, { list: () => assert.fail('usage scan must not run') });
  const definitions = controller.definitions();
  assert.equal(definitions.length, 19);
  assert.ok(definitions.find((item) => item.code === 'CITY_NAME').allowedFields.includes('SeoTemplate.titleTemplate'));
  assert.equal(Reflect.getMetadata('path', AdminVariableCatalogController.prototype.definitions), 'definitions');
  assert.ok(Reflect.getMetadata('__guards__', AdminVariableCatalogController)?.length);
});

test('read-only working usage scan includes draft pages, hidden blocks and inactive tariffs', async () => {
  const { WorkingVariableUsagesService } = api('working-variable-usages.service');
  const calls = [];
  const transaction = {
    site: { findUnique: async (query) => { calls.push(['site', query]); return { workingRevision: 8 }; } },
    page: { findMany: async (query) => { calls.push(['pages', query]); return [{
      id: 'draft-page', cityId: 'city-1', type: 'HOME', status: 'DRAFT', title: 'В {CITY_NAME}', content: {}, seo: {},
      blocks: [{ id: 'hidden-block', blockType: 'hero', visible: false, archivedAt: null, data: { title: 'Звоните {CONNECTION_PHONE}' } }],
    }]; } },
    pageTemplate: { findMany: async (query) => { calls.push(['pageTemplates', query]); return []; } },
    tariff: { findMany: async (query) => { calls.push(['tariffs', query]); return [{
      id: 'inactive-tariff', cityId: 'city-1', status: 'ARCHIVED', availability: 'ARCHIVED', promoText: 'От {TARIFF_PRICE}', seo: {},
    }]; } },
    seoTemplate: { findMany: async (query) => { calls.push(['seoTemplates', query]); return []; } },
  };
  const service = new WorkingVariableUsagesService({ $transaction: async (callback) => callback(transaction) });
  const usages = await service.list('site-1', 8);
  assert.deepEqual(usages.map((usage) => usage.code), ['CITY_NAME', 'CONNECTION_PHONE', 'TARIFF_PRICE']);
  assert.equal(usages[0].lifecycleStatus, 'DRAFT');
  assert.equal(usages[1].visible, false);
  assert.equal(usages[2].lifecycleStatus, 'ARCHIVED');
  assert.deepEqual(calls.map(([name]) => name), ['site', 'pages', 'pageTemplates', 'tariffs', 'seoTemplates']);
  assert.deepEqual(calls[1][1].where, { siteId: 'site-1' });
  assert.deepEqual(calls[2][1].where, { siteId: 'site-1' });
  assert.deepEqual(calls[3][1].where, { city: { siteId: 'site-1' } });
  assert.deepEqual(calls[4][1].where, { siteId: 'site-1' });
  await assert.rejects(() => service.list('site-1', 7), /ревизи/i);
});

test('working usage scan reads a linked HOME template once and skips obsolete city copies', async () => {
  const { WorkingVariableUsagesService } = api('working-variable-usages.service');
  const transaction = {
    site: { findUnique: async () => ({ workingRevision: 8 }) },
    page: { findMany: async () => [1, 2].map((index) => ({
      id: `home-${index}`, templateId: 'template-1', cityId: `city-${index}`, type: 'HOME', status: 'PUBLISHED',
      title: 'Старая копия {CITY_NAME}', content: {}, blocks: [],
    })) },
    pageTemplate: { findMany: async () => [{
      id: 'template-1', kind: 'CITY_HOME', status: 'PUBLISHED', titleTemplate: 'Интернет в {CITY_NAME_PREPOSITIONAL}', content: {},
      blocks: [{ id: 'template-block-1', blockType: 'hero', visible: false, data: { title: 'Звоните {CONNECTION_PHONE}' } }],
    }] },
    tariff: { findMany: async () => [] },
    seoTemplate: { findMany: async () => [] },
  };
  const service = new WorkingVariableUsagesService({ $transaction: async (callback) => callback(transaction) });
  const usages = await service.list('site-1', 8);
  assert.deepEqual(usages.map(({ code, entityType, entityId, visible }) => ({ code, entityType, entityId, visible })), [
    { code: 'CITY_NAME_PREPOSITIONAL', entityType: 'PAGE_TEMPLATE', entityId: 'template-1', visible: undefined },
    { code: 'CONNECTION_PHONE', entityType: 'PAGE_TEMPLATE_BLOCK', entityId: 'template-block-1', visible: false },
  ]);
});

test('working usage scan includes authored SEO and OG templates once per field with a direct editor link', async () => {
  const { WorkingVariableUsagesService } = api('working-variable-usages.service');
  const transaction = {
    site: { findUnique: async () => ({ workingRevision: 8 }) },
    page: { findMany: async () => [] },
    pageTemplate: { findMany: async () => [] },
    tariff: { findMany: async () => [] },
    seoTemplate: { findMany: async () => [
      { id: 'seo-city', kind: 'CITY_HOME', titleTemplate: 'Интернет {CITY_NAME}', descriptionTemplate: 'Оператор {PROVIDER_NAME}', ogTitleTemplate: '{CITY_NAME}', ogDescriptionTemplate: null },
      { id: 'seo-home', kind: 'HOME', titleTemplate: 'Дом.ру', descriptionTemplate: 'Без переменных', ogTitleTemplate: '', ogDescriptionTemplate: '{PROVIDER_NAME}' },
    ] },
  };
  const service = new WorkingVariableUsagesService({ $transaction: async (callback) => callback(transaction) });
  const usages = await service.list('site-1', 8);
  assert.deepEqual(usages.map(({ code, path, entityType, entityId, editorHref }) => ({ code, path, entityType, entityId, editorHref })), [
    { code: 'CITY_NAME', path: 'seoTemplates[CITY_HOME].titleTemplate', entityType: 'SEO_TEMPLATE', entityId: 'seo-city', editorHref: '/seo/templates?kind=CITY_HOME' },
    { code: 'PROVIDER_NAME', path: 'seoTemplates[CITY_HOME].descriptionTemplate', entityType: 'SEO_TEMPLATE', entityId: 'seo-city', editorHref: '/seo/templates?kind=CITY_HOME' },
    { code: 'CITY_NAME', path: 'seoTemplates[CITY_HOME].ogTitleTemplate', entityType: 'SEO_TEMPLATE', entityId: 'seo-city', editorHref: '/seo/templates?kind=CITY_HOME' },
    { code: 'PROVIDER_NAME', path: 'seoTemplates[HOME].ogDescriptionTemplate', entityType: 'SEO_TEMPLATE', entityId: 'seo-home', editorHref: '/seo/templates?kind=HOME' },
  ]);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
const { publicationSource, city } = require('./helpers/publication-source.cjs');

const fixedNow = new Date('2026-09-24T08:00:00.000Z');
const render = (source, now) => new SiteCatalogService({}).renderSource(source, now);
const input = { appVersion: '0.1.0', requestedById: 'user-1', siteRevision: 7, now: fixedNow };

test('legacy service collections remain valid without relaxing the CITY_HOME passport', () => {
  const source = publicationSource([city('kazan', ['giga'])]);
  const service = { id: 'service-internet', type: 'INTERNET', slug: 'internet', content: {}, seo: {}, blocks: [
    { blockType: 'hero', position: 0, visible: true, data: { title: 'Интернет', text: 'Подключение' } },
    { blockType: 'tariff_grid', position: 1, visible: true, data: { title: 'Тарифы' } },
  ] };
  source.cities[0].pages.push(service);
  const before = structuredClone(source);
  const valid = validatePublicationSource(source, input, render);
  assert.notEqual(valid.report.outcome, 'BLOCKED');
  assert.deepEqual(source, before);
  assert.equal(valid.catalog.routes.some(route => route.path === '/kazan/internet'), false);
  service.blocks[1].data.limit = 99;
  const invalid = validatePublicationSource(source, input, render).report;
  const issue = invalid.issues.find(issue => issue.code === 'SERVICE_PAGE_BLOCKS');
  assert.equal(issue.pageType, 'INTERNET');
  assert.equal(issue.block, 'tariff_grid');
  assert.equal(issue.field, 'limit');
  assert.equal(issue.context, 'SERVICE_DATA');
  assert.equal(issue.path, '/kazan');
  assert.equal(invalid.issues.some(issue => issue.code === 'CATALOG_RENDER'), false);
});

test('collection errors carry the exact field and cause before rendering', () => {
  const { tariffCollectionDefaults } = require('../apps/api/dist/tariff-collection-model.js');
  const source = publicationSource([]);
  source.pageTemplates = [{ kind: 'CITY_HOME', content: { tariffCollectionPassportVersion: '1.0.0' }, blocks: [
    { blockType: 'tariff_grid', visible: true, data: { ...tariffCollectionDefaults(), text: 'a'.repeat(1001) } },
  ] }];
  const result = validatePublicationSource(source, input, () => { throw Error('must not render'); });
  const issue = result.report.issues.find(issue => issue.code === 'TARIFF_COLLECTION_NOT_READY');
  assert.equal(issue.template, 'CITY_HOME');
  assert.equal(issue.block, 'tariff_grid');
  assert.equal(issue.field, 'text');
  assert.equal(issue.reason, 'TOO_LONG');
  assert.match(issue.message, /1001.*1000/);
});

test('validation covers every Release 1 URL and keeps warnings non-blocking', () => {
  const source = publicationSource([city('kazan', ['giga-300', 'giga-500']), city('moskva', ['giga-800'])]);
  const { report, catalog } = validatePublicationSource(source, input, render);

  assert.equal(report.checkedUrlCount, 11);
  assert.deepEqual(report.checkedPaths.slice(-5), ['/kazan', '/kazan/giga-300', '/kazan/giga-500', '/moskva', '/moskva/giga-800']);
  assert.equal(report.appVersion, '0.1.0');
  assert.equal(report.requestedById, 'user-1');
  assert.equal(report.validatedAt, fixedNow.toISOString());
  assert.equal(report.outcome, 'PASSED_WITH_WARNINGS');
  assert.equal(report.issues.every((issue) => issue.severity === 'WARNING'), true);
  assert.equal(catalog.routes.length, report.checkedUrlCount);
});

test('one broken tariff blocks the whole snapshot and other URLs are still checked', () => {
  const source = publicationSource([city('kazan', ['bad-price']), city('moskva', ['good-price'])]);
  source.cities[0].tariffs[0].standardPrice = '0';
  source.cities[1].pages[0].blocks = [];

  const { report, catalog } = validatePublicationSource(source, input, render);

  assert.equal(report.checkedUrlCount, 10);
  assert.equal(report.outcome, 'BLOCKED');
  assert.equal(catalog, null);
  assert.ok(report.issues.some((issue) => issue.path === '/kazan/bad-price' && issue.code === 'TARIFF_CALCULATION'));
  assert.ok(report.issues.some((issue) => issue.path === '/moskva' && issue.code === 'CITY_HOME_BLOCKS'));
  assert.ok(report.checkedPaths.includes('/moskva/good-price'));
});

test('renderer errors block publication with URL, template, block and field diagnostics', () => {
  const source = publicationSource([city('kazan', ['invalid-cinema'])]);
  source.cities[0].tariffs[0].attributes = { online_cinemas: 'unknown' };
  const { report, catalog } = validatePublicationSource(source, input, render);
  const issue = report.issues.find((item) => item.code === 'TARIFF_RENDER');
  assert.equal(report.outcome, 'BLOCKED');
  assert.equal(catalog, null);
  assert.deepEqual({ path: issue.path, template: issue.template, block: issue.block, field: issue.field }, {
    path: '/kazan/invalid-cinema', template: 'CITY_TARIFF_DETAIL', block: 'cinemas', field: 'attributes.online_cinemas',
  });
});

test('route conflicts, missing required page and invalid redirects appear together', () => {
  const source = publicationSource([city('kazan', ['giga', 'giga'])]);
  source.globalPages = source.globalPages.filter((page) => page.type !== 'COOKIE_POLICY');
  source.redirects.push({ id: 'redirect-1', sourcePath: '/kazan', targetPath: '/missing', status: 'PUBLISHED' });

  const { report } = validatePublicationSource(source, input, render);

  assert.equal(report.outcome, 'BLOCKED');
  assert.ok(report.issues.some((issue) => issue.code === 'GLOBAL_PAGE_MISSING'));
  assert.ok(report.issues.some((issue) => issue.code === 'ROUTE_CONFLICT' && issue.path === '/kazan/giga'));
  assert.ok(report.issues.some((issue) => issue.code === 'REDIRECT_ROUTE_CONFLICT' && issue.path === '/kazan'));
  assert.ok(report.issues.some((issue) => issue.code === 'REDIRECT_TARGET_MISSING' && issue.path === '/kazan'));
});

test('the same serialized source and validation time reproduce the same report and catalog', () => {
  const source = publicationSource([city('kazan', ['giga'])]);
  const frozen = JSON.parse(JSON.stringify(source));
  const first = validatePublicationSource(frozen, input, render);
  source.cities[0].tariffs[0].standardPrice = '0';
  const second = validatePublicationSource(JSON.parse(JSON.stringify(frozen)), input, render);

  assert.deepEqual(second, first);
  assert.equal(first.catalog.cities[0].tariffs[0].standardPrice, '700');
});

test('catalog rendering reuses SEO substitutions from validation and keeps cross-route warnings', () => {
  const registry = require('../apps/api/dist/variable-registry.js');
  const source = publicationSource([city('kazan', ['giga', 'fast']), city('moskva', ['giga'])]);
  const tariffTemplate = source.seoTemplates.find((template) => template.kind === 'CITY_TARIFF_DETAIL');
  tariffTemplate.ogTitleTemplate = '{TARIFF_NAME} — {CITY_NAME}';
  tariffTemplate.descriptionTemplate = 'Длинное описание тарифа '.repeat(10);
  tariffTemplate.indexState = 'NOINDEX';
  const expected = validatePublicationSource(source, input, render);
  const original = registry.resolveVariableText;
  let rendering = false;
  let seoRenderCalls = 0;
  registry.resolveVariableText = (value, context, field) => {
    if (rendering && field.path.includes('.seo.')) seoRenderCalls++;
    return original(value, context, field);
  };
  try {
    const service = new SiteCatalogService({});
    const actual = validatePublicationSource(source, input, (value, now, seoCache) => {
      rendering = true;
      try { return service.renderSource(value, now, seoCache); }
      finally { rendering = false; }
    });
    assert.deepEqual(actual, expected);
    assert.equal(seoRenderCalls, 0);
    assert.ok(actual.report.issues.some((issue) =>
      issue.code === 'SEO_DUPLICATE_DESCRIPTION' && issue.path === '/kazan/fast' && issue.relatedPath === '/kazan/giga'));
    assert.ok(actual.report.issues.some((issue) => issue.code === 'SEO_LONG_DESCRIPTION' && issue.path === '/moskva/giga'));
    assert.ok(actual.catalog.sitemap.excludedPaths.includes('/kazan/fast'));
  } finally {
    registry.resolveVariableText = original;
  }
});

test('a changed SEO input during rendering is resolved again at the same path', () => {
  const source = publicationSource([city('kazan', ['giga'])]);
  const service = new SiteCatalogService({});
  const actual = validatePublicationSource(source, input, (value, now, seoCache) => {
    const updated = structuredClone(value);
    updated.cities[0].name = 'Казань';
    updated.seoTemplates.find((template) => template.kind === 'CITY_TARIFF_DETAIL').titleTemplate = '{CITY_NAME} · {TARIFF_NAME}';
    return service.renderSource(updated, now, seoCache);
  });
  assert.equal(actual.catalog.seoByPath['/kazan/giga'].title, 'Казань · giga');
  assert.equal(actual.catalog.seoByPath['/kazan'].title, 'Заголовок CITY_HOME Казань');
});

test('validation retains separate SEO errors and validates even templates without routes before publishing', () => {
  const invalid = publicationSource([city('kazan', ['giga']), city('moskva', ['fast'])]);
  invalid.cities[0].name = '';
  invalid.cities[1].name = '';
  invalid.cities[0].tariffs[0].promoText = '{MISSING_TOKEN}';
  const result = validatePublicationSource(invalid, input, () => { throw Error('must not render'); });
  const seoPaths = result.report.issues.filter((issue) => issue.code === 'SEO_RESOLUTION').map((issue) => issue.path);
  assert.deepEqual(seoPaths, ['/kazan', '/kazan/giga', '/moskva', '/moskva/fast']);
  assert.ok(result.report.issues.some((issue) => issue.code === 'VARIABLE_RESOLUTION' &&
    issue.path === '/kazan/giga' && issue.template === 'CITY_TARIFF_DETAIL' && issue.field === 'promoText'));
  assert.equal(result.catalog, null);

  const unused = publicationSource([city('kazan', ['giga'])]);
  unused.seoTemplates.push({ kind: 'ACCOUNT', indexState: 'INVALID', titleTemplate: 'Аккаунт', descriptionTemplate: 'Описание' });
  const service = new SiteCatalogService({});
  const unrenderable = validatePublicationSource(unused, input, (value, now, seoCache) => service.renderSource(value, now, seoCache));
  assert.equal(unrenderable.report.outcome, 'BLOCKED');
  assert.deepEqual(unrenderable.report.issues.find((issue) => issue.code === 'CATALOG_RENDER'), {
    severity: 'BLOCKING', code: 'CATALOG_RENDER', path: '/', message: 'Неизвестное состояние индексации: ACCOUNT',
  });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
const { publicationSource, city } = require('./helpers/publication-source.cjs');

const fixedNow = new Date('2026-09-24T08:00:00.000Z');
const render = (source, now) => new SiteCatalogService({}).renderSource(source, now);
const input = { appVersion: '0.1.0', requestedById: 'user-1', siteRevision: 7, now: fixedNow };

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

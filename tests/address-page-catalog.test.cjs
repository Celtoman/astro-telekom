const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./city-home-catalog.test.cjs');
const { ADDRESS_PAGE_METADATA, ADDRESS_PAGE_SLUG } = require('../apps/api/dist/address-page-model.js');
const { addressPageDefaultBlocks } = require('../apps/api/dist/address-page-defaults.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
function addressFixture() {
  const source = fixture();
  source.pageTemplates.push({ id: 'address-template', kind: 'CITY_ADDRESS_CHECK', status: 'PUBLISHED', titleTemplate: 'Проверка в {CITY_NAME_PREPOSITIONAL}', content: { ...ADDRESS_PAGE_METADATA },
    blocks: addressPageDefaultBlocks().map((b, i) => ({ ...b, id: `address-${i}`, position: (i + 1) * 10, visible: true })) });
  source.cities[0].pages.push({ id: 'address-page', type: 'ADDRESS_CHECK', status: 'PUBLISHED', slug: ADDRESS_PAGE_SLUG, templateId: 'address-template', blocks: [] });
  source.seoTemplates.push({ kind: 'CITY_ADDRESS_CHECK', titleTemplate: 'Проверка Дом.ру в {CITY_NAME_PREPOSITIONAL}', descriptionTemplate: 'Проверка адреса', indexState: 'INDEX' });
  return source;
}
test('ADDRESS catalog projects independent city copy and exact routes without changing authored source', () => {
  const source = addressFixture(), before = structuredClone(source);
  const result = new SiteCatalogService({}).renderSource(source);
  assert.deepEqual(source, before);
  const route = result.routes.find(r => r.kind === 'CITY_ADDRESS_CHECK');
  assert.equal(route.path, `/kazan/${ADDRESS_PAGE_SLUG}`);
  const page = result.cities[0].pages.find(p => p.type === 'ADDRESS_CHECK');
  assert.equal(page.blocks.length, 8);
  assert.ok(page.blocks[0].data.title.includes('Казани'));
  assert.equal(page.blocks.at(-1).data.items.length, 6);
  assert.ok(result.seoByPath[route.path].title.includes('Казани'));
});
test('ADDRESS preflight includes city routes and accepts the same versioned composition as catalog', () => {
  const result = validatePublicationSource(addressFixture(), { appVersion: 'test', siteRevision: 8 }, (s, now) => new SiteCatalogService({}).renderSource(s, now));
  assert.ok(result.report.checkedPaths.includes(`/kazan/${ADDRESS_PAGE_SLUG}`));
  assert.deepEqual(result.report.issues.filter(i => i.severity === 'BLOCKING'), []);
  assert.ok(result.catalog);
});
test('ADDRESS preflight blocks incomplete copy and preserves field location', () => {
  const source = addressFixture(); source.pageTemplates.at(-1).blocks[2].data.noteTitle = '';
  const result = validatePublicationSource(source, { appVersion: 'test', siteRevision: 9 }, s => new SiteCatalogService({}).renderSource(s));
  assert.equal(result.catalog, null);
  assert.ok(result.report.issues.some(i => i.template === 'CITY_ADDRESS_CHECK' && i.code === 'ADDRESS_TEMPLATE'));
});
module.exports = { addressFixture };

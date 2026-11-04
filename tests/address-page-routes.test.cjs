const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const load = name => existsSync(join(__dirname, `../apps/api/dist/${name}.js`)) ? require(`../apps/api/dist/${name}.js`) : {};
const policy = load('public-route-policy');
const view = load('address-page-view');
const model = load('address-page-model');
const defaults = load('address-page-defaults');
const slug = 'proverka-podklyucheniya-k-domru-po-adresu';
const cities = () => ['moskva', 'perm', 'naberezhnye-chelny'].map((name, i) => ({ id: `city-${i}`, slug: name, name, tariffs: [{ slug: 'internet' }], pages: [{ id: `page-${i}`, type: 'ADDRESS_CHECK', slug, templateId: 'address-template', status: 'PUBLISHED' }] }));
const globals = () => policy.RELEASE_ONE_GLOBAL_PAGES.map(x => ({ ...x }));
const template = () => {
  assert.equal(typeof defaults.addressPageDefaultBlocks, 'function');
  return { id: 'address-template', kind: 'CITY_ADDRESS_CHECK', status: 'PUBLISHED', content: model.ADDRESS_PAGE_METADATA,
    blocks: defaults.addressPageDefaultBlocks().map((x, i) => ({ ...x, id: `block-${i}`, position: (i + 1) * 10, visible: true })) };
};

test('historical snapshots preserve the previous route inventory until ADDRESS is explicitly enabled', () => {
  const routes = policy.buildReleaseOneRoutes(cities(), globals());
  assert.equal(routes.length, 3 + 3 + 6);
  assert.equal(routes.filter(x => x.kind === 'CITY_ADDRESS_CHECK').length, 0);
});

test('new snapshots contain exactly one ADDRESS route per published city and preserve tariff routes', () => {
  const routes = policy.buildReleaseOneRoutes(cities(), globals(), { addressCheck: true });
  assert.equal(routes.length, 2 * 3 + 3 + 6);
  assert.deepEqual(routes.filter(x => x.kind === 'CITY_ADDRESS_CHECK').map(x => ({ id: x.id, path: x.path, citySlug: x.citySlug })), cities().map(x => ({ id: 'CITY_ADDRESS_CHECK', path: `/${x.slug}/${slug}`, citySlug: x.slug })));
  assert.equal(routes.filter(x => x.kind === 'CITY_TARIFF_DETAIL').length, 3);
});

test('ADDRESS slug collisions and missing materialized page context fail before publication', () => {
  const collision = cities(); collision[0].tariffs.push({ slug });
  assert.throws(() => policy.buildReleaseOneRoutes(collision, globals(), { addressCheck: true }), /Конфликт/);
  const missing = cities(); missing[1].pages = [];
  assert.throws(() => policy.buildReleaseOneRoutes(missing, globals(), { addressCheck: true }), /проверки подключения/);
});

test('ADDRESS template projection is strict about versions, row identities and the fixed eight-block structure', () => {
  assert.equal(typeof view.addressPageFromTemplate, 'function', 'versioned ADDRESS projection must exist');
  const value = template(), before = structuredClone(value);
  assert.equal(view.addressPageFromTemplate(value).blocks.length, 8);
  assert.deepEqual(value, before);
  value.content = { ...value.content, addressCheckImplementationVersion: 'unknown' };
  assert.throws(() => view.addressPageFromTemplate(value), e => e.reason === 'VERSION');
  for (const change of [x => { x.blocks[0].visible = false; }, x => { x.blocks[0].position = 11; }, x => { x.blocks[0].id = x.blocks[1].id; }]) {
    const item = template(); change(item); assert.throws(() => view.addressPageFromTemplate(item), e => e.reason === 'COMPOSITION');
  }
});

test('materialization preserves real source page identities and applies only the shared ADDRESS template', () => {
  assert.equal(typeof view.materializeAddressPageSource, 'function', 'ADDRESS materialization must exist');
  const source = { cities: cities(), pageTemplates: [template()] }, before = structuredClone(source);
  const result = view.materializeAddressPageSource(source);
  assert.deepEqual(source, before);
  assert.deepEqual(result.cities.map(x => x.pages[0].id), ['page-0', 'page-1', 'page-2']);
  assert.ok(result.cities.every(x => x.pages[0].blocks.length === 8 && x.pages[0].blocks.every(b => b.pageId === x.pages[0].id)));
  const bad = structuredClone(source); bad.cities[0].pages[0].templateId = 'other';
  assert.throws(() => view.materializeAddressPageSource(bad), /шаблон/);
});

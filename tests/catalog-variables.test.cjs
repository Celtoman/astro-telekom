const { test } = require('node:test');
const assert = require('node:assert/strict');

function resolver() {
  try { return require('../apps/api/dist/catalog-variables.js').resolveCatalogVariables; }
  catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') assert.fail('Разрешение переменных каталога ещё не реализовано');
    throw error;
  }
}

const sources = () => ({
  site: { connectionPhone: '78005557244', supportPhone: '78002507777' },
  provider: { name: 'Дом.ру' },
  now: new Date('2026-09-23T00:00:00.000Z'),
});

const catalog = () => ({
  site: { slug: 'domru-site' },
  globalPages: [{ id: 'global', slug: 'karta-pokrytiya-provaydera', title: 'Карта {PROVIDER_NAME}', content: { text: 'Звоните {CONNECTION_PHONE}' }, seo: { title: 'Карта {YEAR}', description: 'Для {CITY_NAME}' }, blocks: [] }],
  cities: [{ id: 'city', name: 'Казань', nameGenitive: 'Казани', namePrepositional: 'Казани', slug: 'kazan',
    pages: [{ id: 'page', slug: '', title: 'Интернет {CITY_NAME}', content: {}, seo: { title: '{PROVIDER_NAME} в {CITY_NAME_PREPOSITIONAL}' }, blocks: [
      { id: 'block', blockType: 'hero', data: { title: 'Тарифы в {CITY_NAME_PREPOSITIONAL}', ctaText: 'Звоните {CONNECTION_PHONE}', ctaHref: '/kazan' } },
    ] }],
    tariffs: [{ id: 'tariff', slug: 'giga', name: 'Гига', speed: 500, standardPrice: '799', promoPrice: '599.50', attributes: { tv_channels_total: 150 }, promoText: 'От {TARIFF_PRICE} ₽', seo: { title: '{TARIFF_NAME}: {TARIFF_SPEED} Мбит/с', description: '{TARIFF_CHANNELS} каналов' } }],
  }],
  routes: [{ path: '/kazan' }], redirects: [], sitemap: { excludedPaths: [] },
});

test('catalog resolves only editorial fields with city and tariff context, preserving routes and source objects', () => {
  const resolve = resolver();
  const input = catalog();
  const result = resolve(input, sources());
  assert.equal(result.globalPages[0].title, 'Карта Дом.ру');
  assert.equal(result.globalPages[0].content.text, 'Звоните +7 (800) 555-72-44');
  assert.equal(result.globalPages[0].seo.title, 'Карта 2026');
  assert.equal(result.globalPages[0].seo.description, 'Для ');
  assert.equal(result.cities[0].pages[0].blocks[0].data.title, 'Тарифы в Казани');
  assert.equal(result.cities[0].tariffs[0].promoText, 'От 599,5 ₽');
  assert.equal(result.cities[0].tariffs[0].seo.title, 'Гига: 500 Мбит/с');
  assert.equal(result.cities[0].tariffs[0].seo.description, '150 каналов');
  assert.deepEqual(result.variableWarnings, [{ code: 'CITY_NAME', path: 'globalPages[0].seo.description', reason: 'OUT_OF_CONTEXT' }]);
  assert.deepEqual(result.routes, input.routes);
  assert.equal(input.globalPages[0].title, 'Карта {PROVIDER_NAME}');
});

test('catalog blocks unknown variables and variables in URL fields', () => {
  const resolve = resolver();
  const unknown = catalog();
  unknown.cities[0].pages[0].blocks[0].data.title = 'Цена {UNKNOWN}';
  assert.throws(() => resolve(unknown, sources()), /UNKNOWN/);
  const unsafe = catalog();
  unsafe.cities[0].pages[0].blocks[0].data.ctaHref = '/{CITY_NAME}';
  assert.throws(() => resolve(unsafe, sources()), /URL|ссыл/i);
});

test('catalog snapshot value is fixed after source changes', () => {
  const resolve = resolver();
  const first = resolve(catalog(), sources());
  const changed = sources();
  changed.site.connectionPhone = '78005553535';
  const second = resolve(catalog(), changed);
  assert.equal(first.globalPages[0].content.text, 'Звоните +7 (800) 555-72-44');
  assert.equal(second.globalPages[0].content.text, 'Звоните +7 (800) 555-35-35');
});

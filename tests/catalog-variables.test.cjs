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
  assert.deepEqual(result.globalPages[0].seo, {});
  assert.equal(result.cities[0].pages[0].blocks[0].data.title, 'Тарифы в Казани');
  assert.equal(result.cities[0].tariffs[0].promoText, 'От 599,5 ₽');
  assert.deepEqual(result.cities[0].pages[0].seo, {});
  assert.deepEqual(result.cities[0].tariffs[0].seo, {});
  assert.deepEqual(result.variableWarnings, []);
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

test('catalog keeps legacy serialized tariff attributes but still rejects variable tokens there', () => {
  const resolve = resolver();
  const input = catalog();
  const serialized = 'a:4:{i:0;s:3:"ivi";i:1;s:9:"kinopoisk";i:2;s:7:"premier";i:3;s:5:"start";}';
  input.cities[0].tariffs[0].attributes.online_cinemas = serialized;
  const result = resolve(input, sources());
  assert.equal(result.cities[0].tariffs[0].attributes.online_cinemas, serialized);
  input.cities[0].tariffs[0].attributes.online_cinemas = 'a:4:{CITY_NAME}';
  assert.throws(() => resolve(input, sources()), /Переменные запрещены.*online_cinemas/i);
  input.cities[0].tariffs[0].attributes.online_cinemas = '{city_name}';
  assert.throws(() => resolve(input, sources()), /Переменные запрещены.*online_cinemas/i);
  input.cities[0].tariffs[0].attributes = {
    features: [{ name: serialized }, { name: '{CITY_NAME}', alternate: '{YEAR}' }],
    later: '{YEAR}',
  };
  assert.throws(() => resolve(input, sources()), {
    message: 'Переменные запрещены вне редакционного поля или в URL: cities[0].tariffs[0].attributes.features[1].name',
  });
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

test('shared text templates use the current source values, paths and usage owners', () => {
  const resolve = resolver();
  const { VariableTextTemplates } = require('../apps/api/dist/variable-registry.js');
  const templates = new VariableTextTemplates();
  const input = catalog();
  const text = '{CITY_NAME}: {TARIFF_NAME}, {TARIFF_CHANNELS} и {TARIFF_CHANNELS}. {CONNECTION_PHONE}';
  input.globalPages[0].content.text = text;
  input.cities[0].tariffs[0].promoText = text;
  const first = resolve(input, sources(), templates);
  assert.deepEqual(first, resolve(input, sources()));
  assert.match(first.cities[0].tariffs[0].promoText, /Казань: Гига, 150 и 150/);
  assert.equal(first.variableWarnings.filter(item => item.code === 'TARIFF_CHANNELS' && item.reason === 'OUT_OF_CONTEXT').length, 2);

  const next = structuredClone(input);
  next.cities.unshift({ id: 'another-city', name: 'Уфа', pages: [], tariffs: [] });
  next.cities[1].name = 'Самара';
  delete next.cities[1].tariffs[0].attributes.tv_channels_total;
  const nextSources = sources();
  nextSources.site.connectionPhone = '78005553535';
  const second = resolve(next, nextSources, templates);
  assert.deepEqual(second, resolve(next, nextSources));
  assert.match(second.cities[1].tariffs[0].promoText, /Самара: Гига.*555-35-35/);
  assert.deepEqual(second.variableWarnings.filter(item => item.reason === 'EMPTY'), [
    { code: 'TARIFF_CHANNELS', path: 'cities[1].tariffs[0].promoText', reason: 'EMPTY' },
    { code: 'TARIFF_CHANNELS', path: 'cities[1].tariffs[0].promoText', reason: 'EMPTY' },
  ]);
});

test('shared text templates keep error precedence and the failing field path', () => {
  const resolve = resolver();
  const { VariableTextTemplates } = require('../apps/api/dist/variable-registry.js');
  const templates = new VariableTextTemplates();
  const input = catalog();
  const tariff = input.cities[0].tariffs[0];
  const path = 'cities[0].tariffs[0].promoText';
  const expectedError = (text, message) => {
    tariff.promoText = text;
    assert.throws(() => resolve(input, sources()), { message: `${message}: ${path}` });
    assert.throws(() => resolve(input, sources(), templates), { message: `${message}: ${path}` });
  };

  expectedError('{UNKNOWN} {', 'Неверный формат скобок переменной');
  expectedError('<b>{UNKNOWN}</b>', 'HTML-разметка запрещена при подстановке');
  expectedError('https://example.test/{UNKNOWN}', 'Подстановка в ссылки запрещена');
  expectedError('{UNKNOWN}', 'Неизвестный код переменной {UNKNOWN}');
  tariff.promoText = 'Скорость {TARIFF_SPEED}';
  resolve(input, sources(), templates);
  tariff.speed = -1;
  assert.throws(() => resolve(input, sources(), templates), {
    message: `Недопустимое значение переменной {TARIFF_SPEED} в ${path}`,
  });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const load = name => existsSync(join(__dirname, `../apps/api/dist/${name}.js`)) ? require(`../apps/api/dist/${name}.js`) : {};
const model = load('address-page-model');
const validation = load('address-page');
const defaults = load('address-page-defaults');
const order = ['address.intro', 'address.check', 'address.results', 'address.tariffs', 'address.connection_steps', 'address.benefits', 'address.help', 'address.faq'];
const blocks = () => {
  assert.equal(typeof defaults.addressPageDefaultBlocks, 'function', 'approved ADDRESS defaults must exist');
  return defaults.addressPageDefaultBlocks();
};
const validate = (value, options) => {
  assert.equal(typeof validation.validateAddressPageComposition, 'function', 'ADDRESS composition validation must exist');
  return validation.validateAddressPageComposition(value, options);
};
const select = value => {
  assert.equal(typeof model.selectAddressPopularTariffs, 'function', 'ADDRESS category/price selector must exist');
  return model.selectAddressPopularTariffs(value).map(x => x.slug);
};
const tariff = (slug, serviceType, priceAmount, extra = {}) => ({ slug, serviceType, priceAmount, availability: true, ...extra });

test('ADDRESS owns eight editable sections plus shared header/footer and independent fresh defaults', () => {
  assert.equal(model.ADDRESS_PAGE_VERSION, '1.0.0');
  assert.deepEqual(model.ADDRESS_PAGE_BLOCK_ORDER, order);
  const value = blocks(), before = structuredClone(value);
  assert.deepEqual(value.map(x => x.blockType), order);
  assert.deepEqual(validate(value), []);
  assert.deepEqual(value, before);
  value[6].data.title = 'Независимый контент страницы проверки';
  assert.notEqual(blocks()[6].data.title, value[6].data.title);
  assert.ok(value[0].data.title.includes('{CITY_NAME_PREPOSITIONAL}'));
});

test('ADDRESS drafts report exact missing fields and strict publication rejects incomplete content', () => {
  const value = blocks(); value[2].data.items.available.nextText = ''; value[6].data.formTitle = '';
  assert.deepEqual(validate(value, { draft: true }), [
    { block: 'address.results', field: 'items.available.nextText' }, { block: 'address.help', field: 'formTitle' },
  ]);
  assert.throws(() => validate(value), e => e.block === 'address.results' && e.field === 'items.available.nextText' && e.reason === 'REQUIRED');
});

test('ADDRESS rejects unknown versions, changed order, hidden rows and per-page system overrides', () => {
  assert.throws(() => validate(blocks(), { version: '99', draft: true }), e => e.reason === 'VERSION');
  for (const change of [x => x.reverse(), x => x.pop(), x => { x[0].visible = false; }, x => { x[4].data.connectionPhone = '123'; }, x => { x[5].data.items.speed.factText = '100'; }]) {
    const value = blocks(); change(value); assert.throws(() => validate(value, { draft: true }));
  }
  assert.throws(() => validate(new Array(8), { draft: true }), e => e.reason === 'COMPOSITION');
});

test('ADDRESS preserves fixed three results, four steps, six benefits and the six accepted FAQ pairs', () => {
  const value = blocks();
  assert.deepEqual(Object.keys(value[2].data.items), ['available', 'alternatives', 'none']);
  assert.equal(Object.keys(value[4].data.steps).length, 4);
  assert.equal(Object.keys(value[5].data.items).length, 6);
  assert.equal(value[7].data.items.length, 6);
  assert.equal(value[7].data.items[0].answer, 'Выберите город, улицу и дом из подсказок. Если у дома есть корпус или строение, выберите адрес с нужным уточнением. Проверка относится к конкретному дому.');
  assert.equal(value[7].data.items[5].question, 'Можно ли проверить частный дом?');
  value[7].data.items = [];
  assert.deepEqual(validate(value, { draft: true }), [{ block: 'address.faq', field: 'items' }]);
  value[7].data.items = Array.from({ length: 51 }, () => ({ question: 'Вопрос', answer: 'Ответ' }));
  assert.throws(() => validate(value), e => e.reason === 'RANGE');
});

test('ADDRESS fields accept site/city variables, reject selected-tariff tokens and unsafe images', () => {
  const value = blocks(); value[0].data.title = 'Подключение: {CONNECTION_PHONE}, {CITY_NAME_PREPOSITIONAL}';
  assert.deepEqual(validate(value), []);
  value[0].data.title = '{TARIFF_PRICE}';
  assert.throws(() => validate(value), e => e.block === 'address.intro' && e.reason === 'VARIABLE');
  value[0].data.title = 'Проверка подключения'; value[1].data.image = 'javascript:alert(1)';
  assert.throws(() => validate(value), e => e.block === 'address.check' && e.reason === 'URL');
});

test('popular ADDRESS tariffs represent category minima, ignore sticky priority and sort by current price', () => {
  const value = [tariff('sticky-expensive', 'INTERNET', 1800, { isSticky: true }), tariff('internet', 'INTERNET', 400), tariff('tv', 'INTERNET_TV', 600), tariff('game', 'INTERNET_TV', 800, { game: { status: 'INCLUDED' } }), tariff('other', 'INTERNET', 500)];
  const before = structuredClone(value);
  assert.deepEqual(select(value), ['internet', 'tv', 'game']); assert.deepEqual(value, before);
});

test('gaming/category overlap is shown once and the remaining slot is filled by the next cheapest tariff', () => {
  assert.deepEqual(select([tariff('both', 'INTERNET', 400, { game: { status: 'INCLUDED' } }), tariff('next', 'INTERNET', 450), tariff('tv', 'INTERNET_TV', 600)]), ['both', 'next', 'tv']);
});

test('missing categories fill by price; OPTIONAL gaming and pure TV do not displace category winners', () => {
  assert.deepEqual(select([tariff('tv-only', 'TV', 1), tariff('first', 'INTERNET', 400), tariff('second', 'INTERNET', 450, { game: { status: 'OPTIONAL' } }), tariff('third', 'INTERNET', 500), tariff('last', 'INTERNET', 600)]), ['first', 'second', 'third']);
});

test('one/two offers stay one/two, zero price is known, missing/nonfinite prices and unavailable offers are excluded', () => {
  assert.deepEqual(select([tariff('only', 'INTERNET', 0)]), ['only']);
  assert.deepEqual(select([tariff('first', 'INTERNET', 400), tariff('second', 'INTERNET_TV', 500)]), ['first', 'second']);
  assert.deepEqual(select([tariff('unknown', 'INTERNET', null), tariff('nan', 'INTERNET', NaN), tariff('infinity', 'INTERNET', Infinity), tariff('off', 'INTERNET', 1, { availability: false })]), []);
});

test('equal prices retain the published catalog order and slug duplicates do not repeat cards', () => {
  assert.deepEqual(select([tariff('z', 'INTERNET', 500), tariff('a', 'INTERNET_TV', 500), tariff('g', 'INTERNET', 500, { game: { status: 'INCLUDED' } }), tariff('z', 'INTERNET', 500)]), ['z', 'a', 'g']);
});

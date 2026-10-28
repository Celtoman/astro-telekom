const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const load = name => existsSync(join(__dirname, `../apps/api/dist/${name}.js`)) ? require(`../apps/api/dist/${name}.js`) : {};
const model = load('city-home-model');
const validators = load('city-home');
const defaults = load('city-home-defaults');
const blocks = () => {
  assert.equal(typeof defaults.cityHomeDefaultBlocks, 'function', 'CITY_HOME v3 defaults must exist');
  return defaults.cityHomeDefaultBlocks();
};
const validate = (value, options) => {
  assert.equal(typeof validators.validateCityHomeComposition, 'function', 'CITY_HOME v3 validation must exist');
  return validators.validateCityHomeComposition(value, options);
};
const expectedOrder = ['hero', 'tariff_grid', 'city.comparison', 'city.help', 'city.benefits', 'city.connection_steps', 'city.movix', 'city.regional_cities', 'city.faq', 'city.contacts'];

test('CITY_HOME v3 owns the approved ten-block composition, independently of HOME', () => {
  assert.equal(model.CITY_HOME_VERSION, '3.0.0');
  assert.deepEqual(model.CITY_HOME_BLOCK_ORDER, expectedOrder);
  const value = blocks(), before = structuredClone(value);
  assert.deepEqual(value.map(b => b.blockType), expectedOrder);
  assert.deepEqual(validate(value), []);
  assert.deepEqual(value, before);
  value[3].data.title = 'Изменённый текст города';
  assert.notEqual(blocks()[3].data.title, value[3].data.title);
});

test('CITY drafts retain exact missing-field locations, strict publication rejects incomplete content', () => {
  const value = blocks();
  value[3].data.formTitle = '';
  value.at(-1).data.supportTopics = '';
  assert.deepEqual(validate(value, { draft: true }), [
    { block: 'city.help', field: 'formTitle' }, { block: 'city.contacts', field: 'supportTopics' },
  ]);
  assert.throws(() => validate(value), e => e.block === 'city.help' && e.field === 'formTitle' && e.reason === 'REQUIRED');
});

test('unknown versions, compositions and system edits fail even for drafts', () => {
  assert.throws(() => validate(blocks(), { version: '99.0.0', draft: true }), e => e.reason === 'VERSION');
  for (const change of [b => b.pop(), b => b.reverse(), b => b.push(b[0]), b => { b[2] = b[3]; }]) {
    const value = blocks(); change(value);
    assert.throws(() => validate(value, { draft: true }), e => e.reason === 'COMPOSITION');
  }
  for (const [type, field, value] of [
    ['city.contacts', 'connectionPhone', '88001234567'],
    ['city.regional_cities', 'cities', ['Казань']],
    ['city.comparison', 'tariffs', []],
    ['city.help', 'callbackWithinMinutes', 10],
  ]) {
    const content = blocks(); content.find(b => b.blockType === type).data[field] = value;
    assert.throws(() => validate(content, { draft: true }), e => e.block === type && e.field === field && e.reason === 'UNKNOWN_FIELD');
  }
});

test('sparse and inherited composition rows cannot bypass the required ten blocks', () => {
  assert.throws(() => validate(new Array(10), { draft: true }), e => e.reason === 'COMPOSITION');
  const value = blocks();
  value[3] = Object.create(value[3]);
  assert.throws(() => validate(value, { draft: true }), e => e.reason === 'COMPOSITION');
});

test('benefits expose only six fixed title/text cards; facts cannot be overwritten per template', () => {
  const value = blocks(), benefit = value.find(b => b.blockType === 'city.benefits');
  assert.deepEqual(Object.keys(benefit.data.items), ['speed', 'fiber', 'wifi6', 'movix', 'connection', 'support']);
  benefit.data.items.speed.factText = 'До 100 Гбит/с';
  assert.throws(() => validate(value), e => e.block === 'city.benefits' && e.field === 'items.speed.factText' && e.reason === 'UNKNOWN_FIELD');
});

test('CITY text accepts site/city variables and rejects selected-tariff variables and unsafe URLs', () => {
  const value = blocks();
  value[3].data.title = 'Поможем подключиться в {CITY_NAME_PREPOSITIONAL}';
  assert.deepEqual(validate(value), []);
  value[3].data.title = '{TARIFF_PRICE}';
  assert.throws(() => validate(value), e => e.block === 'city.help' && e.field === 'title' && e.reason === 'VARIABLE');
  value[3].data.title = 'Помощь';
  value.find(b => b.blockType === 'city.movix').data.image = 'javascript:alert(1)';
  assert.throws(() => validate(value, { draft: true }), e => e.block === 'city.movix' && e.field === 'image' && e.reason === 'URL');
});

test('FAQ starts with six real answers and supports safe incomplete drafts up to fifty pairs', () => {
  const value = blocks(), faq = value.find(b => b.blockType === 'city.faq');
  assert.equal(faq.data.items.length, 6);
  assert.ok(faq.data.items.every(item => item.answer.length > 30));
  assert.equal(new Set(faq.data.items.map(item => item.answer)).size, 6);
  faq.data.items = [];
  assert.deepEqual(validate(value, { draft: true }), [{ block: 'city.faq', field: 'items' }]);
  assert.throws(() => validate(value), e => e.reason === 'REQUIRED');
  faq.data.items = Array.from({ length: 51 }, () => ({ question: 'Вопрос', answer: 'Ответ' }));
  assert.throws(() => validate(value, { draft: true }), e => e.field === 'items' && e.reason === 'RANGE');
});

test('the catalog keeps configured initialCount and Hero has exactly seven editable fields', () => {
  const value = blocks();
  assert.equal(Object.keys(value[0].data).length, 7);
  value[1].data.initialCount = 9;
  assert.deepEqual(validate(value), []);
  value[1].data.initialCount = 101;
  assert.throws(() => validate(value), e => e.block === 'tariff_grid' && e.field === 'initialCount' && e.reason === 'RANGE');
});

test('city aggregates and shared schedules resolve explicit sources and report missing data', () => {
  const { resolveVariableText, listVariableDefinitions } = load('variable-registry');
  const context = { now: new Date('2026-10-28T00:00:00Z'), city: { name: 'Казань', tariffFacts: { minPrice: 599, maxSpeed: 1000 } }, site: { connectionHours: '8:00–22:00', callbackWithinMinutes: 15 } };
  const result = resolveVariableText('{CITY_MIN_PRICE} / {CITY_MAX_SPEED} / {CONNECTION_HOURS} / {CALLBACK_WITHIN_MINUTES}', context, { path: 'answer', field: 'TEXT' });
  assert.equal(result.text, '599 / 1000 / 8:00–22:00 / 15');
  assert.deepEqual(result.warnings, []);
  const missing = resolveVariableText('{CITY_MAX_CHANNELS}', context, { path: 'answer', field: 'TEXT' });
  assert.equal(missing.text, '');
  assert.deepEqual(missing.warnings, [{ code: 'CITY_MAX_CHANNELS', path: 'answer', reason: 'EMPTY' }]);
  for (const code of ['CITY_MIN_PRICE', 'CITY_MAX_SPEED', 'CITY_MAX_CHANNELS']) assert.equal(listVariableDefinitions().find(item => item.code === code).scope, 'CITY');
});

test('the CMS insertion picker exposes CITY variables in nested CITY titles and FAQ answers', async () => {
  const { listVariableDefinitions } = load('variable-registry');
  const { filterVariableDefinitions } = await import('../apps/admin/src/lib/variable-insertion.mjs');
  const definitions = listVariableDefinitions();
  for (const field of ['PageTemplateBlock.data.items.0.answer', 'PageTemplateBlock.data.items.0.question', 'PageTemplateBlock.data.features.television.text']) {
    const available = filterVariableDefinitions(definitions, field, 'CITY', '');
    assert.ok(available.some(item => item.code === 'CITY_NAME_PREPOSITIONAL'), field);
    assert.ok(available.some(item => item.code === 'CITY_MAX_SPEED'), field);
    assert.ok(!available.some(item => item.code === 'TARIFF_PRICE'), field);
  }
});

test('city facts use the canonical tariff price model including a zero-price promotion', () => {
  const { cityTariffFacts } = load('city-tariff-facts');
  const raw = { slug: 'promo', name: 'Акция', availability: 'ACTIVE', serviceType: 'INTERNET', standardPrice: '799', promoPrice: '0', speed: 500, attributes: {} };
  assert.deepEqual(cityTariffFacts([raw]), { minPrice: 0, maxSpeed: 500, maxChannels: null });
});

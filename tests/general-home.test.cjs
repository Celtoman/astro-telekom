const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { homeHeroDefaults } = require('../apps/api/dist/home-hero-model.js');
const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
const { ContentValidationError, contentErrorLocation } = require('../apps/api/dist/content-validation-error.js');

const load = (name) => existsSync(join(__dirname, `../apps/api/dist/${name}.js`)) ? require(`../apps/api/dist/${name}.js`) : {};
const model = load('general-home-model');
const validators = load('general-home');
const validateBlock = (...args) => {
  assert.equal(typeof validators.validateGeneralHomeBlock, 'function', 'General HOME block contract is implemented');
  return validators.validateGeneralHomeBlock(...args);
};
const validateComposition = (...args) => {
  assert.equal(typeof validators.validateGeneralHomeComposition, 'function', 'General HOME composition contract is implemented');
  return validators.validateGeneralHomeComposition(...args);
};
const { fixtures, composition, order, card } = require('./helpers/general-home.cjs');
const checkError = (fn, block, field, reason) => assert.throws(fn, error => {
  assert.ok(error instanceof ContentValidationError, error);
  assert.deepEqual(contentErrorLocation(error), { field, reason, ...(block ? { block } : {}) });
  return true;
});

test('nine approved HOME passports have verified editors without marking public blocks ACTIVE', () => {
  const passports = BLOCK_PASSPORTS.filter(item => Object.hasOwn(fixtures(), item.id));
  assert.equal(passports.length, 9);
  for (const passport of passports) {
    assert.equal(passport.status, 'APPROVED', passport.id);
    assert.equal(passport.passportVersion, '1.0.0', passport.id);
    assert.equal(passport.editorReadiness, 'READY', passport.id);
    assert.equal(passport.proposedContentScope, 'TEMPLATE');
    assert.deepEqual(passport.proposedAllowedPages, ['HOME']);
    assert.match(passport.approvedBy, /2026-10-16/);
    assert.equal(passport.design.fileKey, 'BdxNHlBVZWejREtOEIWDkI');
    assert.equal(passport.design.variants.length, 3);
  }
  assert.equal(BLOCK_PASSPORTS.find(item => item.id === 'home.hero').passportVersion, '2.0.0');
});

test('composition metadata is independent of Hero and city composition versions', () => {
  assert.equal(model.GENERAL_HOME_VERSION, '1.0.0');
  assert.equal(model.GENERAL_HOME_IMPLEMENTATION, 'general-home-v1');
  assert.deepEqual(model.GENERAL_HOME_METADATA, { generalHomeCompositionVersion: '1.0.0', generalHomeImplementationVersion: 'general-home-v1' });
  assert.deepEqual(model.GENERAL_HOME_BLOCK_ORDER, order);
  assert.deepEqual(model.GENERAL_HOME_BLOCK_TYPES, Object.keys(fixtures()));
});

test('all nine approved payloads and the ordered ten-block composition pass without input mutation', () => {
  const blocks = composition(), before = structuredClone(blocks);
  for (const { blockType, data } of blocks.slice(1)) assert.deepEqual(validateBlock(blockType, data), []);
  assert.deepEqual(validateComposition(blocks), []);
  assert.deepEqual(blocks, before);
});

test('safe incomplete strings are reported in drafts and rejected for publication with exact block paths', () => {
  const data = fixtures()['home.provider_about'];
  data.metrics.network_length.value = '';
  data.evidence.research.sourceUrl = '';
  assert.deepEqual(validateBlock('home.provider_about', data, true), ['metrics.network_length.value', 'evidence.research.sourceUrl']);
  checkError(() => validateBlock('home.provider_about', data), 'home.provider_about', 'metrics.network_length.value', 'REQUIRED');
  data.evidence.research.sourceUrl = 'javascript:alert(1)';
  checkError(() => validateBlock('home.provider_about', data, true), 'home.provider_about', 'evidence.research.sourceUrl', 'URL');
});

test('full draft diagnostics keep the block owner even when fields share the same name', () => {
  const blocks = composition();
  blocks[1].data.title = '';
  blocks.at(-1).data.title = '';
  assert.deepEqual(validateComposition(blocks, '1.0.0', true), [
    { block: 'home.address_check', field: 'title' }, { block: 'home.faq', field: 'title' },
  ]);
  checkError(() => validateComposition(blocks), 'home.address_check', 'title', 'REQUIRED');
  blocks[0].data.title = '';
  checkError(() => validateComposition(blocks), 'home.hero', 'title', 'REQUIRED');
});

test('unknown versions/types, reordered, duplicate, missing and extra blocks never silently fall back', () => {
  checkError(() => validateComposition(composition(), '99.0.0'), null, 'generalHomeCompositionVersion', 'VERSION');
  checkError(() => validateBlock('home.faq', fixtures()['home.faq'], true, '99.0.0'), 'home.faq', 'passportVersion', 'VERSION');
  checkError(() => validateBlock('faq', {}), 'faq', 'blockType', 'UNKNOWN_BLOCK');
  for (const modify of [b => b.pop(), b => b.push(b[1]), b => [b[1], b[0], ...b.slice(2)], b => { b[2] = b[1]; }, b => { b[2].blockType = 'service_grid'; }]) {
    const blocks = composition();
    const result = modify(blocks);
    checkError(() => validateComposition(Array.isArray(result) ? result : blocks, '1.0.0', true), null, 'blocks', 'COMPOSITION');
  }
});

test('fixed semantic records reject removed/added/relabelled keys even in drafts; property order is irrelevant', () => {
  for (const [type, path, key] of [
    ['home.provider_about', 'metrics', 'brand_history'], ['home.benefits', 'items', 'speed'],
    ['home.connection_steps', 'steps', 'request'], ['home.movix', 'features', 'television'],
    ['home.movix', 'cinemas', 'kinopoisk'], ['home.more_possibilities', 'groups', 'payments'],
  ]) {
    const data = fixtures()[type];
    delete data[path][key];
    checkError(() => validateBlock(type, data, true), type, `${path}.${key}`, 'TYPE');
    data[path].invented = {};
    checkError(() => validateBlock(type, data, true), type, `${path}.invented`, 'UNKNOWN_FIELD');
  }
  const data = fixtures()['home.benefits'];
  data.items = Object.fromEntries(Object.entries(data.items).reverse());
  assert.deepEqual(validateBlock('home.benefits', data), []);
  const more = fixtures()['home.more_possibilities'];
  more.groups.payments.items.intercom = card();
  checkError(() => validateBlock('home.more_possibilities', more), 'home.more_possibilities', 'groups.payments.items.intercom', 'UNKNOWN_FIELD');
});

test('system fields, actions, arbitrary wrapper fields and dangerous property names are rejected', () => {
  for (const [type, data] of Object.entries(fixtures())) {
    for (const key of ['connectionPhone', 'action', 'href', 'visible', 'position', 'initialCount', 'consentVersion']) {
      checkError(() => validateBlock(type, { ...data, [key]: 'override' }, true), type, key, 'UNKNOWN_FIELD');
    }
  }
  const data = fixtures()['home.faq'];
  data.items[0].href = '/somewhere';
  checkError(() => validateBlock('home.faq', data), 'home.faq', 'items.0.href', 'UNKNOWN_FIELD');
  const blocks = composition(); blocks[1].visible = false;
  checkError(() => validateComposition(blocks, '1.0.0', true), 'home.address_check', 'blocks.1.visible', 'UNKNOWN_FIELD');
  checkError(() => validateBlock('home.faq', JSON.parse('{"title":"FAQ","items":[],"__proto__":{}}'), true), 'home.faq', '__proto__', 'UNKNOWN_FIELD');
});

test('nested SITE variables are allowed only in declared body/title fields; content is not resolved in the validator', () => {
  const data = fixtures()['home.more_possibilities'];
  data.groups.management.items.app.text = '{PROVIDER_NAME}: {CONNECTION_PHONE}, {SUPPORT_PHONE}, {YEAR}';
  assert.deepEqual(validateBlock('home.more_possibilities', data), []);
  for (const token of ['{CITY_NAME}', '{TARIFF_PRICE}', '{NO_SUCH_VARIABLE}', '{year}', '{YEAR', '{{YEAR}}']) {
    data.groups.management.items.app.text = token;
    checkError(() => validateBlock('home.more_possibilities', data, true), 'home.more_possibilities', 'groups.management.items.app.text', 'VARIABLE');
  }
  for (const [type, key] of [['home.connection_help', 'phoneLabel'], ['home.address_check', 'imageAlt'], ['home.city_directory', 'showMoreText']]) {
    const item = fixtures()[type]; item[key] = '{PROVIDER_NAME}';
    checkError(() => validateBlock(type, item), type, key, 'VARIABLE');
  }
  const faq = fixtures()['home.faq']; faq.items[0].answer = 'https://example.org/{YEAR}';
  checkError(() => validateBlock('home.faq', faq), 'home.faq', 'items.0.answer', 'VARIABLE');
});

test('HTML, red markers, control characters and non-string values are unsafe even in drafts', () => {
  for (const value of ['<script>alert(1)</script>', '<red>Title</red>', '\u000b', '\u001f', '\u007f', 42, null, {}, []]) {
    const data = fixtures()['home.faq']; data.items[0].answer = value;
    checkError(() => validateBlock('home.faq', data, true), 'home.faq', 'items.0.answer', typeof value === 'string' ? 'UNSAFE_TEXT' : 'TYPE');
  }
  const data = fixtures()['home.faq']; data.items[0].answer = 'Строка 1\nСтрока 2\tТекст';
  assert.deepEqual(validateBlock('home.faq', data), []);
  const blocks = composition(); blocks[0].data.title = 'Интернет <red>в вашем городе</red>';
  assert.deepEqual(validateComposition(blocks), []);
});

test('approved length boundaries are enforced on nested and UI text without truncation', () => {
  for (const [type, path, limit] of [
    ['home.faq', ['title'], 250], ['home.address_check', ['intro'], 5000],
    ['home.benefits', ['items', 'speed', 'factText'], 200],
    ['home.provider_about', ['metrics', 'brand_history', 'label'], 1000],
    ['home.connection_help', ['phonePlaceholder'], 120], ['home.connection_help', ['submitButtonText'], 80],
    ['home.address_check', ['imageAlt'], 500], ['home.faq', ['items', 0, 'question'], 2000],
    ['home.faq', ['items', 0, 'answer'], 20000],
  ]) {
    const data = fixtures()[type], owner = path.slice(0, -1).reduce((object, key) => object[key], data), key = path.at(-1);
    owner[key] = 'я'.repeat(limit); assert.deepEqual(validateBlock(type, data), []);
    owner[key] += 'я'; checkError(() => validateBlock(type, data, true), type, path.join('.'), 'TOO_LONG');
  }
});

test('assets allow safe local files and HTTPS; research links require HTTPS; variables and credentials are rejected', () => {
  const type = 'home.address_check';
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,AA', 'http://example.org/a.png', '//example.org/a', '/a/../b.png', '/a/./b.png', '/a/%2e%2e/b', '/a\\b', 'https://user:pass@example.org/a', 'https://example.org/a b', 'https://example.org/{YEAR}', 'https:example.org/a']) {
    const data = fixtures()[type]; data.image = value;
    checkError(() => validateBlock(type, data, true), type, 'image', /[{}]/.test(value) ? 'VARIABLE' : 'URL');
  }
  const data = fixtures()['home.provider_about'];
  data.evidence.research.sourceUrl = '/report';
  checkError(() => validateBlock('home.provider_about', data), 'home.provider_about', 'evidence.research.sourceUrl', 'URL');
  data.evidence.research.sourceUrl = `https://example.org/${'x'.repeat(2048 - 20)}`;
  assert.equal(data.evidence.research.sourceUrl.length, 2048);
  assert.deepEqual(validateBlock('home.provider_about', data), []);
  data.evidence.research.sourceUrl += 'x';
  checkError(() => validateBlock('home.provider_about', data), 'home.provider_about', 'evidence.research.sourceUrl', 'TOO_LONG');
});

test('FAQ supports 0 pairs in draft, 1 through 50 for publication, with complete safe pairs', () => {
  const data = { title: 'FAQ', items: [] };
  assert.deepEqual(validateBlock('home.faq', data, true), ['items']);
  checkError(() => validateBlock('home.faq', data), 'home.faq', 'items', 'REQUIRED');
  data.items = Array.from({ length: 50 }, () => ({ question: 'Вопрос', answer: 'Ответ' }));
  assert.deepEqual(validateBlock('home.faq', data), []);
  data.items.push({ question: 'Ещё', answer: 'Ответ' });
  checkError(() => validateBlock('home.faq', data, true), 'home.faq', 'items', 'RANGE');
  data.items = [{ question: 'Вопрос', answer: '' }];
  assert.deepEqual(validateBlock('home.faq', data, true), ['items.0.answer']);
  checkError(() => validateBlock('home.faq', data), 'home.faq', 'items.0.answer', 'REQUIRED');
});

test('malformed payloads are rejected without coercion or filling invented defaults', () => {
  for (const value of [null, [], '', 1, true, new Date()]) checkError(() => validateBlock('home.faq', value, true), 'home.faq', 'data', 'TYPE');
  const data = fixtures()['home.faq']; delete data.title;
  checkError(() => validateBlock('home.faq', data, true), 'home.faq', 'title', 'TYPE');
  data.title = 'FAQ'; data.items = 'not a list';
  checkError(() => validateBlock('home.faq', data, true), 'home.faq', 'items', 'TYPE');
});

test('sparse arrays cannot bypass composition or FAQ checks', () => {
  checkError(() => validateComposition(Array(10), '1.0.0', true), null, 'blocks.0', 'TYPE');
  const data = fixtures()['home.faq']; data.items = Array(1);
  checkError(() => validateBlock('home.faq', data, true), 'home.faq', 'items.0', 'TYPE');
});

test('composition diagnostics also identify malformed or unknown Hero data without changing its existing validator', () => {
  const blocks = composition(); blocks[0].data = null;
  checkError(() => validateComposition(blocks, '1.0.0', true), 'home.hero', 'data', 'TYPE');
  blocks[0].data = { ...homeHeroDefaults(), action: 'override' };
  checkError(() => validateComposition(blocks, '1.0.0', true), 'home.hero', 'action', 'UNKNOWN_FIELD');
});

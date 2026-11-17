const { test } = require('node:test');
const assert = require('node:assert/strict');

function variables() {
  try {
    return require('../apps/api/dist/variable-registry.js');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') assert.fail('Типизированный движок переменных ещё не реализован');
    throw error;
  }
}

const context = () => ({
  site: { connectionPhone: '78005557244', supportPhone: '78002507777' },
  provider: { name: 'Дом.ру' },
  city: { name: 'Казань', nameGenitive: 'Казани', namePrepositional: 'Казани' },
  tariff: { name: 'Гига 500', speed: 500, standardPrice: '799', promoPrice: '599.50', attributes: { tv_channels_total: 150 } },
  now: new Date('2026-09-23T00:00:00.000Z'),
});

test('SPEED_TEST native text paths derive from schema and extend SITE definitions only', () => {
  const { SPEED_TEST_PAGE_SCHEMA } = require('../apps/api/dist/speed-test-page-model.js');
  const collect = (rule, path = 'Page.content') => rule.kind === 'object'
    ? Object.entries(rule.fields).flatMap(([key, child]) => collect(child, `${path}.${key}`))
    : rule.kind === 'list' ? collect(rule.item, `${path}[]`)
    : rule.variables ? [path] : [];
  const paths = collect(SPEED_TEST_PAGE_SCHEMA);
  assert.ok(paths.includes('Page.content.support.items.results.body'));
  assert.ok(paths.includes('Page.content.faq.items[].answer'));
  assert.ok(!paths.includes('Page.content.version'));
  const definitions = variables().listVariableDefinitions();
  for (const definition of definitions) {
    if (definition.scope === 'SITE') {
      for (const path of paths) assert.ok(definition.allowedFields.includes(path), `${definition.code}: ${path}`);
      assert.ok(definition.allowedFields.includes('Page.title'));
      assert.ok(definition.allowedFields.some(path => path.startsWith('PageTemplateBlock.data.')));
    } else {
      assert.ok(!definition.allowedFields.includes('Page.content.support.items.results.body'));
      assert.equal(definition.allowedFields.includes('Page.content.hero.h1'),definition.scope==='CITY','CITY_SUPPORT shares this path; SPEED_TEST keeps its own SITE validation');
    }
    assert.ok(!definition.allowedFields.includes('Page.content.version'));
    assert.equal(new Set(definition.allowedFields).size, definition.allowedFields.length);
  }
  definitions[0].allowedFields.push('Page.content.untrusted');
  assert.ok(!variables().listVariableDefinitions()[0].allowedFields.includes('Page.content.untrusted'));
});

test('registry has unique fixed codes, explicit types and one authoritative source per code', () => {
  const { listVariableDefinitions } = variables();
  const definitions = listVariableDefinitions();
  assert.ok(definitions.find((item) => item.code === 'CITY_NAME_PREPOSITIONAL').allowedFields.includes('PageTemplate.titleTemplate'));
  const codes = definitions.map((item) => item.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((code) => /^[A-Z0-9_]+$/.test(code)));
  assert.deepEqual(codes, [
    'CONNECTION_PHONE', 'SUPPORT_PHONE', 'CORPORATE_PHONE', 'PROVIDER_NAME', 'CITY_NAME', 'CITY_NAME_GENITIVE',
    'CITY_NAME_PREPOSITIONAL', 'TARIFF_NAME', 'TARIFF_SPEED', 'TARIFF_PRICE', 'TARIFF_CHANNELS', 'YEAR',
    'CONNECTION_HOURS', 'SUPPORT_HOURS', 'ONLINE_APPLICATIONS_HOURS', 'CALLBACK_WITHIN_MINUTES',
    'CITY_MIN_PRICE', 'CITY_MAX_SPEED', 'CITY_MAX_CHANNELS',
  ]);
  assert.ok(definitions.every((item) => ['text', 'number', 'phone', 'date'].includes(item.type) && typeof item.source === 'string' && item.source.length));
  assert.equal(definitions.find((item) => item.code === 'TARIFF_PRICE').source, 'Tariff.effectivePrice');
});

test('resolver uses typed site, provider, city, tariff and publication-time values without units', () => {
  const { resolveVariableText } = variables();
  const input = '{CONNECTION_PHONE} · {SUPPORT_PHONE} · {PROVIDER_NAME} · {CITY_NAME}/{CITY_NAME_GENITIVE}/{CITY_NAME_PREPOSITIONAL} · {TARIFF_NAME} {TARIFF_SPEED} {TARIFF_PRICE} {TARIFF_CHANNELS} · {YEAR}';
  const result = resolveVariableText(input, context(), { path: 'tariff.seo.title', field: 'TEXT' });
  assert.deepEqual(result, {
    text: '+7 (800) 555-72-44 · +7 (800) 250-77-77 · Дом.ру · Казань/Казани/Казани · Гига 500 500 599,5 150 · 2026',
    warnings: [],
  });
});

test('unknown, lowercase, malformed and nested codes fail closed', () => {
  const { resolveVariableText } = variables();
  for (const input of ['{UNKNOWN}', '{city_name}', '{{CITY_NAME}}', '{CITY_{YEAR}}', '{CITY NAME}', '{CITY_NAME']) {
    assert.throws(() => resolveVariableText(input, context(), { path: 'page.title', field: 'TEXT' }), /код|скоб|формат|переменн/i, input);
  }
});

test('known empty and out-of-context codes remove only the token and return located warnings', () => {
  const { resolveVariableText } = variables();
  const incomplete = { ...context(), city: { name: 'Казань', nameGenitive: null, namePrepositional: null }, tariff: undefined };
  const result = resolveVariableText('В {CITY_NAME_GENITIVE}: {TARIFF_NAME}!', incomplete, { path: 'page.blocks[0].data.title', field: 'TEXT' });
  assert.equal(result.text, 'В : !');
  assert.deepEqual(result.warnings, [
    { code: 'CITY_NAME_GENITIVE', path: 'page.blocks[0].data.title', reason: 'EMPTY' },
    { code: 'TARIFF_NAME', path: 'page.blocks[0].data.title', reason: 'OUT_OF_CONTEXT' },
  ]);
});

test('resolver rejects variables in URLs and rejects markup, links, nested tokens and formatting from source values', () => {
  const { resolveVariableText } = variables();
  assert.throws(() => resolveVariableText('/{CITY_NAME}', context(), { path: 'ctaHref', field: 'URL' }), /URL|ссыл/i);
  assert.throws(() => resolveVariableText('https://example.test/{CITY_NAME}', context(), { path: 'text', field: 'TEXT' }), /URL|ссыл/i);
  assert.throws(() => resolveVariableText('//example.test/{CITY_NAME}', context(), { path: 'text', field: 'TEXT' }), /URL|ссыл/i);
  assert.throws(() => resolveVariableText('<b>{CITY_NAME}</b>', context(), { path: 'text', field: 'TEXT' }), /HTML|размет/i);
  for (const name of ['<b>Дом.ру</b>', 'Дом\n.ру', '{CITY_NAME}', 'https://example.test']) {
    assert.throws(() => resolveVariableText('{PROVIDER_NAME}', { ...context(), provider: { name } }, { path: 'title', field: 'TEXT' }), /значен|HTML|формат|ссыл|влож/i);
  }
});

test('blank source values emit EMPTY warnings instead of invisible whitespace', () => {
  const { resolveVariableText } = variables();
  assert.deepEqual(resolveVariableText('В {CITY_NAME_GENITIVE}', { ...context(), city: { name: 'Казань', nameGenitive: '  ' } }, { path: 'title', field: 'TEXT' }), {
    text: 'В ', warnings: [{ code: 'CITY_NAME_GENITIVE', path: 'title', reason: 'EMPTY' }],
  });
});

test('resolver reads only the provided snapshot and never mutates context or template', () => {
  const { resolveVariableText } = variables();
  const source = context();
  const input = 'Цена {TARIFF_PRICE} в {CITY_NAME}';
  const first = resolveVariableText(input, source, { path: 'seo.title', field: 'TEXT' });
  source.tariff.promoPrice = '699';
  const second = resolveVariableText(input, source, { path: 'seo.title', field: 'TEXT' });
  assert.equal(first.text, 'Цена 599,5 в Казань');
  assert.equal(second.text, 'Цена 699 в Казань');
  assert.equal(input, 'Цена {TARIFF_PRICE} в {CITY_NAME}');
});

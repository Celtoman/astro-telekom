const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { GENERAL_HOME_BLOCK_TYPES } = require('../apps/api/dist/general-home-model.js');
const { validateGeneralHomeComposition } = require('../apps/api/dist/general-home.js');
const { homeHeroDefaults } = require('../apps/api/dist/home-hero-model.js');
const path = join(__dirname, '../apps/api/dist/general-home-defaults.js');
const defaults = existsSync(path) ? require(path) : {};
const blocks = () => { assert.equal(typeof defaults.generalHomeDefaultBlocks, 'function'); return defaults.generalHomeDefaultBlocks(); };

test('canonical initial content matches approved Figma, is independent on every call and keeps FAQ an explicit draft', () => {
  const initial = blocks();
  assert.deepEqual(initial.map(block => block.blockType), GENERAL_HOME_BLOCK_TYPES);
  assert.equal(initial[0].data.title, 'Проверьте подключение Дом.ру по адресу');
  assert.equal(initial[1].data.metrics.brand_history.value, '2004');
  assert.equal(initial[4].data.features.devices.title, 'До 5 устройств');
  assert.equal(initial[5].data.groups.management.items.app.title, 'Приложение «Мой Дом.ру»');
  assert.deepEqual(initial.at(-1).data.items, []);
  assert.equal(initial.at(-1).data.title, 'Популярные вопросы');
  const full = [{ blockType: 'home.hero', data: homeHeroDefaults() }, ...initial];
  assert.deepEqual(validateGeneralHomeComposition(full, '1.0.0', true), [{ block: 'home.faq', field: 'items' }]);
  assert.throws(() => validateGeneralHomeComposition(full), error => error.block === 'home.faq' && error.field === 'items');
  initial[0].data.title = 'Changed';
  assert.equal(blocks()[0].data.title, 'Проверьте подключение Дом.ру по адресу');
  assert.doesNotMatch(JSON.stringify(blocks()), /8-800|555-72-44|Показано 24 из 52/);
});

test('initial image fields reference non-empty committed local assets instead of temporary Figma URLs', () => {
  const images = [];
  for (const { data } of blocks()) {
    if (data.image) images.push(data.image);
    if (data.cinemas) images.push(...Object.values(data.cinemas).map(cinema => cinema.image));
  }
  assert.equal(images.length, 8);
  for (const image of images) {
    assert.match(image, /^\/images\/general-home\//);
    const content = readFileSync(join(__dirname, '../apps/web/public', image));
    assert.ok(content.length > 100, image);
    assert.doesNotMatch(image, /figma\.com|\/api\/mcp/);
  }
});

test('migration payload is the versioned initial content and cannot drift from fresh bootstrap defaults', () => {
  const file = join(__dirname, '../prisma/migrations/0061_general_home_composition/migration.sql');
  assert.ok(existsSync(file), 'General HOME data migration exists');
  const sql = readFileSync(file, 'utf8');
  const payload = sql.match(/\$general_home_data\$([\s\S]*?)\$general_home_data\$/);
  assert.ok(payload, 'Immutable JSON payload has an explicit boundary');
  assert.deepEqual(JSON.parse(payload[1]), blocks());
});

test('general HOME data migration preserves Hero, immutable publications and non-target providers on PostgreSQL', { timeout: 240000 }, () => {
  const script = join(__dirname, '../scripts/rehearse-general-home.mjs');
  assert.ok(existsSync(script), 'General HOME migration rehearsal exists');
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 230000, windowsHide: true });
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  assert.match(result.stdout, /guarded migration, idempotence, immutable publication, preserved Hero, isolated providers and atomic API save passed/);
});

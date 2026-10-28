const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { cityHomeDefaultBlocks } = require('../apps/api/dist/city-home-defaults.js');
const { sitePublicDisplayDefaults } = require('../apps/api/dist/site-public-display.js');
const file = join(__dirname, '../prisma/migrations/0062_city_home_composition/migration.sql');
test('working migration payload matches the eight approved new blocks and centralized settings', () => {
  assert.ok(existsSync(file), 'CITY_HOME working migration exists');
  const sql = readFileSync(file, 'utf8');
  const blocks = sql.match(/\$city_home_data\$([\s\S]*?)\$city_home_data\$/);
  const settings = sql.match(/\$site_display_data\$([\s\S]*?)\$site_display_data\$/);
  assert.ok(blocks); assert.ok(settings);
  assert.deepEqual(JSON.parse(blocks[1]), cityHomeDefaultBlocks().slice(2));
  assert.deepEqual(JSON.parse(settings[1]), sitePublicDisplayDefaults());
});
test('CITY initial artwork is committed locally and contains no temporary Figma asset URLs', () => {
  const initial = cityHomeDefaultBlocks();
  assert.doesNotMatch(JSON.stringify(initial), /figma\.com\/api\/mcp/);
  const images = initial.flatMap(({ data }) => [data.image, ...Object.values(data.cinemas ?? {}).map(cinema => cinema.image)].filter(Boolean));
  for (const image of images) assert.ok(readFileSync(join(__dirname, '../apps/web/public', image)).length > 100, image);
});
test('PostgreSQL CITY migration preserves source data and publication, is idempotent and saves atomically', { timeout: 240000 }, () => {
  const script = join(__dirname, '../scripts/rehearse-city-home.mjs');
  assert.ok(existsSync(script), 'CITY migration PostgreSQL rehearsal exists');
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 230000, windowsHide: true });
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  assert.match(result.stdout, /CITY_HOME: migration, idempotence, preserved Hero\/catalog, immutable publication, provider isolation and atomic save passed/);
});

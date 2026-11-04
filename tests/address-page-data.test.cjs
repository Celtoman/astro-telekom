const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { addressPageDefaultBlocks } = require('../apps/api/dist/address-page-defaults.js');
test('ADDRESS migration contains the accepted editable payload with no temporary assets', () => {
  const sql = readFileSync('prisma/migrations/0064_address_page_composition/migration.sql', 'utf8');
  const payload = [...sql.matchAll(/\$address\$([\s\S]*?)\$address\$::jsonb/g)].map(m => JSON.parse(m[1]));
  assert.deepEqual(payload, addressPageDefaultBlocks().map(b => b.data));
  assert.doesNotMatch(JSON.stringify(payload), /figma\.com\/api\/mcp/);
});
test('PostgreSQL ADDRESS rollout preserves authored data and publication and guards canonical collisions', { timeout: 240000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/rehearse-address-page.mjs'], { encoding: 'utf8', timeout: 230000, windowsHide: true });
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  assert.match(result.stdout, /ADDRESS: migration, idempotence, preserved HOME, immutable publication, provider isolation, atomic save and collision rollback passed/);
});

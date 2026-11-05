const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { accountPageDefaults } = require('../apps/api/dist/account-page-defaults.js');
test('ACCOUNT migration payload exactly matches accepted defaults', () => {
  const sql = readFileSync('prisma/migrations/0067_account_page/migration.sql', 'utf8');
  assert.deepEqual(JSON.parse(sql.match(/\$account\$([\s\S]*?)\$account\$::jsonb/)[1]), accountPageDefaults());
  assert.doesNotMatch(sql, /figma\.com\/api\/mcp/);
});
test('PostgreSQL ACCOUNT rollout preserves authored data/snapshots and rejects three canonical collisions', { timeout: 240000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/rehearse-account-page.mjs'], { encoding: 'utf8', timeout: 230000, windowsHide: true });
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  assert.match(result.stdout, /ACCOUNT: fresh seed, migration, idempotence/);
});

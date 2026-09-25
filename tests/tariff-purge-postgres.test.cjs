const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('tariff purge uses real PostgreSQL 18 migrations and relational guards', { timeout: 300_000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/rehearse-tariff-purge.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 300_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /linked history blocked, free archive purged with audit/);
});

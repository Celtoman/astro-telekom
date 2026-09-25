const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = join(__dirname, '..');
const migration = readFileSync(join(root, 'prisma/migrations/0054_drop_legacy_seo_overrides/migration.sql'), 'utf8');

test('0054 locks, rejects nonempty overrides and drops only the three legacy columns', () => {
  assert.match(migration, /BEGIN\s*;/);
  assert.match(migration, /LOCK TABLE "Page", "Tariff", "PageTemplate" IN ACCESS EXCLUSIVE MODE/);
  for (const table of ['Page', 'Tariff', 'PageTemplate']) {
    assert.match(migration, new RegExp(`FROM "${table}" WHERE "seo" IS NOT NULL`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" DROP COLUMN "seo"`));
  }
  assert.match(migration, /RAISE EXCEPTION 'Legacy SEO overrides remain/);
  assert.match(migration, /COMMIT\s*;\s*$/);
  assert.doesNotMatch(migration, /UPDATE\s+"SitePublication"/);
});

test('0054 passes PostgreSQL 18 failure and success rehearsal', { timeout: 180_000 }, () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/rehearse-legacy-seo-cleanup.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 170_000,
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  for (const table of ['Page', 'Tariff', 'PageTemplate']) {
    assert.match(result.stdout, new RegExp(`${table}: nonempty override rejected without schema loss`));
  }
  assert.match(result.stdout, /empty overrides removed transactionally/);
});

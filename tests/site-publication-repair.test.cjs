const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'prisma',
  'migrations',
  '0039_repair_site_publication_revision',
  'migration.sql',
);
const rehearsalPath = path.join(root, 'scripts', 'rehearse-site-publication-repair.mjs');

test('0039 repairs only an equal-revision site whose latest successful catalog has stale identity or contacts', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'forward-only repair migration 0039 must exist');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /BEGIN\s*;/);
  assert.match(migration, /COMMIT\s*;\s*$/);
  assert.match(migration, /LOCK TABLE[\s\S]*"Site"[\s\S]*"ContentRevision"[\s\S]*"AuditEvent"[\s\S]*"SitePublication"[\s\S]*"SiteRebuild"[\s\S]*IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(migration, /"status"\s*=\s*'SUCCEEDED'/);
  assert.match(migration, /"status"\s+IN\s*\('SCHEDULED',\s*'PENDING',\s*'RUNNING'\)/);
  assert.match(migration, /"status"\s+IN\s*\('PENDING',\s*'QUEUED',\s*'RUNNING',\s*'RETRYING'\)/);
  assert.match(migration, /DISTINCT ON\s*\(publication\."siteId"\)/);
  assert.match(migration, /site\."workingRevision"\s*=\s*site\."publishedRevision"/);
  assert.match(migration, /NOT EXISTS\s*\([\s\S]*FROM "ContentRevision" AS prepared[\s\S]*prepared\."siteRevision"\s*>\s*site\."publishedRevision"/);
  assert.match(migration, /catalog\s*#>>\s*'\{site,name\}'/);
  assert.match(migration, /catalog\s*#>>\s*'\{site,slug\}'/);
  assert.match(migration, /catalog\s*#>>\s*'\{site,connectionPhone\}'/);
  assert.match(migration, /catalog\s*#>>\s*'\{site,supportPhone\}'/);
  assert.match(migration, /"workingRevision"\s*=\s*repair\."nextRevision"/);
  assert.match(migration, /INSERT INTO "ContentRevision"/);
  assert.match(migration, /INSERT INTO "AuditEvent"/);
  assert.match(migration, /migration:0039_repair_site_publication_revision/);
  assert.doesNotMatch(migration, /UPDATE\s+"SitePublication"/);
  assert.doesNotMatch(migration, /INSERT INTO\s+"SitePublication"/);
});

test('0039 has a PostgreSQL 18 rehearsal for broken, published, prepared and clean sites', () => {
  assert.equal(fs.existsSync(rehearsalPath), true, 'production-like PostgreSQL rehearsal must exist');
  const rehearsal = fs.readFileSync(rehearsalPath, 'utf8');

  assert.match(rehearsal, /postgres:18\.6-alpine/);
  assert.match(rehearsal, /legacy-broken/);
  assert.match(rehearsal, /published-repaired/);
  assert.match(rehearsal, /prepared-repair/);
  assert.match(rehearsal, /clean-site/);
  assert.match(rehearsal, /workingRevision/);
  assert.match(rehearsal, /publishedRevision/);
  assert.match(rehearsal, /ContentRevision/);
  assert.match(rehearsal, /AuditEvent/);
  assert.match(rehearsal, /SitePublication/);
  assert.match(rehearsal, /expectMigrationFailure/);
  assert.match(rehearsal, /publicationsBefore/);
  assert.match(rehearsal, /repairRevision/);
  assert.match(rehearsal, /repairAudit/);
});

test('0039 passes its production-like PostgreSQL 18 rehearsal', { timeout: 180_000 }, () => {
  const result = spawnSync(process.execPath, [rehearsalPath], {
    cwd: root,
    encoding: 'utf8',
    timeout: 170_000,
  });
  const details = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim();

  assert.equal(result.status, 0, details || 'PostgreSQL 18 rehearsal exited without a status');
  assert.match(result.stdout, /active work rejected/);
  assert.match(result.stdout, /legacy-broken repaired once/);
  assert.match(result.stdout, /published, prepared and clean sites unchanged/);
});

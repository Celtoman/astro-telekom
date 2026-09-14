import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const repositoryRoot = process.cwd();
const auditPath = join(repositoryRoot, 'scripts', 'release-one-database-audit.sql');
const runbookPath = join(repositoryRoot, 'docs', 'runbooks', 'release-one-data-migration.md');

test('Release 1 database audit exists and executes inside a read-only transaction', () => {
  assert.equal(existsSync(auditPath), true, 'scripts/release-one-database-audit.sql is missing');
  const sql = readFileSync(auditPath, 'utf8');

  assert.match(sql, /BEGIN\s+TRANSACTION\s+READ\s+ONLY\s*;/i);
  assert.match(sql, /ROLLBACK\s*;\s*$/i);

  const executableSql = sql.replace(/^\s*--.*$/gm, '');
  assert.doesNotMatch(executableSql, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY)\b/i);
});

test('Release 1 database audit reports counts, route blockers and relation integrity', () => {
  assert.equal(existsSync(auditPath), true, 'scripts/release-one-database-audit.sql is missing');
  const sql = readFileSync(auditPath, 'utf8');

  for (const requiredCheck of [
    'applied_migrations',
    'sites_total',
    'sites_by_status',
    'cities_total',
    'cities_by_status',
    'pages_total',
    'pages_by_type_status',
    'page_blocks_total',
    'tariffs_total',
    'tariffs_by_status',
    'address_checks_total',
    'leads_total',
    'leads_by_status',
    'redirects_total',
    'redirects_by_status',
    'global_page_inventory',
    'published_tariff_detail_routes',
    'invalid_published_city_home_templates',
    'city_global_slug_collisions',
    'redirect_source_route_collisions',
    'redirect_targets_outside_release_one',
    'relation_integrity_violations',
  ]) {
    assert.match(sql, new RegExp(`'${requiredCheck}'`), `missing ${requiredCheck}`);
  }

  assert.match(sql, /karta-pokrytiya-provaydera/);
  assert.match(sql, /goroda-obsluzhivaniya/);
  assert.match(sql, /politika-konfidencialnosti/);
  assert.match(sql, /soglasie-na-obrabotku-personalnyh-dannyh/);
  assert.match(sql, /politika-obrabotki-faylov-kuki/);
  assert.match(sql, /ARRAY\['hero', 'service_grid', 'tariff_grid', 'steps', 'feature_grid', 'feature_grid', 'faq'\]::text\[\]/);
  assert.match(sql, /FILTER \(WHERE page_block\."visible"\)/);
  assert.match(sql, /ORDER BY page_block\."position", page_block\."id"/);
  assert.match(sql, /'\/' \|\| city\."slug" \|\| '\/' \|\| tariff\."slug"/);
});

test('Release 1 migration runbook requires backup and comparable pre/post audit evidence', () => {
  assert.equal(existsSync(runbookPath), true, 'Release 1 migration runbook is missing');
  const runbook = readFileSync(runbookPath, 'utf8');
  const deployment = readFileSync(join(repositoryRoot, 'docs', 'deployment.md'), 'utf8');

  assert.match(runbook, /pg_dump/);
  assert.match(runbook, /pre-migration/i);
  assert.match(runbook, /post-migration/i);
  assert.match(runbook, /release-one-database-audit\.sql/);
  assert.match(runbook, /invalid_published_city_home_templates/);
  assert.match(runbook, /page_blocks_total/);
  assert.match(runbook, /relation_integrity_violations/);
  assert.match(runbook, /N \+ T \+ 6/);
  assert.match(deployment, /runbooks\/release-one-data-migration\.md/);
});

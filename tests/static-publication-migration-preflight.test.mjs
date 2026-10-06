import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bindMigrationSnapshot, migrationHtmlContract, verifyLegacyMigration } from '../scripts/static-publication-migration-preflight.mjs';

const html = '<html><head><title>Тариф</title><meta name="description" content="Интернет"><link rel="canonical" href="https://example.test/kazan"></head><body><h1>Интернет</h1><a href="/kazan">Казань</a><p>700 &#8381;</p><script>private()</script></body></html>';
test('migration compares complete rendered content, SEO and links while ignoring code asset scopes', () => {
  assert.deepEqual(migrationHtmlContract(html), migrationHtmlContract(html.replace('<h1>', '<h1 class="astro-new">').replace('private()', 'newCode()')));
  for (const [oldValue, newValue] of [['700', '9999'], ['content="Интернет"', 'content="Другое"'], ['href="/kazan"', 'href="/moscow"'], ['<title>Тариф', '<title>Черновик']]) {
    assert.notDeepEqual(migrationHtmlContract(html), migrationHtmlContract(html.replace(oldValue, newValue)));
  }
  assert.throws(() => migrationHtmlContract('<html></html>'), /body/);
});

test('migration proof binds the full snapshot even when public catalog omits diagnostics', async () => {
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const publication = { publicationId: 'publication-7', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7 };
  const publicCatalog = { site: { slug: publication.siteSlug }, routes: [{ path: '/' }], cities: [] };
  const catalog = { ...publicCatalog, variableUsages: [{ source: 'title' }], variableSources: [], variableWarnings: [], seoWarnings: [], variableUsageVersion: 2 };
  const snapshot = { ...publication, catalog, catalogDigest: digest(catalog) };
  const bound = bindMigrationSnapshot({ publication, snapshot, publicCatalog });
  assert.equal(bound.snapshot.catalogDigest, digest(catalog));
  assert.equal(bound.publicCatalogDigest, digest(publicCatalog));
  assert.notEqual(bound.snapshot.catalogDigest, bound.publicCatalogDigest);
  assert.throws(() => bindMigrationSnapshot({ publication, snapshot: { ...snapshot, catalogDigest: digest(publicCatalog) }, publicCatalog }), /digest mismatch/);
  assert.throws(() => bindMigrationSnapshot({ publication, snapshot: { ...snapshot, siteRevision: 8 }, publicCatalog }), /identity mismatch/);
  assert.throws(() => bindMigrationSnapshot({ publication, snapshot, publicCatalog: { ...publicCatalog, cities: ['unpublished'] } }), /differs/);
  await assert.rejects(verifyLegacyMigration({ snapshot, readState: async () => ({ ...publication, catalogDigest: bound.publicCatalogDigest }) }), /full immutable snapshot/);
  // A snapshot without optional diagnostics remains valid; hashes then coincide.
  assert.equal(bindMigrationSnapshot({ publication, snapshot: { ...publication, catalog: publicCatalog, catalogDigest: digest(publicCatalog) }, publicCatalog }).publicCatalogDigest, digest(publicCatalog));
});

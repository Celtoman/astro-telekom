import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('real Astro builder seals the exact saved catalog with versioned assets and intact inline CSP', { timeout: 180000 }, async () => {
  const { StaticArtifactBuilder } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { publicationSource, city } = require('./helpers/publication-source.cjs');
  const source = publicationSource([city('kazan')]);
  // The builder receives the real API renderer's publication contract, not demo fallback.
  source.cities[0].status = 'PUBLISHED'; source.cities[0].pages[0].status = 'PUBLISHED';
  for (const page of source.globalPages) page.status = 'PUBLISHED';
  const catalog = new SiteCatalogService({}).renderSource(source, new Date('2026-10-06T00:00:00Z'));
  const bundle = { publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7,
    catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), catalog };
  const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url));
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'astro-builder-test-'));
  let calls = 0;
  try {
    const builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl: 'http://api.internal/api/v1', adminToken: 'synthetic',
      publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' },
      fetchImpl: async (url, options) => { calls++; assert.equal(url, 'http://api.internal/api/v1/internal/site-publications/domru-site/snapshots/pub-a'); assert.equal(options.headers['x-admin-token'], 'synthetic'); return Response.json(bundle); } });
    const job = { publicationId: 'pub-a', siteSlug: 'domru-site', siteId: 'site-1', rebuildId: 'rebuild-1', rebuildRevision: 1 };
    const artifact = await builder.build(job);
    assert.equal(artifact.siteRevision, 7); assert.equal(artifact.catalogDigest, bundle.catalogDigest);
    const html = await readFile(join(root, 'releases', artifact.artifactId, 'index.html'), 'utf8');
    const prefix = `/__publication_assets/${artifact.artifactId}`;
    assert.ok(html.includes(`${prefix}/images/figma/domru-logo.png`));
    assert.ok(html.includes(`${prefix}/favicon.ico`));
    assert.match(html, new RegExp(`${prefix}/_astro/[^" ]+\\.css`));
    for (const [, attributes, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(attributes)) continue;
      const hash = createHash('sha256').update(content).digest('base64');
      assert.ok(html.includes(`sha256-${hash}`), 'Inline CSP was broken by asset versioning');
    }
    // Working catalog mutation after the capture cannot change this immutable artifact.
    assert.deepEqual(await builder.build(job), artifact); assert.equal(calls, 2);
    assert.ok(artifact.files.every(file => !file.path.includes('snapshot') && !file.path.endsWith('.caddy')));
    bundle.publicationId = 'foreign-publication';
    await assert.rejects(builder.build(job), /snapshot.*identity/i);
    bundle.publicationId = job.publicationId;
    bundle.catalogDigest = '0'.repeat(64);
    await assert.rejects(builder.build(job), /snapshot|digest/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('disk admission rejects a new build before touching private build files', async () => {
  const { requireBuildSpace } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const minimum = 8 * 1024 ** 3;
  await assert.rejects(requireBuildSpace('.', async () => ({ bavail: minimum - 1, bsize: 1 })), error =>
    error.code === 'PUBLICATION_BUILD_SPACE' && error.httpStatus === 503 && /disk space/i.test(error.message));
  await assert.doesNotReject(requireBuildSpace('.', async () => ({ bavail: minimum, bsize: 1 })));
  await assert.rejects(requireBuildSpace('.', async () => { throw new Error('filesystem unavailable'); }), /filesystem unavailable/);
});

test('renderer identity binds normalized serving settings without exposing proxy tokens', async () => {
  const { StaticArtifactBuilder } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const { servingOptionsDigest } = await import('../apps/web/scripts/publication/serving-config.mjs');
  const publicEnv = { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' };
  const options = { publicationToken: 'private-proxy-token-'.repeat(3) };
  const identities = await Promise.all([options, { ...options, testMode: true, apiUpstream: 'api:3000' },
    { ...options, testMode: false }, { ...options, apiUpstream: 'api-next:3000' }, { ...options, publicationToken: 'rotated-proxy-token-'.repeat(3) }]
    .map(settings => new StaticArtifactBuilder({ publicationRoot: '.', apiUrl: 'http://api/api/v1', adminToken: 'fixture', publicEnv,
      servingContextDigest: servingOptionsDigest(settings) }).renderer));
  assert.equal(identities[0], identities[1], 'Equivalent defaults changed renderer identity');
  for (const identity of identities.slice(2)) assert.notEqual(identity, identities[0]);
  assert.ok(identities.every(identity => /^[a-f0-9]{64}$/.test(identity)));
});

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
      // A small positive fixture must not depend on space left by other Docker suites.
      // The same builder is explicitly checked with a zero-space probe below.
      spaceProbe: async () => ({ bavail: 8 * 1024 ** 3, bsize: 1 }),
      publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' },
      fetchImpl: async (url, options) => { calls++; assert.equal(url, 'http://api.internal/api/v1/internal/site-publications/domru-site/snapshots/pub-a'); assert.equal(options.headers['x-admin-token'], 'synthetic'); return Response.json(bundle); } });
    const job = { publicationId: 'pub-a', siteSlug: 'domru-site', siteId: 'site-1', rebuildId: 'rebuild-1', rebuildRevision: 1 };
    const originalProbe = builder.spaceProbe;
    builder.spaceProbe = async () => ({ bavail: 0, bsize: 1 });
    await assert.rejects(builder.build(job), /Insufficient disk space/);
    await assert.rejects(lstat(join(root, 'builds')), { code: 'ENOENT' });
    builder.spaceProbe = originalProbe; calls = 0;
    const progress = [];
    const artifact = await builder.build(job, async event => { progress.push(event); });
    assert.ok(progress.some(event => event.stage === 'BUILDING' && event.completedPages > 0));
    assert.ok(progress.some(event => event.stage === 'CHECKING' && event.completedPages > 0));
    assert.equal(progress.filter(event => event.stage === 'CHECKING').at(-1).completedPages, catalog.routes.length + 1);
    assert.equal(artifact.siteRevision, 7); assert.equal(artifact.catalogDigest, bundle.catalogDigest);
    const html = await readFile(join(root, 'releases', artifact.artifactId, 'index.html'), 'utf8');
    const prefix = `/__publication_assets/${artifact.artifactId}`;
    assert.ok(html.includes(`${prefix}/images/figma/domru-logo.png`));
    assert.ok(html.includes(`${prefix}/favicon.ico`));
    assert.ok(html.includes('href="/favicon-96x96.png"'));
    assert.ok(html.includes(`${prefix}/apple-touch-icon.png`));
    assert.ok(html.includes('href="/site.webmanifest"'));
    const manifest = JSON.parse(await readFile(join(root, 'releases', artifact.artifactId, 'site.webmanifest'), 'utf8'));
    assert.equal(manifest.name, catalog.site.name);
    assert.equal(manifest.display, 'browser');
    assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
    assert.deepEqual(manifest.icons.map(icon => icon.src), [192, 512].map(size => `${prefix}/web-app-manifest-${size}x${size}.png`));
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

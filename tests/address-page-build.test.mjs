import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
test('immutable ADDRESS snapshot builds every city, SEO, FLOW2, shared cards and shell', { timeout: 240000 }, async () => {
  const { StaticArtifactBuilder } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { addressPageSource } = require('./helpers/address-page-source.cjs');
  const { ADDRESS_PAGE_SLUG } = require('../apps/api/dist/address-page-model.js');
  const catalog = new SiteCatalogService({}).renderSource(addressPageSource());
  const bundle = { publicationId: 'pub-address-v1', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 9, catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), catalog };
  const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url)); await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'address-builder-test-'));
  try {
    const builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl: 'http://api.internal/api/v1', adminToken: 'synthetic', publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' }, fetchImpl: async () => Response.json(bundle) });
    const artifact = await builder.build({ publicationId: bundle.publicationId, siteSlug: bundle.siteSlug, siteId: bundle.siteId, rebuildId: 'address-v1', rebuildRevision: 1 });
    const directory = join(root, 'releases', artifact.artifactId);
    const sitemap = await readFile(join(directory, 'sitemap-pages.xml'), 'utf8');
    for (const city of catalog.cities) {
      const html = await readFile(join(directory, city.slug, ADDRESS_PAGE_SLUG, 'index.html'), 'utf8');
      assert.equal((html.match(/<h1\b/g) || []).length, 1);
      assert.deepEqual([...html.matchAll(/<div\b[^>]*data-address-block="([^"]+)"/g)].map(m => m[1]), ['address.intro','address.check','address.results','address.tariffs','address.connection_steps','address.benefits','address.help','address.faq']);
      assert.match(html, /data-address-page-composition/); assert.match(html, /data-callback-trigger/); assert.match(html, /data-general-home-footer/);
      assert.ok(html.includes(`data-page-slug="${ADDRESS_PAGE_SLUG}"`));
      assert.ok(html.includes(`https://partner.example.test/${city.slug}/${ADDRESS_PAGE_SLUG}`));
      assert.ok(sitemap.includes(`/${city.slug}/${ADDRESS_PAGE_SLUG}`));
      assert.match(html, /class="home-faq-item" open/);
      assert.doesNotMatch(html, /figma\.com\/api\/mcp|\{CITY_/);
    }
    for (const icon of ['available','alternatives','none','retry']) assert.ok((await readFile(join(directory, `images/address-page/${icon}.svg`))).length > 100);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(temporary) + sep)); await rm(root, { recursive: true, force: true });
  }
});

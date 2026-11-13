import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
test('OFFICIAL_SITE immutable artifact preserves old snapshots and adds only its optional route with seven image slots and scroll regions', { timeout: 360000 }, async () => {
  const { StaticArtifactBuilder } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { officialSiteSource } = require('./helpers/official-site-source.cjs');
  const { accountPageSource } = require('./helpers/account-page-source.cjs');
  const { OFFICIAL_SITE_PAGE_SLUG } = require('../apps/api/dist/official-site-page-model.js');
  const service = new SiteCatalogService({});
  const catalog = service.renderSource(officialSiteSource()), oldCatalog = service.renderSource(accountPageSource());
  let bundle;
  const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url)); await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'official-site-builder-test-'));
  const makeBundle = (data, id) => ({ publicationId: id, siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 9, catalogDigest: digest(data), catalog: data });
  try {
    // The positive fixture follows the current builder contract independently
    // of disk left by other Docker suites. Native capacity remains a runtime guard.
    const builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl: 'http://api.internal/api/v1', adminToken: 'synthetic', spaceProbe: async () => ({ bavail: 8 * 1024 ** 3, bsize: 1 }), publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' }, fetchImpl: async () => Response.json(bundle) });
    const build = async (data, id) => { bundle = makeBundle(data, id); return builder.build({ publicationId: id, siteSlug: bundle.siteSlug, siteId: bundle.siteId, rebuildId: id, rebuildRevision: 1 }); };
    const old = await build(oldCatalog, 'pub-before-official-site');
    const oldDirectory = join(root, 'releases', old.artifactId), oldSitemap = await readFile(join(oldDirectory, 'sitemap-pages.xml'), 'utf8');
    assert.doesNotMatch(oldSitemap, /official-site-domru/);
    const beforeDigest = digest(await readFile(join(oldDirectory, 'index.html'), 'utf8'));
    const next = await build(catalog, 'pub-official-site-v1'), directory = join(root, 'releases', next.artifactId);
    const html = await readFile(join(directory, OFFICIAL_SITE_PAGE_SLUG, 'index.html'), 'utf8');
    const sitemap = await readFile(join(directory, 'sitemap-pages.xml'), 'utf8');
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.deepEqual([...html.matchAll(/data-official-block="([^"]+)"/g)].map(m => m[1]), ['hero','services','constructor','regional','equipment','additional','pros-cons']);
    assert.equal((html.match(/data-official-image=/g) || []).length, 7);
    assert.equal((html.match(/data-official-scroll/g) || []).length, 7);
    assert.equal((html.match(/<details class="home-faq-item"/g) || []).length, 8);
    assert.match(html, /data-page-scope="GLOBAL"/); assert.match(html, /data-general-home-footer/);
    assert.match(html, /https:\/\/partner.example.test\/official-site-domru/);
    assert.match(sitemap, /\/official-site-domru/);
    assert.equal((sitemap.match(/<loc>/g) || []).length, (oldSitemap.match(/<loc>/g) || []).length + 1);
    assert.doesNotMatch(html, /figma\.com\/api\/mcp|Увеличить изображение|Скриншот|\{(?:CITY_|SUPPORT_PHONE|CONNECTION_PHONE)/);
    for (const image of Object.values(catalog.globalPages.find(p => p.type === 'OFFICIAL_SITE').content.images)) assert.ok((await readFile(join(directory, image.src))).length > 0);
    // A broken next release never removes or rewrites the previously sealed artifact.
    const broken = structuredClone(catalog); broken.globalPages.find(p => p.type === 'OFFICIAL_SITE').content.images.hero.src = '/images/official-site/missing-0123456789abcdef.jpg';
    await assert.rejects(build(broken, 'pub-official-site-broken'), /OFFICIAL_SITE|official-site|missing|ENOENT/);
    assert.equal(digest(await readFile(join(oldDirectory, 'index.html'), 'utf8')), beforeDigest);
    assert.equal(await readFile(join(directory, OFFICIAL_SITE_PAGE_SLUG, 'index.html'), 'utf8'), html);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(temporary) + sep)); await rm(root, { recursive: true, force: true });
  }
});

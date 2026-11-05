import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
test('ACCOUNT immutable artifact preserves old snapshots and adds only its optional route with all media and five rails', { timeout: 360000 }, async () => {
  const { StaticArtifactBuilder } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { accountPageSource } = require('./helpers/account-page-source.cjs');
  const { addressPageSource } = require('./helpers/address-page-source.cjs');
  const { ACCOUNT_PAGE_SLUG } = require('../apps/api/dist/account-page-model.js');
  const service = new SiteCatalogService({});
  const catalog = service.renderSource(accountPageSource()), oldCatalog = service.renderSource(addressPageSource());
  let bundle;
  const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url)); await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'account-builder-test-'));
  const makeBundle = (data, id) => ({ publicationId: id, siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 9, catalogDigest: digest(data), catalog: data });
  try {
    const builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl: 'http://api.internal/api/v1', adminToken: 'synthetic', publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' }, fetchImpl: async () => Response.json(bundle) });
    const build = async (data, id) => { bundle = makeBundle(data, id); return builder.build({ publicationId: id, siteSlug: bundle.siteSlug, siteId: bundle.siteId, rebuildId: id, rebuildRevision: 1 }); };
    const old = await build(oldCatalog, 'pub-before-account');
    const oldDirectory = join(root, 'releases', old.artifactId), oldSitemap = await readFile(join(oldDirectory, 'sitemap-pages.xml'), 'utf8');
    assert.doesNotMatch(oldSitemap, /lichnyy-kabinet-dom-ru/);
    const beforeDigest = digest(await readFile(join(oldDirectory, 'index.html'), 'utf8'));
    const next = await build(catalog, 'pub-account-v1'), directory = join(root, 'releases', next.artifactId);
    const html = await readFile(join(directory, ACCOUNT_PAGE_SLUG, 'index.html'), 'utf8');
    const sitemap = await readFile(join(directory, 'sitemap-pages.xml'), 'utf8');
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.deepEqual([...html.matchAll(/data-account-block="([^"]+)"/g)].map(m => m[1]), ['hero','toc','registration','login','recovery','features','interface','payment','promised_payment','termination','suspension','business','app']);
    assert.equal((html.match(/data-account-image=/g) || []).length, 14);
    assert.equal((html.match(/data-account-rail/g) || []).length, 5);
    assert.equal((html.match(/<details class="home-faq-item"/g) || []).length, 6);
    assert.match(html, /data-page-scope="GLOBAL"/); assert.match(html, /data-general-home-footer/);
    assert.match(html, /https:\/\/partner.example.test\/lichnyy-kabinet-dom-ru/);
    assert.match(sitemap, /\/lichnyy-kabinet-dom-ru/);
    assert.equal((sitemap.match(/<loc>/g) || []).length, (oldSitemap.match(/<loc>/g) || []).length + 1);
    assert.doesNotMatch(html, /figma\.com\/api\/mcp|Увеличить изображение|Скриншот|\{(?:CITY_|SUPPORT_PHONE|CONNECTION_PHONE)/);
    for (const image of Object.values(catalog.globalPages.find(p => p.type === 'ACCOUNT').content.images)) assert.ok((await readFile(join(directory, image.src))).length > 0);
    // A broken next release never removes or rewrites the previously sealed artifact.
    const broken = structuredClone(catalog); broken.globalPages.find(p => p.type === 'ACCOUNT').content.images.appScreen.src = '/images/account/missing-0123456789abcdef.jpg';
    await assert.rejects(build(broken, 'pub-account-broken'), /ACCOUNT|account|missing|ENOENT/);
    assert.equal(digest(await readFile(join(oldDirectory, 'index.html'), 'utf8')), beforeDigest);
    assert.equal(await readFile(join(directory, ACCOUNT_PAGE_SLUG, 'index.html'), 'utf8'), html);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(temporary) + sep)); await rm(root, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
test('immutable CITY_HOME builds all ten blocks, local assets and the shared shell without changing routes', { timeout: 180000 }, async () => {
  const { StaticArtifactBuilder } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { cityHomeSource } = require('./helpers/city-home-source.cjs');
  const source = cityHomeSource();
  source.pageTemplates[0].blocks.find(block => block.blockType === 'city.movix').data.cinemas.ivi.image = 'https://city-assets.example.test/ivi.png';
  const catalog = new SiteCatalogService({}).renderSource(source);
  const bundle = { publicationId: 'pub-city-v3', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 8, catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), catalog };
  const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url)); await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'city-home-builder-test-'));
  try {
    const builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl: 'http://api.internal/api/v1', adminToken: 'synthetic',
      publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' }, fetchImpl: async () => Response.json(bundle) });
    const artifact = await builder.build({ publicationId: bundle.publicationId, siteSlug: bundle.siteSlug, siteId: bundle.siteId, rebuildId: 'city-v3', rebuildRevision: 1 });
    const directory = join(root, 'releases', artifact.artifactId), html = await readFile(join(directory, 'kazan/index.html'), 'utf8');
    assert.deepEqual([...html.matchAll(/data-city-block="([^"]+)"/g)].map(match => match[1]), ['hero', 'tariff_grid', 'city.comparison', 'city.help', 'city.benefits', 'city.connection_steps', 'city.movix', 'city.regional_cities', 'city.faq', 'city.contacts']);
    assert.match(html, /class="gh-header"/); assert.match(html, /data-general-home-footer/);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1); assert.equal([...html.matchAll(/data-comparison-row/g)].length, 6);
    assert.match(html, /data-callback-tariff-slug="giga-300-tv"/);
    assert.match(html, /city-region-chip/); assert.match(html, /Татарстан/);
    assert.match(html, /Контакты Дом.ру в Казани/); assert.match(html, /950 ₽/);
    assert.match(html, /img-src[^;]*https:\/\/city-assets\.example\.test/);
    assert.doesNotMatch(html, /figma\.com\/api\/mcp|\/movix["#]|\/wifi-router["#]/);
    assert.ok((await readFile(join(directory, 'images/city-home/contact-phone.svg'))).length > 100);
    const policy = await readFile(join(directory, 'politika-konfidencialnosti/index.html'), 'utf8');
    assert.match(policy, /class="gh-header"/); assert.match(policy, /data-general-home-footer/);
    assert.deepEqual(new Set(catalog.routes.map(route => route.path)), new Set(['/', '/kazan', '/naberezhnye-chelny', '/nizhnekamsk', ...catalog.cities.flatMap(city => city.tariffs.map(tariff => `/${city.slug}/${tariff.slug}`)), '/karta-pokrytiya-provaydera', '/goroda-obsluzhivaniya', '/politika-konfidencialnosti', '/soglasie-na-obrabotku-personalnyh-dannyh', '/politika-obrabotki-faylov-kuki']));
  } finally {
    assert.ok(resolve(root).startsWith(resolve(temporary) + sep), 'remove only the owned temporary artifact directory');
    await rm(root, { recursive: true, force: true });
  }
});

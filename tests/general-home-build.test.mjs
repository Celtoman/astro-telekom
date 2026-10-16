import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('immutable Astro HOME builds every approved block with exact image CSP and preserves city HOME rendering', { timeout: 180000 }, async () => {
  const { StaticArtifactBuilder } = await import('../apps/web/scripts/publication/static-builder.mjs');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { publicationSource, city } = require('./helpers/publication-source.cjs');
  const { template, order } = require('./helpers/general-home.cjs');
  const { generalHomeDefaultBlocks } = require('../apps/api/dist/general-home-defaults.js');
  const { cityHomeTemplateBlocks } = require('../apps/api/dist/city-home-template.js');
  const source = publicationSource([city('moscow'), city('samara')]);
  source.cities[0].name = 'Москва'; source.cities[1].name = 'Самара';
  for (const location of source.cities) { location.status = 'PUBLISHED'; location.pages[0].status = 'PUBLISHED'; }
  for (const page of source.globalPages) page.status = 'PUBLISHED';
  const home = template();
  const defaults = new Map(generalHomeDefaultBlocks().map(block => [block.blockType, block.data]));
  for (const block of home.blocks.slice(1)) if (block.blockType !== 'home.faq') block.data = defaults.get(block.blockType);
  home.blocks[1].data.image = 'https://address-images.example.test/house.png';
  home.blocks[5].data.image = 'HTTPS://movix-images.example.test/devices.png';
  home.blocks[5].data.cinemas.ivi.image = 'https://cinema-images.example.test/ivi.png';
  home.blocks[2].data.evidence.research.sourceUrl = 'https://research.example.test/report';
  const cityTemplate = { id: 'city-home-template', siteId: 'site-1', kind: 'CITY_HOME', status: 'PUBLISHED', titleTemplate: 'Домашний интернет', content: {}, blocks: cityHomeTemplateBlocks({ name: '{CITY_NAME}', namePrepositional: '{CITY_NAME_PREPOSITIONAL}' }) };
  for (const location of source.cities) location.pages[0].templateId = cityTemplate.id;
  source.pageTemplates = [home, cityTemplate];
  const catalog = new SiteCatalogService({}).renderSource(source, new Date('2026-10-16T00:00:00Z'));
  const bundle = { publicationId: 'pub-full-home', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 8,
    catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), catalog };
  const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url));
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'general-home-builder-test-'));
  try {
    const builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl: 'http://api.internal/api/v1', adminToken: 'synthetic',
      publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: 'domru-site' },
      fetchImpl: async () => Response.json(bundle) });
    const job = { publicationId: bundle.publicationId, siteSlug: bundle.siteSlug, siteId: bundle.siteId, rebuildId: 'full-home-rebuild', rebuildRevision: 1 };
    const artifact = await builder.build(job);
    const directory = join(root, 'releases', artifact.artifactId), prefix = `/__publication_assets/${artifact.artifactId}`;
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    assert.deepEqual([...html.matchAll(/data-home-block="([^"]+)"/g)].map(match => match[1]), order);
    assert.match(html, /<header class="gh-header"/); assert.match(html, /data-general-home-footer/);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
    assert.ok(html.includes('data-address-dialog-trigger="general-home-address-entry"'));
    assert.ok(html.includes('href="/moscow/domru-domashniy-internet"'));
    assert.ok(html.includes('data-require-confirmed-city="true"'));
    const csp = html.match(/http-equiv="content-security-policy" content="([^"]+)"/i)?.[1];
    assert.ok(csp, 'CSP is emitted by the actual Astro build');
    const images = csp.split(';').find(directive => directive.trim().startsWith('img-src '));
    assert.ok(images.includes("'self'")); assert.ok(images.includes('data:'));
    for (const origin of ['https://address-images.example.test', 'https://movix-images.example.test', 'https://cinema-images.example.test']) assert.ok(images.includes(origin), origin);
    assert.ok(!images.includes('research.example.test'), 'A research link is not an image permission');
    assert.ok(!images.includes('https: '), 'There is no blanket HTTPS image permission');
    for (const path of ['header-menu.svg', 'header-phone.svg', 'benefit-speed.svg']) assert.ok(html.includes(`${prefix}/images/general-home/${path}`), path);
    for (const [, attributes, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(attributes)) continue;
      assert.ok(csp.includes(`sha256-${createHash('sha256').update(content).digest('base64')}`), 'Immutable versioned assets preserve inline script hashes');
    }
    const cityHtml = await readFile(join(directory, 'moscow', 'index.html'), 'utf8');
    assert.doesNotMatch(cityHtml, /<header class="gh-header"|data-general-home-composition|data-general-home-footer/);
    assert.match(cityHtml, /class="site-header"/);
    assert.ok(!cityHtml.includes('address-images.example.test'));
    assert.equal(artifact.catalogDigest, bundle.catalogDigest);
    assert.ok(artifact.files.some(file => file.path === 'images/general-home/header-menu.svg'));
    assert.ok(!html.includes('Пользовательское соглашение</a>'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

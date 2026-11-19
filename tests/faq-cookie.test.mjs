import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'parse5';
import { cookieNoticeClosed, COOKIE_NOTICE_DURATION } from '../apps/web/src/lib/cookie-notice-client.mjs';
import { renderFaqPage, faqStructuredData } from '../apps/web/src/lib/faq-render.ts';
import { buildSpeedTestFixture } from '../scripts/rehearse-speed-test-web.mjs';

const require = createRequire(import.meta.url);
const { faqDemoContent } = require('../apps/api/dist/faq-demo');
const { FAQ_SEO } = require('../apps/api/dist/faq-page-model');
const { cookieNoticeDefaults } = require('../apps/api/dist/cookie-notice-model');
const { validateFaqPage, validateCookieNotice } = require('../apps/api/dist/faq-cookie-validation');
const { applyFaqCookieSelection } = require('../apps/api/dist/faq-cookie.service');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service');
const { officialSiteSource } = require('./helpers/official-site-source.cjs');
const origin = new URL('https://partner.example.test');
const site = { connectionPhone: '78005557244', supportPhone: '78002507777' };
const fixtureRoot = fileURLToPath(new URL('../.codex-tmp/', import.meta.url));

test('FAQ validates grouped editorial content and keeps HTML aligned with Schema', () => {
  const content = faqDemoContent();
  content.groups.push({ id: 'empty', title: 'Пустая группа' });
  content.items[0].answer.content = [
    { type: 'paragraph', content: [{ type: 'text', text: '<&>', marks: [{ type: 'bold' }] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Перейти', marks: [{ type: 'link', attrs: { href: '/lichnyy-kabinet-dom-ru' } }] },
    ] }] }] },
  ];
  validateFaqPage(content);
  const catalog = new SiteCatalogService({}).renderSource(officialSiteSource());
  const html = renderFaqPage(content, { ...site, publicDisplay: catalog.site.publicDisplay });
  const schema = faqStructuredData(content, origin)['@graph'];
  assert.match(html, /<strong>&lt;&amp;&gt;<\/strong>/);
  assert.match(html, /<ol><li><p><a href="\/lichnyy-kabinet-dom-ru">Перейти<\/a>/);
  assert.doesNotMatch(html, /Пустая группа|Раскрыть все|Офис в Казани/);
  assert.equal(schema.filter(entity => entity['@type'] === 'FAQPage').length, 1);
  assert.equal(schema[0].mainEntity.length, 15);
  assert.match(schema[0].mainEntity[0].acceptedAnswer.text, /<a href="https:\/\/partner.example.test\/lichnyy-kabinet-dom-ru">Перейти/);
  const missingGroup = structuredClone(content);
  missingGroup.items[0].groupId = 'deleted';
  assert.throws(() => validateFaqPage(missingGroup), error => error.field === 'items.0.groupId');
  content.items[0].answer.content[1].content[0].content[0].content[0].marks[0].attrs.href = 'javascript:foo';
  assert.throws(() => validateFaqPage(content), error => error.field === 'items.0.answer');
  content.items[0].answer = { type: 'doc', content: [{ type: 'paragraph' }] };
  assert.throws(() => validateFaqPage(content), error => error.field === 'items.0.answer');
});

test('cookie closing expires after exactly 30 days and ignores malformed timestamps', () => {
  const timestamp = 1_000_000_000;
  assert.ok(cookieNoticeClosed(String(timestamp), timestamp));
  assert.ok(cookieNoticeClosed(String(timestamp), timestamp + COOKIE_NOTICE_DURATION - 1));
  assert.equal(cookieNoticeClosed(String(timestamp), timestamp + COOKIE_NOTICE_DURATION), false);
  assert.equal(cookieNoticeClosed(String(timestamp + 1), timestamp), false);
  for (const value of [null, '', 'abc', '-1', 'Infinity', '999999999999999999999']) assert.equal(cookieNoticeClosed(value, timestamp), false);
  const notice = cookieNoticeDefaults();
  validateCookieNotice(notice);
  notice.links[0].document = 'https://example.com';
  assert.throws(() => validateCookieNotice(notice), error => error.field === 'cookieNotice.links.0.document');
});

test('selected release adds only the selected FAQ or cookie to the immutable source', () => {
  const original = officialSiteSource();
  const before = structuredClone(original);
  const content = faqDemoContent();
  const faq = { page: { id: 'faq-page', siteId: original.site.id, type: 'FAQ', cityId: null, slug: 'faq',
    status: 'PUBLISHED', title: content.h1, content, blocks: [] }, seo: FAQ_SEO };
  const cookie = cookieNoticeDefaults();
  const onlyFaq = applyFaqCookieSelection(original, { faq });
  const onlyCookie = applyFaqCookieSelection(original, { cookie });
  const both = applyFaqCookieSelection(original, { faq, cookie });
  assert.deepEqual(original, before);
  assert.deepEqual(onlyFaq.site, original.site);
  assert.deepEqual(onlyCookie.globalPages, original.globalPages);
  assert.deepEqual(onlyCookie.seoTemplates, original.seoTemplates);
  assert.deepEqual(both.site.settings, { ...original.site.settings, cookieNotice: cookie });
  assert.equal(onlyFaq.globalPages.at(-1).type, 'FAQ');
  assert.equal(both.seoTemplates.at(-1).kind, 'FAQ');
  for (const source of [original, onlyFaq, onlyCookie, both]) {
    const service = new SiteCatalogService({});
    const result = validatePublicationSource(source, { siteRevision: 1, appVersion: 'test' }, (value, now) => service.renderSource(value, now));
    assert.ok(result.catalog, JSON.stringify(result.report.issues.filter(issue => issue.severity === 'BLOCKING')));
    assert.equal(result.catalog.routes.some(route => route.path === '/faq'), source === onlyFaq || source === both);
    assert.equal(result.catalog.site.cookieNotice?.enabled ?? false, source === onlyCookie || source === both);
  }
});

test('Astro builds FAQ, Schema and the shared cookie notice from the selected snapshot', { timeout: 240_000 }, async () => {
  const source = officialSiteSource();
  const content = faqDemoContent();
  const selected = applyFaqCookieSelection(source, {
    faq: { page: { id: 'faq-page', siteId: source.site.id, type: 'FAQ', cityId: null, slug: 'faq', status: 'PUBLISHED', title: content.h1, content, blocks: [] }, seo: FAQ_SEO },
    cookie: cookieNoticeDefaults(),
  });
  const catalog = new SiteCatalogService({}).renderSource(selected);
  await mkdir(fixtureRoot, { recursive: true });
  const root = await mkdtemp(join(fixtureRoot, 'faq-cookie-'));
  const fixture = await buildSpeedTestFixture({ root, catalog, origin: origin.href.slice(0, -1) });
  const faq = await readFile(join(fixture.dist, 'faq/index.html'), 'utf8');
  const document = parse(faq);
  const nodes = [];
  function walk(node) { nodes.push(node); for (const child of node.childNodes ?? []) walk(child); }
  walk(document);
  const attr = (node, key) => node.attrs?.find(attribute => attribute.name === key)?.value;
  assert.equal(nodes.filter(node => node.tagName === 'h1').length, 1);
  const rawSchema = nodes.find(node => node.tagName === 'script' && attr(node, 'type') === 'application/ld+json');
  const schema = JSON.parse(rawSchema.childNodes[0].value);
  assert.equal(schema['@graph'][0].mainEntity.length, 15);
  assert.equal(nodes.filter(node => node.tagName === 'details' && attr(node, 'class') === 'faq-question').length, 15);
  assert.match(faq, /data-cookie-notice/);
  assert.match(faq, /\/politika-obrabotki-faylov-kuki/);
  assert.match(await readFile(join(fixture.dist, 'sitemap-pages.xml'), 'utf8'), /<loc>https:\/\/partner.example.test\/faq<\/loc>/);
  for (const path of ['index.html', '404.html', 'politika-obrabotki-faylov-kuki/index.html']) {
    const html = await readFile(join(fixture.dist, path), 'utf8');
    assert.match(html, /data-cookie-notice/, path);
    assert.match(html, /href="\/faq"/, path);
  }
});

test('PostgreSQL validates scoped FAQ/cookie saving and publication against the actual schema', { timeout: 240_000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/rehearse-faq-cookie-db.mjs'], {
    encoding: 'utf8', timeout: 230_000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /optimistic saving, stale review, selective publication, idempotent retry/);
});

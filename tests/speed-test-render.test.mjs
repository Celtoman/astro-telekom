import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSpeedTestIntro, renderSpeedTestBody, speedTestText } from '../apps/web/src/lib/speed-test-render.ts';
import { assertSpeedTestPage } from '../apps/web/src/data/speed-test-page.ts';
import { buildPreviewDocument } from '../apps/admin/src/lib/preview-document.mjs';
import { sitePublicDisplayDefaults } from '../apps/api/src/site-public-display-model.ts';

const content = JSON.parse(readFileSync(new URL('../apps/api/src/assets/speed-test-page-v1.json', import.meta.url)));
const site = { name: 'Дом.ру', slug: 'domru-site', connectionPhone: '78005557244', supportPhone: '78002507777', publicDisplay: { ...sitePublicDisplayDefaults(), supportHours: 'Ежедневно 08:00–20:00' } };
const texts = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(texts);
test('SPEED_TEST shared renderer preserves the complete editable copy and accepted block order', () => {
  const output = renderSpeedTestIntro(content) + renderSpeedTestBody(content, site);
  assert.equal((output.match(/<h1\b/g) || []).length, 1);
  for (const text of texts(content).filter(text => text !== content.version)) assert.ok(output.includes(speedTestText(text).replaceAll('&', '&amp;')), `missing: ${text}`);
  assert.deepEqual([...output.matchAll(/data-speed-test-block="([^"]+)"/g)].map(match => match[1]), ['hero', 'preparation', 'metrics', 'tasks', 'factors', 'diagnosis', 'support', 'faq']);
  assert.equal((output.match(/data-speed-test-rail=/g) || []).length, 4);
  assert.equal((output.match(/role="region"/g) || []).length, 4);
  assert.equal((output.match(/tabindex="0"/g) || []).length, 4);
  assert.match(output, /Ежедневно 08:00–20:00/);
  assert.match(output, /href="tel:\+78002507777"/);
});
test('SPEED_TEST executes only the fixed manual widget in runtime and escapes untrusted copy', () => {
  const modified = structuredClone(content); modified.hero.h1 = '<img src=x onerror=alert(1)>'; modified.tasks.items.video.body = 'Текст <script>alert(1)</script> & результат';
  const output = renderSpeedTestIntro(modified) + renderSpeedTestBody(modified, site);
  assert.match(output, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; результат/);
  assert.equal((output.match(/<iframe /g) || []).length, 1);
  assert.match(output, /src="https:\/\/openspeedtest.com\/speedtest"/);
  assert.match(output, /title="[^"]+" loading="eager"/);
  assert.doesNotMatch(output, /\?Run|<script|onload=|Provided by|fallback|postMessage|setTimeout|Повторить тест/);
});
test('SPEED_TEST preview is inert and retains all explanations and FAQ answers', () => {
  const page = { type: 'SPEED_TEST', slug: 'proverit-skorost-interneta', content, status: 'PUBLISHED' };
  const output = buildPreviewDocument({ site, cities: [], globalPages: [page], routes: [{ kind: 'GLOBAL_PAGE', pageType: page.type, path: `/${page.slug}` }] }, `/${page.slug}`);
  assert.match(output, /speed-test-page/);
  assert.match(output, /speed-test-widget-preview/);
  assert.doesNotMatch(output, /<iframe\b|<script\b|\shref=|<form\b|src="https?:/);
  for (const text of texts(content).filter(text => text !== content.version)) assert.ok(output.includes(speedTestText(text).replaceAll('&', '&amp;')), `preview missing: ${text}`);
});
test('SPEED_TEST static boundary rejects unsupported versions, missing and extra fields', () => {
  assertSpeedTestPage(content);
  for (const mutate of [c => c.version = '2.0.0', c => delete c.metrics.items.jitter, c => c.hero.src = 'https://evil.example']) {
    const invalid = structuredClone(content); mutate(invalid); assert.throws(() => assertSpeedTestPage(invalid));
  }
});

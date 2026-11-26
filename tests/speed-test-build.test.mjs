import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpeedTestFixture, serveSpeedTestFixture } from '../scripts/rehearse-speed-test-web.mjs';
import { createPublicCsp, createAdminCsp } from '../scripts/browser-security-policy.mjs';

const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url));
function policy(html) {
  const value = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1];
  assert.ok(value, 'final HTML must contain its enforced CSP');
  return new Map(value.replaceAll('&#39;', "'").replaceAll('&amp;', '&').split(';').filter(Boolean).map(item => { const [name, ...values] = item.trim().split(/\s+/); return [name, values]; }));
}
test('SPEED_TEST real Astro fixtures preserve optional routing, final CSP isolation, SEO and exact exported SVG bytes', { timeout: 360000 }, async () => {
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'speed-test-build-'));
  try {
    const before = await buildSpeedTestFixture({ root: join(root, 'before'), includePage: false, origin: 'https://partner.example.test' });
    assert.doesNotMatch(await readFile(join(before.dist, 'sitemap-pages.xml'), 'utf8'), /proverit-skorost-interneta/);
    await assert.rejects(readFile(join(before.dist, 'proverit-skorost-interneta/index.html')));
    const next = await buildSpeedTestFixture({ root: join(root, 'after'), origin: 'https://partner.example.test', metrikaId: '12345678' });
    const html = await readFile(join(next.dist, 'proverit-skorost-interneta/index.html'), 'utf8');
    const csp = policy(html);
    assert.ok(csp.get('frame-src').includes('https://openspeedtest.com'));
    assert.ok(csp.get('frame-src').includes('https://mc.yandex.ru'), 'preserves existing Metrika permissions');
    for (const directive of ['connect-src', 'script-src']) {
      assert.ok(!csp.get(directive).includes('https://openspeedtest.com'));
      assert.ok(!csp.get(directive).includes("'unsafe-inline'"));
    }
    for (const path of ['index.html', 'official-site-domru/index.html', 'lichnyy-kabinet-dom-ru/index.html', 'karta-pokrytiya-provaydera/index.html']) {
      assert.ok(!policy(await readFile(join(next.dist, path), 'utf8')).get('frame-src').includes('https://openspeedtest.com'), `permission leaked: ${path}`);
    }
    assert.equal((html.match(/<iframe\b/g) || []).length, 1);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /src="https:\/\/openspeedtest.com\/speedtest"/);
    assert.match(html, /<iframe\b[^>]* sandbox="allow-scripts allow-same-origin"/);
    assert.match(html, /data-page-scope="GLOBAL"/);
    assert.match(html, /data-page-slug="proverit-skorost-interneta"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/partner.example.test\/proverit-skorost-interneta"/);
    assert.match(html, /<title>Проверка скорости интернета — Дом.ру<\/title>/);
    const markers = ['data-site-header', 'data-speed-test-block="hero"', 'class="home-block address-only"', ...['preparation', 'metrics', 'tasks', 'factors', 'diagnosis', 'support', 'faq'].map(key => `data-speed-test-block="${key}"`), 'data-general-home-footer'];
    const positions = markers.map(marker => html.indexOf(marker));
    assert.ok(positions.every((position, i) => position >= 0 && (!i || position > positions[i - 1])), 'shared shell and accepted 11-block order');
    assert.match(await readFile(join(next.dist, 'sitemap-pages.xml'), 'utf8'), /\/proverit-skorost-interneta/);
    assert.doesNotMatch(html, /figma\.com\/api\/mcp|openspeedtest\.ru|\?Run|data-speed-test-fallback|data-speed-test-retry/);
    const manifest = JSON.parse(await readFile(new URL('../docs/research/evidence/2026-11-14-speedtest-copy-update/runtime-asset-manifest.json', import.meta.url), 'utf8'));
    assert.equal(manifest.length, 23);
    for (const asset of manifest) {
      const bytes = await readFile(join(next.dist, 'images/speed-test/v1', asset.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    }
  } finally {
    assert.ok(resolve(root).startsWith(resolve(temporary) + sep));
    await rm(root, { recursive: true, force: true });
  }
});
test('default public and admin CSP remain closed to the third-party speed test', () => {
  for (const policy of [createPublicCsp({}), createAdminCsp({ adminUrl: 'https://admin.example.test' })]) {
    assert.doesNotMatch(JSON.stringify(policy), /openspeedtest|unsafe-inline.*script/);
  }
});
test('local FLOW2 fixture records synthetic payloads and recovers from address and lead errors without external requests', async () => {
  const server = await serveSpeedTestFixture({ origin: 'http://localhost', dist: temporary }, { port: 0 });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const address = { pageScope: 'GLOBAL', pageSlug: 'proverit-skorost-interneta', address: 'Синтетический адрес' };
    const lead = { submissionKey: 'synthetic-retry-key', phone: '79990000000', consent: true };
    await post('/__fixture', { mode: 'address-error' });
    assert.equal((await post('/api/v1/address-checks', address)).status, 503);
    await post('/__fixture', { mode: 'lead-error' });
    assert.equal((await post('/api/v1/address-checks', address)).status, 200);
    assert.equal((await post('/api/v1/leads', lead)).status, 503);
    await post('/__fixture', { mode: 'success' });
    assert.equal((await post('/api/v1/leads', lead)).status, 200);
    const result = await (await fetch(origin + '/__fixture')).json();
    assert.equal(result.synthetic, true);
    assert.deepEqual(result.requests.map(request => request.body), [address, address, lead, lead]);
    assert.deepEqual(result.requests.map(request => request.mode), ['address-error', 'lead-error', 'lead-error', 'success']);
    assert.equal((await post('/__fixture', { mode: 'unknown' })).status, 400);
  } finally { await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())); }
});

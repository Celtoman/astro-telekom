import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tariffPreviewDiff, tariffTemplateBlocks } from '../apps/admin/src/lib/tariff-template.mjs';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';
import { requestJson } from '../apps/admin/src/lib/admin-api.mjs';

test('tariff diff distinguishes new, removed and changed values regardless of JSON key order', () => {
  assert.deepEqual(tariffPreviewDiff({ name: 'Новый' }, null), ['Тариф ещё не опубликован']);
  assert.deepEqual(tariffPreviewDiff(null, { name: 'Старый' }), ['Тариф отсутствует в рабочей версии']);
  assert.deepEqual(tariffPreviewDiff({ name: 'Гига', standardPrice: '900', attributes: { a: 1, b: 2 } }, { name: 'Гига', standardPrice: '1000', attributes: { b: 2, a: 1 } }), ['Базовая цена']);
  assert.equal(tariffTemplateBlocks.map((item) => item.id).join('/'), 'hero/description/cinemas/equipment/services/configurator/address/related/faq');
});

test('template screen has four viewport controls and no submit or external transition in preview canvas', async () => {
  const [screen, canvas, route, api] = await Promise.all([
    readFile(new URL('../apps/admin/src/components/TariffTemplateApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/admin/src/components/TariffTemplateCanvas.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/admin/src/pages/templates.astro', import.meta.url), 'utf8'),
    readFile(new URL('../apps/admin/src/lib/admin-api.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(adminNavigation.find((item) => item.id === 'templates')?.href, '/templates');
  assert.match(route, /noindex, nofollow/);
  assert.match(screen, /\/auth\/me/);
  assert.match(screen, /desktop:.*1440/);
  assert.match(screen, /tablet:.*834/);
  assert.match(screen, /mobile:.*390/);
  assert.match(screen, /full:.*null/);
  assert.match(screen, /Открыть защищённый test-контур/);
  assert.match(canvas, /tariff-template\/quote/);
  assert.doesNotMatch(canvas, /<form\b|<a\b|type="submit"|target="_blank"/i);
  assert.match(api, /tariff-template\\\/quote/);
});

test('read-only quote does not raise a publication-change event in the admin shell', async () => {
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  const response = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await requestJson('https://example.test/api/v1', '/admin/sites/site-1/tariff-template/quote', { method: 'POST', body: {} }, response);
    assert.deepEqual(events, []);
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  }
});

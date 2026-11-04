import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const url = new URL('../apps/web/src/lib/address-page-render.ts', import.meta.url);
const render = existsSync(url) ? await import(url.href) : {};
const data = JSON.parse(readFileSync(new URL('../apps/api/src/assets/address-page-v1.json', import.meta.url)));
test('ADDRESS results escape editorial content, use accepted three icons and fixed note styling', () => {
  assert.equal(typeof render.renderAddressResults, 'function');
  const copy = structuredClone(data['address.results']); copy.items.none.title = '<script>no</script>';
  const html = render.renderAddressResults(copy);
  for (const icon of ['available', 'alternatives', 'none', 'retry']) assert.ok(html.includes(`/images/address-page/${icon}.svg`));
  assert.match(html, /&lt;script&gt;no&lt;\/script&gt;/);
  assert.equal((html.match(/class="address-result-card"/g) || []).length, 3);
  assert.match(html, /class="address-results-note"/);
});
test('ADDRESS popular tariffs use city card markup and FLOW1 with full context, sandbox has no actions', () => {
  assert.equal(typeof render.renderAddressTariffs, 'function');
  const tariffs = [{ slug: 'internet', name: 'Интернет', serviceType: 'INTERNET', priceAmount: 399, price: '399 ₽/мес', availability: true, isSticky: true }];
  const html = render.renderAddressTariffs(data['address.tariffs'], tariffs, { citySlug: 'perm', cityName: 'Пермь', interactive: true });
  assert.match(html, /class="collection-card/); assert.match(html, /data-callback-city-slug="perm"/);
  assert.match(html, /data-callback-tariff-slug="internet"/); assert.match(html, /href="\/perm\/internet"/);
  assert.match(html, /href="\/perm#tariffs"/); assert.doesNotMatch(html, /data-address-dialog-trigger/);
  const preview = render.renderAddressTariffs(data['address.tariffs'], tariffs, { interactive: false });
  assert.doesNotMatch(preview, /data-callback-trigger|href=/); assert.match(preview, /disabled/);
  assert.equal(render.renderAddressTariffs(data['address.tariffs'], [], { interactive: true }), '');
});

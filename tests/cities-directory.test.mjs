import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDirectoryRegions, directoryCount } from '../apps/web/src/lib/cities-directory.mjs';
import { renderCitiesDirectory } from '../apps/web/src/lib/cities-directory-render.ts';

const cities = [
  { slug: 'nizhnekamsk', name: 'Нижнекамск', region: { slug: 'tatarstan', name: 'Республика Татарстан' } },
  { slug: 'berezovsky', name: 'Берёзовский', region: { slug: 'sverdlovsk', name: 'Свердловская область' } },
  { slug: 'kazan', name: 'Казань', region: { slug: 'tatarstan', name: 'Республика Татарстан' } },
  { slug: 'berezovsky-kemerovo', name: 'Берёзовский', region: { slug: 'kemerovo', name: 'Кемеровская область' } },
];

test('cities directory searches the full catalog by city or region and preserves regional identity', () => {
  const original = structuredClone(cities);
  assert.deepEqual(selectDirectoryRegions(cities).map(group => [group.region.slug, group.cities.map(city => city.slug)]), [
    ['kemerovo', ['berezovsky-kemerovo']], ['tatarstan', ['kazan', 'nizhnekamsk']], ['sverdlovsk', ['berezovsky']],
  ]);
  assert.deepEqual(selectDirectoryRegions(cities, '  КАЗ  ')[0].cities.map(city => city.slug), ['kazan']);
  assert.deepEqual(selectDirectoryRegions(cities, 'РЕСПУБЛИКА   ТАТАР')[0].cities.map(city => city.slug), ['kazan', 'nizhnekamsk']);
  assert.equal(selectDirectoryRegions(cities, 'берез').length, 2);
  assert.deepEqual(selectDirectoryRegions(cities, 'абвгд'), []);
  assert.deepEqual(selectDirectoryRegions([], ''), []);
  assert.deepEqual(cities, original);
  assert.equal(directoryCount(1, 'city'), '1 город');
  assert.equal(directoryCount(3, 'city'), '3 города');
  assert.equal(directoryCount(11, 'city'), '11 городов');
  assert.equal(directoryCount(21, 'region'), '21 регион');
  assert.equal(directoryCount(0, 'region'), '0 регионов');
});

test('directory HTML contains every city link, dynamic counts and one page heading without legacy sections', () => {
  const result = renderCitiesDirectory({ cities });
  assert.equal([...result.matchAll(/<h1\b/g)].length, 1);
  assert.equal([...result.matchAll(/data-directory-city\b/g)].length, 4);
  assert.match(result, /В каталоге 4 города · 3 региона/);
  for (const city of cities) assert.ok(result.includes(`href="/${city.slug}"`));
  assert.doesNotMatch(result, /coverage-radar|coverage-callout|directory-faq|id="faq"|target="_blank"/);
  assert.match(result, /type="search"[^>]*disabled/);
});

test('shared preview is inert and escapes city names, regions and asset URLs', () => {
  const malicious = [{ slug: 'safe-city', name: '<script>bad()</script>', region: { slug: 'region', name: '<img onerror="bad()">' } }];
  const result = renderCitiesDirectory({ cities: malicious, interactive: false, asset: () => '/asset" onload="bad()' });
  assert.match(result, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(result, /&lt;img onerror=&quot;bad\(\)&quot;&gt;/);
  assert.match(result, /&quot; onload=&quot;/);
  assert.doesNotMatch(result, /<script|<form|\shref=|\son\w+=["']|\stabindex=/i);
  assert.match(result, /aria-disabled="true"/);
  assert.throws(() => renderCitiesDirectory({ cities: [{ ...cities[0], slug: 'javascript:bad()' }] }), /slug/);
  assert.match(renderCitiesDirectory({ cities: [] }), /В каталоге 0 городов · 0 регионов/);
});

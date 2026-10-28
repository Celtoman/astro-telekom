import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../apps/api/src/tariff-collection-model.ts';
const tariffs = [
  { slug: 'internet', serviceType: 'INTERNET', speedMbps: 500, cinemas: [], game: { status: 'OPTIONAL' } },
  { slug: 'all', serviceType: 'INTERNET_TV', speedMbps: 800, cinemas: [{}], game: { status: 'INCLUDED' } },
  { slug: 'slow', serviceType: 'INTERNET_TV', speedMbps: 300, cinemas: [{}], game: { status: 'INCLUDED' } },
];
test('catalog categories and quick filters intersect, with gaming requiring an included entitlement', () => {
  assert.equal(typeof model.filterCollectionTariffs, 'function');
  const ids = filters => model.filterCollectionTariffs(tariffs, filters).map(t => t.slug);
  assert.deepEqual(ids({ category: 'ALL', gaming: true, cinemas: true, fast: true }), ['all']);
  assert.deepEqual(ids({ category: 'INTERNET', gaming: true }), []);
  assert.deepEqual(ids({ category: 'INTERNET', fast: true }), ['internet']);
  assert.deepEqual(ids({ category: 'ALL', cinemas: true }), ['all', 'slow']);
  assert.deepEqual(ids({}), ['internet', 'all', 'slow']);
  assert.equal(tariffs.length, 3);
});

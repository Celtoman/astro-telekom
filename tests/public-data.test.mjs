import { test } from 'node:test';
import assert from 'node:assert/strict';
import contentResolution from '../apps/api/dist/content-resolution.js';
import { tariffView } from '../apps/web/src/data/tariff-view.ts';

const { publicContent, mergeContent } = contentResolution;

test('private provider and site settings never become inherited public content', () => {
  const provider = { apiKey: 'secret', content: { heading: 'Provider', text: 'Shared' } };
  const site = { credentials: { token: 'secret' }, content: { heading: 'Site' } };
  assert.deepEqual(mergeContent(publicContent(provider), publicContent(site), { heading: 'City' }), {
    heading: 'City', text: 'Shared',
  });
  assert.deepEqual(publicContent({ apiKey: 'secret' }), {});
});

test('API tariffs enter the service categories used by public pages', () => {
  const tariffs = ['INTERNET', 'INTERNET_TV', 'TV'].map(serviceType => tariffView({ slug: serviceType, name: 'Тариф', serviceType }));
  assert.equal(tariffs.filter(t => t.service === 'Домашний интернет').length, 1);
  assert.equal(tariffs.filter(t => t.service === 'Интернет и телевидение').length, 1);
  assert.equal(tariffs[2].service, 'Телевидение');
});

test('zero promo price is preserved, missing promo falls back to standard price', () => {
  assert.equal(tariffView({ promoPrice: 0, standardPrice: '900' }).price, '0 ₽/мес.');
  assert.equal(tariffView({ promoPrice: null, standardPrice: '900' }).price, '900 ₽/мес.');
  assert.equal(tariffView({}).price, 'Цена уточняется');
});

test('connection fee keeps zero, value and missing semantics for public tariffs', () => {
  assert.equal(tariffView({ connectionFee: 0 }).connection, 'Бесплатное подключение');
  assert.equal(tariffView({ connectionFee: '1500.5' }).connection, 'Подключение — 1 500,5 ₽');
  assert.equal(tariffView({ connectionFee: null }).connection, null);
  assert.equal(tariffView({}).connection, null);
});

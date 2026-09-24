import { test } from 'node:test';
import assert from 'node:assert/strict';

test('variable insertion replaces the selected text and places the caret after the exact token', async () => {
  const { insertVariableAtSelection } = await import('../apps/admin/src/lib/variable-insertion.mjs');
  assert.deepEqual(insertVariableAtSelection('Интернет в городе', 11, 17, 'CITY_NAME', 1000), {
    value: 'Интернет в {CITY_NAME}', selectionStart: 22, selectionEnd: 22,
  });
  assert.deepEqual(insertVariableAtSelection('Дом.ру', 0, 0, 'PROVIDER_NAME', 1000), {
    value: '{PROVIDER_NAME}Дом.ру', selectionStart: 15, selectionEnd: 15,
  });
});

test('variable insertion respects field length and does not silently truncate text', async () => {
  const { insertVariableAtSelection } = await import('../apps/admin/src/lib/variable-insertion.mjs');
  assert.equal(insertVariableAtSelection('12345', 5, 5, 'YEAR', 10), null);
  assert.deepEqual(insertVariableAtSelection('12345', 0, 5, 'YEAR', 10), {
    value: '{YEAR}', selectionStart: 6, selectionEnd: 6,
  });
});

test('picker offers only codes allowed in the selected SEO or tariff field and context', async () => {
  const { filterVariableDefinitions } = await import('../apps/admin/src/lib/variable-insertion.mjs');
  const definitions = [
    { code: 'PROVIDER_NAME', name: 'Провайдер', scope: 'SITE', status: 'ACTIVE', allowedFields: ['SeoTemplate.titleTemplate', 'Tariff.promoText'] },
    { code: 'CITY_NAME', name: 'Город', scope: 'CITY', status: 'ACTIVE', allowedFields: ['SeoTemplate.titleTemplate'] },
    { code: 'TARIFF_PRICE', name: 'Цена', scope: 'TARIFF', status: 'ACTIVE', allowedFields: ['SeoTemplate.titleTemplate', 'Tariff.promoText'] },
    { code: 'OLD_CODE', name: 'Старый', scope: 'SITE', status: 'DEPRECATING', allowedFields: ['SeoTemplate.titleTemplate'] },
  ];
  assert.deepEqual(filterVariableDefinitions(definitions, 'SeoTemplate.titleTemplate', 'SITE', '').map((item) => item.code), ['PROVIDER_NAME']);
  assert.deepEqual(filterVariableDefinitions(definitions, 'SeoTemplate.titleTemplate', 'CITY', '').map((item) => item.code), ['PROVIDER_NAME', 'CITY_NAME']);
  assert.deepEqual(filterVariableDefinitions(definitions, 'SeoTemplate.titleTemplate', 'TARIFF', 'цена').map((item) => item.code), ['TARIFF_PRICE']);
  assert.deepEqual(filterVariableDefinitions(definitions, 'Tariff.promoText', 'TARIFF', '').map((item) => item.code), ['PROVIDER_NAME', 'TARIFF_PRICE']);
  assert.deepEqual(filterVariableDefinitions(definitions, 'SeoTemplate.ogImageUrl', 'SITE', ''), []);
});

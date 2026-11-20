import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = async (file) => readFile(new URL(file, root), 'utf8');

test('variable catalog filters code, name, source, type and status without hiding unused codes', async () => {
  const { filterVariableCatalogItems } = await import('../apps/admin/src/lib/variable-catalog.mjs');
  const items = [
    { code: 'CONNECTION_PHONE', name: 'Телефон подключения', source: 'Site.connectionPhone', type: 'phone', status: 'ACTIVE', workingUsages: [] },
    { code: 'TARIFF_PRICE', name: 'Цена тарифа', source: 'Tariff.effectivePrice', type: 'number', status: 'ACTIVE', workingUsages: [{ code: 'TARIFF_PRICE' }] },
    { code: 'OLD_CODE', name: 'Старый код', source: 'Provider.name', type: 'text', status: 'DEPRECATING', workingUsages: [] },
  ];
  assert.equal(filterVariableCatalogItems(items, {}).length, 3);
  assert.deepEqual(filterVariableCatalogItems(items, { q: 'подключ' }).map((item) => item.code), ['CONNECTION_PHONE']);
  assert.deepEqual(filterVariableCatalogItems(items, { q: 'TARIFF_PRICE' }).map((item) => item.code), ['TARIFF_PRICE']);
  assert.deepEqual(filterVariableCatalogItems(items, { source: 'Provider', status: 'DEPRECATING', type: 'text' }).map((item) => item.code), ['OLD_CODE']);
  assert.deepEqual(filterVariableCatalogItems(items, { source: 'Site', type: 'number' }), []);
});

test('variables workspace exposes two tabs and a read-only contextual catalog', async () => {
  const app = await source('apps/admin/src/components/VariablesApp.tsx');
  assert.match(app, /TabsTrigger[^>]*value="values"[^>]*>Значения сайта/);
  assert.match(app, /TabsTrigger[^>]*value="catalog"[^>]*>Каталог подстановок/);
  assert.match(app, /variable-catalog/);
  assert.match(app, /cityId/);
  assert.match(app, /tariffId/);
  assert.match(app, /Сбросить фильтры/);
  assert.match(app, /Рабочее значение/);
  assert.match(app, /Опубликованное значение/);
  assert.match(app, /Места использования/);
  assert.match(app, /Черновик/);
  assert.match(app, /Скрыт/);
  assert.match(app, /Редактор пока недоступен/);
  assert.match(app, /SEO-шаблон/);
  assert.match(app, /publishedTemplateUsageAvailable/);
  assert.doesNotMatch(app, /Создать переменн|Удалить код|Переименовать код/);
});

test('usage routes stay independent of city and tariff and follow the exact publication ID', async () => {
  const { variableUsagePath } = await import('../apps/admin/src/lib/variable-catalog.mjs');
  const identity = { workingRevision: 8, publishedPublicationId: 'pub-initial' };
  assert.equal(variableUsagePath('site & demo', null), null);
  const counts = '/admin/sites/site%20%26%20demo/variable-catalog/usages?workingRevision=8&publishedPublicationId=pub-initial';
  assert.equal(variableUsagePath('site & demo', identity), counts);
  assert.equal(variableUsagePath('site & demo', { ...identity, selectedCityId: 'city-1', selectedTariffId: 'tariff-1' }), counts);
  assert.notEqual(variableUsagePath('site & demo', { ...identity, publishedPublicationId: 'pub-next' }), counts);
  const page = { code: 'CITY_NAME', workingPage: 2, publishedPage: 1 };
  assert.equal(variableUsagePath('site & demo', identity, page), counts + '&code=CITY_NAME&workingPage=2&publishedPage=1');
});

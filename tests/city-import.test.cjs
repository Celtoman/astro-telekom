const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CityImportService } = require('../apps/api/dist/city-import.service.js');

const row = (overrides = {}) => ({
  'Субъект РФ': 'Алтайский край',
  'Город имен. падеж': 'Алейск',
  'Город предлож. падеж - dom_ru_v': 'Алейске',
  'Город родит. падеж': 'Алейска',
  'URL города': 'https://tarify-dom.ru/aleysk',
  slug: 'aleysk',
  adres_ofisa: 'Алейск, Советская улица, 100а',
  rezhim_raboty_ofisa: 'Пн-Пт: с 09:00 до 18:00',
  ...overrides,
});

function validationPrisma() {
  return {
    site: { findUnique: async () => ({ id: 'site-1' }) },
    city: { findMany: async () => [] },
  };
}

test('city import accepts the agreed Russian XLS aliases', async () => {
  const report = await new CityImportService(validationPrisma()).validateRows('site-1', 'cities.xlsx', [row()]);
  assert.equal(report.errorRows, 0);
  assert.equal(report.validRows, 1);
  assert.equal(report.candidates[0].slug, 'aleysk');
  assert.equal(report.candidates[0].namePrepositional, 'Алейске');
  assert.equal(report.candidates[0].legacyUrl, 'https://tarify-dom.ru/aleysk');
});

test('city import blocks duplicate slugs and missing required values', async () => {
  const report = await new CityImportService(validationPrisma()).validateRows('site-1', 'cities.xlsx', [row(), row(), row({ slug: '' })]);
  assert.equal(report.validRows, 0);
  assert.ok(report.issues.some((issue) => issue.message.includes('Дубликат slug')));
  assert.ok(report.issues.some((issue) => issue.message.includes('Не указан slug')));
});

test('new city creates the standard draft page set', async () => {
  const pages = [];
  const calls = [];
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1' }) },
    city: { findMany: async () => [] },
    $transaction: async (callback) => callback({
      region: { findFirst: async () => null, create: async ({ data }) => ({ id: 'region-1', ...data }) },
      city: { findFirst: async () => null, create: async ({ data }) => ({ id: 'city-1', ...data }), update: async () => ({}) },
      page: { create: async ({ data }) => { pages.push(data); return data; } },
    }),
  };
  const service = new CityImportService(prisma);
  const report = await service.validateRows('site-1', 'cities.xlsx', [row()]);
  const result = await service.applyReport(report);
  calls.push(result);
  assert.equal(result.created, 1);
  assert.equal(result.pagesCreated, 6);
  assert.deepEqual(pages.map((page) => page.slug), ['home', 'internet', 'internet-tv', 'tv', 'proverka-adresa', 'faq']);
});

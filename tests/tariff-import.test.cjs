const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../apps/api/node_modules/xlsx');
const { TariffImportService, parseWorkbook } = require('../apps/api/dist/tariff-import.service.js');

const row = (overrides = {}) => ({
  subekt_rf: 'Республика Татарстан', gorod_name: 'Казань', gorod_slug: 'kazan', tarif_type: 'Интернет',
  post_title: 'Гига 500', post_title_lat: 'giga-500', nazvanie_tarifa: 'Гига 500', skorost_interneta: 500,
  stoimost_tarifa: 890, staraia_stoimost: 990, connection_cost: 0, opisanie_aktsii: 'Промо', promo_feature: '',
  srv_video_status: 0, srv_ont_status: 1, is_sticky: 0, is_gaming_tarif: 0, ...overrides,
});

function service() {
  return new TariffImportService({ city: { findMany: async () => [{ id: 'city-1', slug: 'kazan' }] } });
}

test('XLSX parser reads the first sheet and preserves empty cells', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([row()]), 'Tarify');
  const parsed = parseWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].post_title_lat, 'giga-500');
});

test('validation creates the agreed identity key and separates promo price', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row()]);
  assert.equal(report.errorRows, 0);
  assert.equal(report.validRows, 1);
  assert.equal(report.candidates[0].key, 'kazan-giga-500-Интернет');
  assert.equal(report.candidates[0].standardPrice, 990);
  assert.equal(report.candidates[0].promoPrice, 890);
  assert.equal(report.candidates[0].connectionFee, 0);
});

test('validation blocks duplicate keys, invalid service states and missing cities', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ srv_video_status: 2 }),
    row({ gorod_slug: 'unknown', post_title_lat: 'giga-500-2' }),
  ]);
  assert.equal(report.validRows, 0);
  assert.ok(report.issues.some((issue) => issue.message.includes('srv_video_status')));
  assert.ok(report.issues.some((issue) => issue.message.includes('не найден')));
});

test('validation reports duplicate business keys before apply', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row(), row()]);
  assert.equal(report.validRows, 0);
  assert.ok(report.issues.some((issue) => issue.message.includes('Дубликат ключа')));
});

test('apply creates validated rows and respects accepted keys', async () => {
  const calls = [];
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan' }] },
    $transaction: async (callback) => callback({
      tariff: {
        findFirst: async () => null,
        create: async ({ data }) => { calls.push(data); return { id: 'tariff-1' }; },
        update: async () => { throw new Error('unexpected update'); },
      },
    }),
  };
  const instance = new TariffImportService(prisma);
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);
  const result = await instance.applyReport(report, [report.candidates[0].key]);
  assert.deepEqual(result, { created: 1, updated: 0, skipped: 0, applied: 1 });
  assert.equal(calls[0].identityKey, 'city-1:giga-500:internet');
  assert.equal(calls[0].status, 'PUBLISHED');
});

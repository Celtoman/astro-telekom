const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../apps/api/node_modules/xlsx');
const { TariffImportService, parseWorkbook } = require('../apps/api/dist/tariff-import.service.js');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');

const row = (overrides = {}) => ({
  subekt_rf: 'Республика Татарстан', gorod_name: 'Казань', gorod_slug: 'kazan', tarif_type: 'Интернет',
  post_title: 'Гига 500', post_title_lat: 'giga-500', nazvanie_tarifa: 'Гига 500', skorost_interneta: 500,
  stoimost_tarifa: 890, staraia_stoimost: 990, connection_cost: 0, opisanie_aktsii: 'Промо', promo_feature: '',
  srv_video_status: 0, srv_ont_status: 1, is_sticky: 0, is_gaming_tarif: 0, ...overrides,
});

function service() {
  return new TariffImportService({
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => [] },
  });
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
  assert.deepEqual(report.diff, { created: 1, updated: 0, deleted: 0, deletedTariffs: [] });
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

test('apply creates every validated row as one full package', async () => {
  const calls = [];
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => [] },
    $transaction: async (callback) => callback({
      tariff: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async ({ data }) => { calls.push(data); return { id: 'tariff-1' }; },
        update: async () => { throw new Error('unexpected update'); },
      },
    }),
  };
  const instance = new TariffImportService(prisma);
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);
  const result = await instance.applyReport(report, { confirmWarnings: true });
  assert.deepEqual(result, { created: 1, updated: 0, deleted: 0, applied: 1 });
  assert.equal(calls[0].identityKey, 'city-1:giga-500:internet');
  assert.equal(calls[0].status, 'PUBLISHED');
});

test('full snapshot deletes provider tariffs that disappeared from the file', async () => {
  const records = [
    { id: 'keep', providerId: 'provider-1', cityId: 'city-1', name: 'Гига 500', slug: 'giga-500', identityKey: 'city-1:giga-500:internet' },
    { id: 'stale', providerId: 'provider-1', cityId: 'city-1', name: 'Старый 100', slug: 'old-100', identityKey: 'city-1:old-100:internet' },
  ];
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => records },
    $transaction: async (callback) => callback({
      tariff: {
        findMany: async () => records,
        findFirst: async ({ where }) => records.find((item) => item.cityId === where.cityId && (item.identityKey === where.OR[0].identityKey || item.slug === where.OR[1].slug)) || null,
        update: async ({ where, data }) => Object.assign(records.find((item) => item.id === where.id), data),
        create: async ({ data }) => { records.push({ id: `new-${records.length}`, ...data }); },
        deleteMany: async ({ where }) => {
          const before = records.length;
          for (let index = records.length - 1; index >= 0; index -= 1) if (where.id.in.includes(records[index].id)) records.splice(index, 1);
          return { count: before - records.length };
        },
      },
    }),
  };
  const instance = new TariffImportService(prisma);
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);
  assert.deepEqual(report.diff, {
    created: 0,
    updated: 1,
    deleted: 1,
    deletedTariffs: [{ id: 'stale', cityId: 'city-1', name: 'Старый 100', slug: 'old-100' }],
  });

  const result = await instance.applyReport(report, { confirmWarnings: true });

  assert.equal(result.deleted, 1);
  assert.deepEqual(records.map((item) => item.id), ['keep']);
});

test('warnings block apply until they are explicitly confirmed', async () => {
  const instance = service();
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({ promo_feature: 'x'.repeat(165) })]);

  await assert.rejects(instance.applyReport(report, { confirmWarnings: false }), /подтвердить предупреждения/i);
});

test('full snapshot transaction rolls back all changes when one write fails', async () => {
  const original = [{ id: 'stale', providerId: 'provider-1', cityId: 'city-1', slug: 'stale', identityKey: 'city-1:stale:internet' }];
  let records = structuredClone(original);
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => records },
    $transaction: async (callback) => {
      const draft = structuredClone(records);
      const tx = { tariff: {
        findMany: async () => draft,
        findFirst: async () => null,
        create: async () => { throw new Error('database write failed'); },
        update: async () => {},
        deleteMany: async ({ where }) => {
          for (let index = draft.length - 1; index >= 0; index -= 1) if (where.id.in.includes(draft[index].id)) draft.splice(index, 1);
        },
      } };
      const result = await callback(tx);
      records = draft;
      return result;
    },
  };
  const instance = new TariffImportService(prisma);
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);

  await assert.rejects(instance.applyReport(report, { confirmWarnings: true }), /database write failed/);
  assert.deepEqual(records, original);
});

test('apply queues rebuilds for every provider site, including deletion-only sites', async () => {
  const report = { providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [] };
  const queued = [];
  const prisma = {
    tariffImportRun: {
      findUnique: async () => ({ id: 'run-1', status: 'VALIDATED', report }),
      update: async () => { throw new Error('run status must be committed inside the import transaction'); },
    },
    site: { findMany: async () => [{ id: 'site-1' }, { id: 'site-2' }] },
  };
  const imports = {
    applyReport: async (receivedReport, options, runId) => {
      assert.equal(receivedReport, report);
      assert.deepEqual(options, { confirmWarnings: false });
      assert.equal(runId, 'run-1');
      return { created: 0, updated: 0, deleted: 2, applied: 0 };
    },
  };
  const controller = new AdminTariffsController(prisma, { enqueue: async (job) => queued.push(job) }, imports);

  const result = await controller.applyImport({ runId: 'run-1' });

  assert.equal(result.deleted, 2);
  assert.deepEqual(queued.map((job) => job.siteId), ['site-1', 'site-2']);
});

test('legacy acceptedKeys partial apply is rejected before reading the import run', async () => {
  const controller = new AdminTariffsController({
    tariffImportRun: { findUnique: async () => { throw new Error('must not read the run'); } },
  }, { enqueue: async () => {} }, {});

  await assert.rejects(
    controller.applyImport({ runId: 'run-1', acceptedKeys: ['kazan-giga-500-Интернет'] }),
    /частичное применение/i,
  );
});

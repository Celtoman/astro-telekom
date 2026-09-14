const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TariffImportService, TARIFF_ATTRIBUTE_FIELDS, parseWorkbook } = require('../apps/api/dist/tariff-import.service.js');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');
const SNAPSHOT_TIME = new Date('2026-09-11T00:00:00.000Z');

const row = (overrides = {}) => ({
  subekt_rf: 'Республика Татарстан', gorod_name: 'Казань', gorod_slug: 'kazan', tarif_type: 'Интернет',
  post_title: 'Гига 500', post_title_lat: 'giga-500', nazvanie_tarifa: 'Гига 500', skorost_interneta: 500,
  stoimost_tarifa: 890, staraia_stoimost: 990, connection_cost: 0, opisanie_aktsii: 'Промо', promo_feature: '',
  srv_video_status: 0, srv_ont_status: 1, is_sticky: 0, is_gaming_tarif: 0, ...overrides,
});

function service() {
  return new TariffImportService({
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1', pages: [] }] },
    tariff: { findMany: async () => [] },
  });
}

test('import runs persist change sets and attributed undo state', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const tariffRun = schema.slice(schema.indexOf('model TariffImportRun {'), schema.indexOf('model CityImportRun {'));
  const cityRun = schema.slice(schema.indexOf('model CityImportRun {'), schema.indexOf('model AddressCheck {'));
  for (const model of [tariffRun, cityRun]) {
    assert.match(model, /changeSet\s+Json\?/);
    assert.match(model, /appliedById\s+String\?/);
    assert.match(model, /undoneAt\s+DateTime\?/);
    assert.match(model, /undoneById\s+String\?/);
    assert.match(model, /undoSiteRevisions\s+Json\?/);
  }
  assert.match(schema.slice(schema.indexOf('enum TariffImportStatus'), schema.indexOf('enum CityImportStatus')), /UNDONE/);
  assert.match(schema.slice(schema.indexOf('enum CityImportStatus'), schema.indexOf('enum SiteRebuildStatus')), /UNDONE/);
  assert.match(schema.slice(schema.indexOf('enum ContentRevisionAction'), schema.indexOf('enum SitePublicationStatus')), /UNDO/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '0029_versioned_import_undo', 'migration.sql'), 'utf8');
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'UNDONE'/);
  assert.match(migration, /ADD COLUMN "changeSet" JSONB/);
});

test('the tariff attribute registry preserves every observed source field', () => {
  assert.deepEqual(TARIFF_ATTRIBUTE_FIELDS.map(({ key }) => key), [
    'nazvanie_tarifa', 'card_subtitle', 'badge_text', 'promo_feature', 'opisanie_tarifa',
    'show_on_site', 'is_sticky', 'is_gaming_tarif', 'tv_channels_total', 'tv_channels_hd',
    'online_cinemas', 'equip_router', 'router_buyout_price', 'router_installment_months',
    'router_installment_price', 'equip_tv_box', 'tvbox_buyout_price', 'tvbox_installment_months',
    'tvbox_installment_price', 'ont_buyout_price', 'cctv_buyout_price', 'cctv_connection_price',
    'srv_video_status', 'srv_video_price', 'srv_gaming_status', 'srv_gaming_name',
    'srv_vkplaycloud_status', 'srv_litres_status', 'srv_ont_status', 'srv_staticip_status',
  ]);
});

test('XLSX parser reads the canonical first sheet into records', async () => {
  const workbookPath = path.join(__dirname, '..', 'data', 'imports', 'cities.xlsx');
  const parsed = await parseWorkbook(fs.readFileSync(workbookPath), 'cities.xlsx');

  assert.equal(parsed.length, 207);
  assert.equal(parsed[0].Slug, 'aleysk');
  assert.equal(parsed[0]['Город имен. падеж'], 'Алейск');
});

test('XLSX parser reads a real canonical generator workbook with empty optional values', async () => {
  const workbookPath = path.join(__dirname, 'fixtures', 'tariff-generator-empty-values.xlsx');
  const parsed = await parseWorkbook(fs.readFileSync(workbookPath), workbookPath);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].post_title, 'Гига+ 500');
  assert.equal(parsed[0].card_subtitle, null);
});

test('XLSX parser rejects the legacy binary XLS format explicitly', async () => {
  await assert.rejects(
    parseWorkbook(Buffer.from('legacy-binary-spreadsheet'), 'tariffs.xls'),
    /только файлы \.xlsx/i,
  );
});

test('XLSX parser rejects files larger than 25 MB before parsing', async () => {
  await assert.rejects(
    parseWorkbook(Buffer.alloc(25 * 1024 * 1024 + 1), 'oversized.xlsx'),
    /максимум 25 МБ/i,
  );
});

test('validation creates the agreed identity key and separates promo price', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row()]);
  assert.equal(report.errorRows, 0);
  assert.equal(report.validRows, 1);
  assert.equal(report.candidates[0].key, 'kazan-giga-500-Интернет');
  assert.equal(report.candidates[0].standardPrice, 990);
  assert.equal(report.candidates[0].promoPrice, 890);
  assert.equal(report.candidates[0].connectionFee, 0);
  assert.equal(report.reportVersion, 2);
  assert.deepEqual(report.existingSnapshot, []);
  assert.deepEqual(report.diff, { created: 1, updated: 0, deleted: 0, deletedTariffs: [] });
});

test('validation preserves tariff description and normalized TV channel counters in attributes', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({
    opisanie_tarifa: '  Полное описание тарифа  ',
    tv_channels_total: ' 215 ',
    tv_channels_hd: 87,
  })]);

  assert.equal(report.errorRows, 0);
  assert.equal(report.candidates[0].attributes.opisanie_tarifa, 'Полное описание тарифа');
  assert.equal(report.candidates[0].attributes.tv_channels_total, 215);
  assert.equal(report.candidates[0].attributes.tv_channels_hd, 87);
});

test('validation preserves the complete allowlisted editor contract with normalized types', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({
    nazvanie_tarifa: 'Название в карточке', card_subtitle: 'Подзаголовок', show_on_site: 1,
    is_sticky: 0, srv_video_status: 1, router_installment_months: 12, badge_text: 'Хит',
  })]);

  assert.equal(report.errorRows, 0);
  assert.equal(report.candidates[0].attributes.nazvanie_tarifa, 'Название в карточке');
  assert.equal(report.candidates[0].attributes.card_subtitle, 'Подзаголовок');
  assert.equal(report.candidates[0].attributes.show_on_site, true);
  assert.equal(report.candidates[0].attributes.is_sticky, false);
  assert.equal(report.candidates[0].attributes.srv_video_status, 1);
  assert.equal(report.candidates[0].attributes.router_installment_months, 12);
});

test('validation rejects a non-empty column outside the current tariff field registry', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({ surprise_column: 'unexpected' })]);

  assert.equal(report.errorRows, 1);
  assert.match(report.issues[0].message, /surprise_column.*не входит.*контракт/i);
});

test('validation omits empty optional tariff details from attributes', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({
    opisanie_tarifa: '   ',
    tv_channels_total: null,
    tv_channels_hd: '',
  })]);

  assert.equal(report.errorRows, 0);
  assert.equal(Object.hasOwn(report.candidates[0].attributes, 'opisanie_tarifa'), false);
  assert.equal(Object.hasOwn(report.candidates[0].attributes, 'tv_channels_total'), false);
  assert.equal(Object.hasOwn(report.candidates[0].attributes, 'tv_channels_hd'), false);
});

test('validation rejects invalid TV channel counters', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ post_title_lat: 'negative-total', tv_channels_total: -2 }),
    row({ post_title_lat: 'fractional-hd', tv_channels_total: 100, tv_channels_hd: 10.5 }),
    row({ post_title_lat: 'hd-over-total', tv_channels_total: 50, tv_channels_hd: 51 }),
  ]);

  assert.equal(report.validRows, 0);
  assert.equal(report.errorRows, 3);
  assert.ok(report.issues.some((issue) => issue.message.includes('tv_channels_total должен быть целым')));
  assert.ok(report.issues.some((issue) => issue.message.includes('tv_channels_hd должен быть целым')));
  assert.ok(report.issues.some((issue) => issue.message.includes('не может быть больше tv_channels_total')));
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

test('validation accepts service status minus one from a string XLSX cell', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({ srv_video_status: '-1' })]);

  assert.equal(report.errorRows, 0);
  assert.equal(report.candidates[0].attributes.srv_video_status, -1);
});

test('validation reports duplicate business keys before apply', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row(), row()]);
  assert.equal(report.validRows, 0);
  assert.ok(report.issues.some((issue) => issue.message.includes('Дубликат ключа')));
});

test('validation rejects a city slug collision across different service types', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ tarif_type: 'Интернет' }),
    row({ tarif_type: 'Интернет+ТВ' }),
  ]);

  assert.equal(report.validRows, 0);
  assert.equal(report.errorRows, 2);
  assert.ok(report.issues.some((issue) => issue.message.includes('post_title_lat «giga-500»')));
  assert.ok(report.issues.some((issue) => issue.message.includes('городе «kazan»')));
});

test('validation rejects a tariff URL already occupied by a published page', async () => {
  const instance = new TariffImportService({
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', pages: [{ slug: 'internet' }] }] },
    tariff: { findMany: async () => [] },
  });

  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({ post_title_lat: 'internet' })]);

  assert.equal(report.errorRows, 1);
  assert.equal(report.validRows, 0);
  assert.match(report.issues[0].message, /URL \/kazan\/internet.*занят опубликованной страницей/i);
});

test('apply creates every validated row as one full package', async () => {
  const calls = [];
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => [] },
    $transaction: async (callback, options) => {
      assert.deepEqual(options, { isolationLevel: 'Serializable', timeout: 120_000 });
      return callback({
        page: { findMany: async () => [] },
        tariff: {
          findMany: async () => [],
          findFirst: async () => null,
          create: async ({ data }) => { calls.push(data); return { id: 'tariff-1' }; },
          update: async () => { throw new Error('unexpected update'); },
        },
      });
    },
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
    { id: 'keep', providerId: 'provider-1', cityId: 'city-1', name: 'Гига 500', slug: 'giga-500', identityKey: 'city-1:giga-500:internet', updatedAt: SNAPSHOT_TIME },
    { id: 'stale', providerId: 'provider-1', cityId: 'city-1', name: 'Старый 100', slug: 'old-100', identityKey: 'city-1:old-100:internet', updatedAt: SNAPSHOT_TIME },
  ];
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => records },
    $transaction: async (callback) => callback({
      page: { findMany: async () => [] },
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
  const original = [{ id: 'stale', providerId: 'provider-1', cityId: 'city-1', slug: 'stale', identityKey: 'city-1:stale:internet', updatedAt: SNAPSHOT_TIME }];
  let records = structuredClone(original);
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => records },
    $transaction: async (callback) => {
      const draft = structuredClone(records);
      const tx = {
        page: { findMany: async () => [] },
        tariff: {
          findMany: async () => draft,
          findFirst: async () => null,
          create: async () => { throw new Error('database write failed'); },
          update: async () => {},
          deleteMany: async ({ where }) => {
            for (let index = draft.length - 1; index >= 0; index -= 1) if (where.id.in.includes(draft[index].id)) draft.splice(index, 1);
          },
        },
      };
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

test('full snapshot apply records one audited working revision per affected site', async () => {
  const before = [{
    id: 'tariff-old', providerId: 'provider-1', cityId: 'city-1', name: 'Старый тариф', slug: 'old',
    serviceType: 'INTERNET', standardPrice: 500, promoPrice: null, speed: 100, promoText: null,
    connectionFee: null, availability: true, externalId: null, identityKey: 'city-1:old:internet',
    dataSource: 'old.xlsx', attributes: {}, seo: null, status: 'PUBLISHED',
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: SNAPSHOT_TIME,
  }];
  const records = structuredClone(before);
  let runUpdate;
  const revisions = [];
  const report = {
    reportVersion: 2, providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [],
    existingSnapshot: [{ id: 'tariff-old', updatedAt: SNAPSHOT_TIME.toISOString() }],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      page: { findMany: async () => [] },
      city: { findMany: async () => [{ id: 'city-1', siteId: 'site-1' }] },
      redirect: { findMany: async () => [] },
      tariff: {
        findMany: async () => records,
        deleteMany: async () => { records.splice(0, records.length); return { count: 1 }; },
      },
      tariffImportRun: {
        updateMany: async ({ data }) => { runUpdate = data; return { count: 1 }; },
      },
    }),
  };
  const publications = {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: 12 };
    },
  };

  const result = await new TariffImportService(prisma, publications).applyReport(
    report,
    { confirmWarnings: true },
    'run-1',
    'user-1',
  );

  assert.deepEqual(result.workingRevisions, [{ siteId: 'site-1', workingRevision: 12 }]);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].entityType, 'SITE');
  assert.equal(revisions[0].entityId, 'site-1');
  assert.equal(revisions[0].action, 'IMPORT');
  assert.equal(revisions[0].actorId, 'user-1');
  assert.equal(revisions[0].source, 'tariff-import:run-1');
  assert.equal(revisions[0].previousSnapshot.tariffs.length, 1);
  assert.equal(revisions[0].snapshot.tariffs.length, 0);
  assert.equal(runUpdate.status, 'APPLIED');
  assert.equal(runUpdate.appliedById, 'user-1');
  assert.equal(runUpdate.changeSet.version, 1);
  assert.equal(runUpdate.changeSet.kind, 'TARIFF_IMPORT');
  assert.deepEqual(runUpdate.changeSet.workingRevisions, [{ siteId: 'site-1', workingRevision: 12 }]);
});

test('tariff import controller preserves the working version and does not publish it', async () => {
  const report = { reportVersion: 2, providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [], existingSnapshot: [] };
  const queued = [];
  const prisma = {
    tariffImportRun: {
      findUnique: async () => ({ id: 'run-1', status: 'VALIDATED', report }),
      update: async () => { throw new Error('run status must be committed inside the import transaction'); },
      updateMany: async () => ({ count: 1 }),
    },
  };
  const imports = {
    applyReport: async (receivedReport, options, runId, actorId) => {
      assert.equal(receivedReport, report);
      assert.deepEqual(options, { confirmWarnings: false });
      assert.equal(runId, 'run-1');
      assert.equal(actorId, 'user-1');
      return { created: 0, updated: 0, deleted: 2, applied: 0, workingRevisions: [{ siteId: 'site-1', workingRevision: 7 }] };
    },
  };
  const controller = new AdminTariffsController(prisma, { enqueue: async (job) => queued.push(job) }, imports);

  const result = await controller.applyImport({ runId: 'run-1' }, { user: { id: 'user-1' } });

  assert.equal(result.deleted, 2);
  assert.deepEqual(result.workingRevisions, [{ siteId: 'site-1', workingRevision: 7 }]);
  assert.deepEqual(queued, []);
});

test('full snapshot rejects a catalog changed after validation before writing', async () => {
  let updated = false;
  const validatedTariff = {
    id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Гига 500', slug: 'giga-500',
    identityKey: 'city-1:giga-500:internet', updatedAt: SNAPSHOT_TIME,
  };
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => [validatedTariff] },
    $transaction: async (callback) => callback({
      tariff: {
        findMany: async () => [{ ...validatedTariff, updatedAt: new Date('2026-09-11T00:01:00.000Z') }],
        update: async () => { updated = true; },
      },
    }),
  };
  const instance = new TariffImportService(prisma);
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);

  await assert.rejects(instance.applyReport(report, { confirmWarnings: true }), /изменился после проверки/i);
  assert.equal(updated, false);
});

test('full snapshot rechecks published page URL collisions inside apply transaction', async () => {
  let writes = 0;
  const instance = service();
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);
  const applying = new TariffImportService({
    $transaction: async (callback) => callback({
      tariff: { findMany: async () => [], create: async () => { writes += 1; } },
      page: { findMany: async () => [{ cityId: 'city-1', slug: 'giga-500' }] },
    }),
  });

  await assert.rejects(applying.applyReport(report, { confirmWarnings: true }), /URL тарифа занят опубликованной страницей/i);
  assert.equal(writes, 0);
});

test('legacy tariff reports without a catalog snapshot require revalidation', async () => {
  let transactionCalled = false;
  const instance = new TariffImportService({ $transaction: async () => { transactionCalled = true; } });

  await assert.rejects(
    instance.applyReport({ providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [] }),
    /старом формате.*проверьте файл заново/i,
  );
  assert.equal(transactionCalled, false);
});

test('concurrent full snapshot apply cannot claim the same validated run twice', async () => {
  let writes = 0;
  const report = { reportVersion: 2, providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [], existingSnapshot: [] };
  const prisma = {
    $transaction: async (callback) => callback({
      tariff: { findMany: async () => [], create: async () => { writes += 1; } },
      tariffImportRun: { updateMany: async () => ({ count: 0 }) },
    }),
  };

  await assert.rejects(
    new TariffImportService(prisma).applyReport(report, { confirmWarnings: true }, 'run-1'),
    /уже применен или его статус изменился/i,
  );
  assert.equal(writes, 0);
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

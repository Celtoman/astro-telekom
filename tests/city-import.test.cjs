const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CityImportService } = require('../apps/api/dist/city-import.service.js');
const { AdminCitiesController } = require('../apps/api/dist/admin-cities.controller.js');
const { parseWorkbook } = require('../apps/api/dist/tariff-import.service.js');

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

const candidate = (overrides = {}) => ({
  key: 'kazan', row: 2, siteId: 'site-1', subject: 'Республика Татарстан', name: 'Казань',
  nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани', slug: 'kazan',
  legacyUrl: null, officeAddress: null, officeHours: null, ...overrides,
});

test('city import accepts the agreed Russian XLSX aliases', async () => {
  const report = await new CityImportService(validationPrisma()).validateRows('site-1', 'cities.xlsx', [row()]);
  assert.equal(report.errorRows, 0);
  assert.equal(report.validRows, 1);
  assert.equal(report.candidates[0].slug, 'aleysk');
  assert.equal(report.candidates[0].namePrepositional, 'Алейске');
  assert.equal(report.candidates[0].legacyUrl, 'https://tarify-dom.ru/aleysk');
});

test('canonical city workbook validates all 207 rows and preserves Kazan cases', async () => {
  const workbookPath = path.join(__dirname, '..', 'data', 'imports', 'cities.xlsx');
  const rows = await parseWorkbook(fs.readFileSync(workbookPath), 'cities.xlsx');
  const report = await new CityImportService(validationPrisma()).validateRows('site-1', 'cities.xlsx', rows);
  const kazan = report.candidates.find((candidate) => candidate.slug === 'kazan');

  assert.equal(report.totalRows, 207);
  assert.equal(report.validRows, 207);
  assert.equal(report.errorRows, 0);
  assert.equal(report.warningRows, 0);
  assert.equal(kazan.name, 'Казань');
  assert.equal(kazan.namePrepositional, 'Казани');
  assert.equal(kazan.nameGenitive, 'Казани');
});

test('city import blocks duplicate slugs and missing required values', async () => {
  const report = await new CityImportService(validationPrisma()).validateRows('site-1', 'cities.xlsx', [row(), row(), row({ slug: '' })]);
  assert.equal(report.validRows, 0);
  assert.ok(report.issues.some((issue) => issue.message.includes('Дубликат slug')));
  assert.ok(report.issues.some((issue) => issue.message.includes('Не указан slug')));
});

test('validation exposes row, region diff and an existing snapshot for safe review', async () => {
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1' }) },
    city: { findMany: async () => [{
      id: 'city-1', regionId: 'region-old', slug: 'kazan', name: 'Казань',
      nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани',
      legacyUrl: null, officeAddress: null, officeHours: null,
      region: { name: 'Старый регион' },
    }] },
  };

  const report = await new CityImportService(prisma).validateRows('site-1', 'cities.xlsx', [row({
    'Субъект РФ': 'Республика Татарстан',
    'Город имен. падеж': 'Казань',
    'Город предлож. падеж - dom_ru_v': 'Казани',
    'Город родит. падеж': 'Казани',
    slug: 'kazan',
    adres_ofisa: '',
    rezhim_raboty_ofisa: '',
  })]);

  assert.equal(report.candidates[0].row, 2);
  assert.deepEqual(report.candidates[0].changes.subject, { from: 'Старый регион', to: 'Республика Татарстан' });
  assert.deepEqual(report.candidates[0].existingSnapshot, {
    id: 'city-1', regionId: 'region-old', subject: 'Старый регион', name: 'Казань',
    nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани',
    legacyUrl: null, officeAddress: null, officeHours: null,
  });
});

test('new city creates one published city home for the full Release 1 catalog', async () => {
  const pages = [];
  const calls = [];
  const cities = [];
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1' }) },
    city: { findMany: async () => [] },
    $transaction: async (callback, options) => {
      assert.deepEqual(options, { timeout: 30_000, isolationLevel: 'Serializable' });
      return callback({
        region: { findMany: async () => [], create: async ({ data }) => ({ id: 'region-1', ...data }) },
        city: { findMany: async () => [], create: async ({ data }) => { cities.push(data); return { id: 'city-1', ...data }; }, update: async () => ({}) },
        page: { createMany: async ({ data }) => { pages.push(...data); return { count: data.length }; } },
      });
    },
  };
  const service = new CityImportService(prisma);
  const report = await service.validateRows('site-1', 'cities.xlsx', [row()]);
  const result = await service.applyReport(report, { aleysk: 'create' });
  calls.push(result);
  assert.equal(result.created, 1);
  assert.equal(result.pagesCreated, 1);
  assert.deepEqual(pages.map((page) => ({ type: page.type, slug: page.slug, status: page.status })), [
    { type: 'HOME', slug: '', status: 'PUBLISHED' },
  ]);
  assert.equal(cities[0].status, 'PUBLISHED');
});

test('city import reuses a seed region with the same normalized slug', async () => {
  let regionCreated = false;
  const prisma = {
    ...validationPrisma(),
    $transaction: async (callback) => callback({
      region: {
        findMany: async () => [{ id: 'seed-region', name: 'Республика Татарстан', slug: 'tatarstan' }],
        create: async () => { regionCreated = true; },
      },
      city: {
        findMany: async () => [],
        create: async ({ data }) => ({ id: 'city-kazan-2', ...data }),
      },
      page: { createMany: async ({ data }) => ({ count: data.length }) },
    }),
  };
  const report = await new CityImportService(prisma).validateRows('site-1', 'cities.xlsx', [row({
    'Субъект РФ': 'Татарстан',
    'Город имен. падеж': 'Зеленодольск',
    'Город предлож. падеж - dom_ru_v': 'Зеленодольске',
    'Город родит. падеж': 'Зеленодольска',
    slug: 'zelenodolsk',
  })]);

  const result = await new CityImportService(prisma).applyReport(report, { zelenodolsk: 'create' });

  assert.equal(result.created, 1);
  assert.equal(regionCreated, false);
});

test('city import warnings require explicit confirmation before apply', async () => {
  let transactionCalled = false;
  const prisma = {
    ...validationPrisma(),
    $transaction: async () => { transactionCalled = true; },
  };
  const report = await new CityImportService(prisma).validateRows('site-1', 'cities.xlsx', [row({
    'Город родит. падеж': '',
  })]);
  const service = new CityImportService(prisma);

  await assert.rejects(service.applyReport(report, { aleysk: 'create' }), /подтвердить предупреждения/i);
  assert.equal(transactionCalled, false);
});

test('city import applies an explicit create, update and skip action map atomically', async () => {
  const updated = [];
  const created = [];
  const pages = [];
  let transactionOptions;
  const currentUpdate = {
    id: 'city-update', siteId: 'site-1', regionId: 'region-1', slug: 'kazan', name: 'Старое имя',
    nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани',
    legacyUrl: null, officeAddress: null, officeHours: null, region: { name: 'Республика Татарстан' },
  };
  const currentSkip = {
    id: 'city-skip', siteId: 'site-1', regionId: 'region-1', slug: 'innopolis', name: 'Иннополис',
    nameInstrumental: null, namePrepositional: 'Иннополисе', nameGenitive: 'Иннополиса',
    legacyUrl: null, officeAddress: null, officeHours: null, region: { name: 'Республика Татарстан' },
  };
  const report = {
    reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0,
    candidates: [
      candidate({ existingId: 'city-update', existingSnapshot: {
        name: 'Старое имя', officeHours: null, id: 'city-update', subject: 'Республика Татарстан',
        legacyUrl: null, regionId: 'region-1', namePrepositional: 'Казани', officeAddress: null,
        nameGenitive: 'Казани', nameInstrumental: null,
      } }),
      candidate({ key: 'innopolis', slug: 'innopolis', name: 'Иннополис', existingId: 'city-skip', existingSnapshot: {
        id: 'city-skip', regionId: 'region-1', subject: 'Республика Татарстан', name: 'Иннополис',
        nameInstrumental: null, namePrepositional: 'Иннополисе', nameGenitive: 'Иннополиса',
        legacyUrl: null, officeAddress: null, officeHours: null,
      } }),
      candidate({ key: 'zelenodolsk', slug: 'zelenodolsk', name: 'Зеленодольск' }),
    ],
  };
  const prisma = {
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback({
        region: { findMany: async () => [{ id: 'region-1', siteId: 'site-1', name: 'Республика Татарстан', slug: 'respublika-tatarstan' }] },
        city: {
          findMany: async () => [currentUpdate, currentSkip],
          update: async ({ where, data }) => { updated.push({ where, data }); return { ...currentUpdate, ...data }; },
          create: async ({ data }) => { created.push(data); return { id: 'city-new', ...data }; },
        },
        page: { createMany: async ({ data }) => { pages.push(...data); return { count: data.length }; } },
      });
    },
  };

  const result = await new CityImportService(prisma).applyReport(report, {
    kazan: 'update', innopolis: 'skip', zelenodolsk: 'create',
  });

  assert.deepEqual(result, { created: 1, updated: 1, skipped: 1, pagesCreated: 1 });
  assert.deepEqual(updated.map((item) => item.where.id), ['city-update']);
  assert.equal(updated[0].data.status, 'PUBLISHED');
  assert.equal(created.length, 1);
  assert.equal(created[0].status, 'PUBLISHED');
  assert.equal(pages.length, 1);
  assert.equal(transactionOptions.isolationLevel, 'Serializable');
});

test('city import rejects missing, unknown, invalid and state-incompatible actions before writes', async () => {
  let transactionCalled = false;
  const service = new CityImportService({
    $transaction: async () => { transactionCalled = true; },
  });
  const report = {
    reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0,
    candidates: [candidate({ existingId: 'city-1', existingSnapshot: { id: 'city-1' } })],
  };

  await assert.rejects(service.applyReport(report, {}), /не выбрано действие/i);
  await assert.rejects(service.applyReport(report, { kazan: 'skip', other: 'skip' }), /не относится к .*отчету/i);
  await assert.rejects(service.applyReport(report, { kazan: 'delete' }), /недопустимое действие/i);
  await assert.rejects(service.applyReport(report, { kazan: 'create' }), /уже существует/i);
  await assert.rejects(service.applyReport({ ...report, candidates: [candidate()] }, { kazan: 'update' }), /не найден для обновления/i);
  assert.equal(transactionCalled, false);
});

test('city import rejects a stale changed-city snapshot instead of overwriting newer data', async () => {
  let updated = false;
  const report = {
    reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0,
    candidates: [candidate({ existingId: 'city-1', existingSnapshot: {
      id: 'city-1', regionId: 'region-1', subject: 'Республика Татарстан', name: 'Старое имя',
      nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани',
      legacyUrl: null, officeAddress: null, officeHours: null,
    } })],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      region: { findMany: async () => [{ id: 'region-1', name: 'Республика Татарстан', slug: 'respublika-tatarstan' }] },
      city: { findMany: async () => [{
        id: 'city-1', regionId: 'region-1', slug: 'kazan', name: 'Новое имя из другой сессии',
        nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани',
        legacyUrl: null, officeAddress: null, officeHours: null, region: { name: 'Республика Татарстан' },
      }], update: async () => { updated = true; } },
    }),
  };

  await assert.rejects(
    new CityImportService(prisma).applyReport(report, { kazan: 'update' }),
    /изменился после проверки/i,
  );
  assert.equal(updated, false);
});

test('city import controller forwards the complete action map and queues one rebuild after success', async () => {
  const actions = { kazan: 'update', innopolis: 'skip' };
  const report = { reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0, candidates: [] };
  const calls = [];
  const prisma = {
    cityImportRun: {
      findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'VALIDATED', report }),
      update: async ({ data }) => { calls.push(['run', data.status]); },
    },
  };
  const imports = { applyReport: async (received, receivedActions, confirmWarnings, runId) => {
    assert.equal(received, report);
    assert.deepEqual(receivedActions, actions);
    assert.equal(confirmWarnings, true);
    assert.equal(runId, 'run-1');
    return { created: 0, updated: 1, skipped: 1, pagesCreated: 0 };
  } };
  const rebuild = { enqueue: async (job) => { calls.push(['rebuild', job]); } };

  const result = await new AdminCitiesController(prisma, rebuild, imports).applyImport({
    runId: 'run-1', actions, confirmWarnings: true,
  });

  assert.equal(result.updated, 1);
  assert.deepEqual(calls, [
    ['rebuild', { entity: 'city-import', id: 'run-1', siteId: 'site-1' }],
  ]);
});

test('city import controller never downgrades an applied run when rebuild enqueue fails', async () => {
  const runUpdates = [];
  const report = { reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0, candidates: [] };
  const prisma = {
    cityImportRun: {
      findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'VALIDATED', report }),
      update: async ({ data }) => { runUpdates.push(data.status); },
    },
  };
  const imports = { applyReport: async (_report, _actions, _confirmWarnings, runId) => {
    assert.equal(runId, 'run-1');
    return { created: 0, updated: 0, skipped: 0, pagesCreated: 0 };
  } };
  const rebuild = { enqueue: async () => { throw new Error('queue unavailable'); } };

  await assert.rejects(
    new AdminCitiesController(prisma, rebuild, imports).applyImport({ runId: 'run-1', actions: {} }),
    /queue unavailable/,
  );
  assert.deepEqual(runUpdates, []);
});

test('city import run can be applied only once and a losing request cannot downgrade APPLIED', async () => {
  let runStatus = 'VALIDATED';
  const report = {
    reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0,
    candidates: [candidate({ existingId: 'city-1', existingSnapshot: {
      id: 'city-1', regionId: 'region-1', subject: 'Республика Татарстан', name: 'Казань',
      nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани',
      legacyUrl: null, officeAddress: null, officeHours: null,
    } })],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      region: { findMany: async () => [] },
      city: { findMany: async () => [] },
      cityImportRun: { updateMany: async ({ where, data }) => {
        assert.deepEqual(where, { id: 'run-1', status: { not: 'APPLIED' } });
        if (runStatus === 'APPLIED') return { count: 0 };
        runStatus = data.status;
        return { count: 1 };
      } },
    }),
  };
  const service = new CityImportService(prisma);

  await service.applyReport(report, { kazan: 'skip' }, false, 'run-1');
  await assert.rejects(service.applyReport(report, { kazan: 'skip' }, false, 'run-1'), /уже применен/i);
  assert.equal(runStatus, 'APPLIED');

  const failureUpdates = [];
  const controller = new AdminCitiesController({
    cityImportRun: {
      findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'VALIDATED', report }),
      updateMany: async (request) => { failureUpdates.push(request); return { count: 0 }; },
    },
  }, { enqueue: async () => {} }, { applyReport: async () => { throw new Error('serialization conflict'); } });
  await assert.rejects(controller.applyImport({ runId: 'run-1', actions: { kazan: 'skip' } }), /serialization conflict/);
  assert.deepEqual(failureUpdates[0].where, { id: 'run-1', status: { not: 'APPLIED' } });
});

test('city import rejects legacy validation reports with an explicit revalidation message', async () => {
  let transactionCalled = false;
  const service = new CityImportService({
    $transaction: async () => { transactionCalled = true; },
  });

  await assert.rejects(
    service.applyReport({ siteId: 'site-1', errorRows: 0, warningRows: 0, candidates: [candidate()] }, { kazan: 'create' }),
    /старом формате.*проверьте файл заново/i,
  );
  assert.equal(transactionCalled, false);
});

test('unpublishing a city disables every managed tariff redirect in the same transaction', async () => {
  const redirectUpdates = [];
  const tx = {
    city: {
      findUnique: async () => ({ status: 'PUBLISHED' }),
      update: async ({ data }) => ({ id: 'city-1', siteId: 'site-1', status: data.status }),
    },
    tariff: {
      findMany: async () => [
        { id: 'tariff-published', status: 'PUBLISHED' },
        { id: 'tariff-draft', status: 'DRAFT' },
      ],
    },
    redirect: { updateMany: async (query) => { redirectUpdates.push(query); return { count: 2 }; } },
  };
  const rebuilds = [];
  const controller = new AdminCitiesController(
    { $transaction: async (callback) => callback(tx) },
    { enqueue: async (job) => { rebuilds.push(job); } },
    {},
  );

  const result = await controller.update('city-1', { status: 'DRAFT' });

  assert.equal(result.status, 'DRAFT');
  assert.deepEqual(redirectUpdates, [{
    where: { siteId: 'site-1', managedTariffId: { in: ['tariff-published', 'tariff-draft'] } },
    data: { status: 'DRAFT' },
  }]);
  assert.equal(rebuilds[0].siteId, 'site-1');
});

test('city import CLI requires an operator-provided action map instead of inventing row decisions', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'import-cities.mjs'), 'utf8');
  assert.match(source, /apply\s*&&\s*!actionsPath/);
  assert.match(source, /JSON\.parse\(await readFile\(actionsPath/);
  assert.match(source, /runId:\s*validation\.runId,\s*actions/);
  assert.doesNotMatch(source, /candidate\.existingId\s*\?\s*'update'\s*:\s*'create'/);
  assert.doesNotMatch(source, /CITY_IMPORT_PUBLISHED_SLUG/);
  assert.doesNotMatch(source, /expectedStatus/);
});

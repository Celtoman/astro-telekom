const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CityImportService, isCityImportChangeSet } = require('../apps/api/dist/city-import.service.js');
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
  namePrepositional: 'Казани', nameGenitive: 'Казани', slug: 'kazan',
  legacyUrl: null, officeAddress: null, officeHours: null, ...overrides,
});

const storedCity = (overrides = {}) => ({
  id: 'city-1', siteId: 'site-1', regionId: 'region-1', name: 'Казань', slug: 'kazan',
  namePrepositional: 'Казани', nameGenitive: 'Казани', legacyUrl: null,
  officeAddress: null, officeHours: null, officeState: 'NO_OFFICE', subscriberProfileKey: null,
  status: 'PUBLISHED', ...overrides,
});

const storedPage = (overrides = {}) => ({
  id: 'page-1', siteId: 'site-1', cityId: 'city-created', type: 'HOME', title: 'Домашний интернет',
  slug: '', status: 'PUBLISHED', seo: {}, content: {}, createdAt: '2026-09-14T12:00:00.000Z',
  updatedAt: '2026-09-14T12:00:00.000Z', blocks: [
    'hero', 'service_grid', 'tariff_grid', 'steps', 'feature_grid', 'feature_grid', 'faq',
  ].map((blockType, index) => ({
    id: `block-${index + 1}`, pageId: 'page-1', blockType, position: (index + 1) * 10, visible: true,
    data: { title: `Блок ${index + 1}` }, source: 'template:city-home:v1',
  })),
  ...overrides,
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
    namePrepositional: 'Казани', nameGenitive: 'Казани',
    legacyUrl: null, officeAddress: null, officeHours: null,
  });
});

test('new city remains a draft and creates one canonical city home', async () => {
  const pages = [];
  const pageCreates = [];
  const calls = [];
  const cities = [];
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1' }) },
    city: { findMany: async () => [] },
    $transaction: async (callback, options) => {
      assert.deepEqual(options, { timeout: 30_000, isolationLevel: 'Serializable' });
      return callback({
        pageTemplate: { findUnique: async ({ where }) => where.siteId_kind.kind === 'CITY_HOME' ? ({ id: 'template-city-home' }) : null },
        region: { findMany: async () => [], create: async ({ data }) => ({ id: 'region-1', ...data }) },
        city: { findMany: async () => [], create: async ({ data }) => { cities.push(data); return { id: 'city-1', ...data }; }, update: async () => ({}) },
        page: {
          createMany: async ({ data }) => { pages.push(...data); return { count: data.length }; },
          create: async ({ data }) => { pageCreates.push(data); return { id: 'page-1', ...data }; },
        },
      });
    },
  };
  const service = new CityImportService(prisma);
  const report = await service.validateRows('site-1', 'cities.xlsx', [row()]);
  const result = await service.applyReport(report, { aleysk: 'create' });
  calls.push(result);
  assert.equal(result.created, 1);
  assert.equal(result.pagesCreated, 1);
  const createdPages = pageCreates.length > 0 ? pageCreates : pages;
  assert.deepEqual(createdPages.map((page) => ({ type: page.type, slug: page.slug, status: page.status })), [
    { type: 'HOME', slug: '', status: 'PUBLISHED' },
  ]);
  assert.equal(pageCreates[0].templateId, 'template-city-home');
  assert.equal(pageCreates[0].blocks, undefined);
  assert.equal(cities[0].status, 'DRAFT');
});

test('city import reuses a seed region with the same normalized slug', async () => {
  let regionCreated = false;
  const prisma = {
    ...validationPrisma(),
    $transaction: async (callback) => callback({
      pageTemplate: { findUnique: async ({ where }) => where.siteId_kind.kind === 'CITY_HOME' ? ({ id: 'template-city-home' }) : null },
      region: {
        findMany: async () => [{ id: 'seed-region', name: 'Республика Татарстан', slug: 'tatarstan' }],
        create: async () => { regionCreated = true; },
      },
      city: {
        findMany: async () => [],
        create: async ({ data }) => ({ id: 'city-kazan-2', ...data }),
      },
      page: {
        createMany: async ({ data }) => ({ count: data.length }),
        create: async ({ data }) => ({ id: 'page-zelenodolsk', ...data }),
      },
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
        pageTemplate: { findUnique: async ({ where }) => where.siteId_kind.kind === 'CITY_HOME' ? ({ id: 'template-city-home' }) : null },
        region: { findMany: async () => [{ id: 'region-1', siteId: 'site-1', name: 'Республика Татарстан', slug: 'respublika-tatarstan' }] },
        city: {
          findMany: async () => [currentUpdate, currentSkip],
          update: async ({ where, data }) => { updated.push({ where, data }); return { ...currentUpdate, ...data }; },
          create: async ({ data }) => { created.push(data); return { id: 'city-new', ...data }; },
        },
        page: {
          createMany: async ({ data }) => { pages.push(...data); return { count: data.length }; },
          create: async ({ data }) => { pages.push(data); return { id: 'page-new', ...data }; },
        },
      });
    },
  };

  const result = await new CityImportService(prisma).applyReport(report, {
    kazan: 'update', innopolis: 'skip', zelenodolsk: 'create',
  });

  assert.deepEqual(result, { created: 1, updated: 1, skipped: 1, pagesCreated: 1 });
  assert.deepEqual(updated.map((item) => item.where.id), ['city-update']);
  assert.equal(updated[0].data.status, undefined);
  assert.equal(created.length, 1);
  assert.equal(created[0].status, 'DRAFT');
  assert.equal(pages.length, 1);
  assert.equal(transactionOptions.isolationLevel, 'Serializable');
});

test('city import apply records an attributed working snapshot without publishing it', async () => {
  const current = {
    id: 'city-1', siteId: 'site-1', regionId: 'region-1', slug: 'kazan', name: 'Старое имя',
    nameInstrumental: null, namePrepositional: 'Казани', nameGenitive: 'Казани', legacyUrl: null,
    officeAddress: null, officeHours: null, status: 'DRAFT', phone: '+70000000000', supportPhone: null,
    seo: {}, content: {}, region: { name: 'Республика Татарстан' },
  };
  let city = structuredClone(current);
  let runUpdate;
  const revisions = [];
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
      pageTemplate: { findUnique: async ({ where }) => where.siteId_kind.kind === 'CITY_HOME' ? ({ id: 'template-city-home' }) : null },
      region: {
        findMany: async () => [{ id: 'region-1', siteId: 'site-1', name: 'Республика Татарстан', slug: 'respublika-tatarstan', phone: null, content: null }],
      },
      city: {
        findMany: async () => [city],
        update: async ({ data }) => { city = { ...city, ...data }; return city; },
      },
      page: { findMany: async () => [] },
      cityImportRun: {
        updateMany: async ({ where, data }) => {
          assert.deepEqual(where, { id: 'run-1', status: 'VALIDATED' });
          runUpdate = data;
          return { count: 1 };
        },
      },
    }),
  };
  const publications = {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: 18 };
    },
  };

  const result = await new CityImportService(prisma, publications).applyReport(
    report,
    { kazan: 'update' },
    false,
    'run-1',
    'user-1',
  );

  assert.equal(result.workingRevision, 18);
  assert.equal(runUpdate.status, 'APPLIED');
  assert.equal(runUpdate.appliedById, 'user-1');
  assert.equal(runUpdate.changeSet.version, 1);
  assert.equal(runUpdate.changeSet.kind, 'CITY_IMPORT');
  assert.equal(runUpdate.changeSet.beforeCities[0].status, 'DRAFT');
  assert.equal(runUpdate.changeSet.afterCities[0].status, 'DRAFT');
  assert.equal(runUpdate.changeSet.workingRevision, 18);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].action, 'IMPORT');
  assert.equal(revisions[0].actorId, 'user-1');
  assert.equal(revisions[0].source, 'city-import:run-1');
  assert.deepEqual(revisions[0].changedFields, ['cities']);
});

for (const withAddress of [false, true]) test(`city import captures complete undo pages, ADDRESS=${withAddress}`, async () => {
  let city;
  const pages = [];
  let runUpdate;
  const report = {
    reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0,
    candidates: [candidate({ key: 'novyy-gorod', slug: 'novyy-gorod', name: 'Новый город', subject: 'Новый регион' })],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      pageTemplate: { findUnique: async ({ where }) => where.siteId_kind.kind === 'CITY_HOME' ? ({ id: 'template-city-home' }) : where.siteId_kind.kind==='CITY_ADDRESS_CHECK' && withAddress ? ({ id: 'template-address', titleTemplate: 'Проверка' }) : null },
      region: {
        findMany: async () => [],
        create: async ({ data }) => ({ id: 'region-created', ...data, phone: null, content: null }),
      },
      city: {
        findMany: async (query) => query.where.slug ? [] : [city],
        create: async ({ data }) => {
          city = { id: 'city-created', ...data, phone: null, supportPhone: null };
          return city;
        },
      },
      page: {
        create: async ({ data }) => {
          const createdAt = new Date('2026-09-14T12:00:00.000Z');
          const page = {
            id: 'page-created', siteId: data.siteId, cityId: data.cityId, type: data.type, title: data.title,
            slug: data.slug, status: data.status, seo: null, content: null, templateId: data.templateId,
            createdAt, updatedAt: createdAt, blocks: [],
          };
          pages.push(page); return { id: page.id };
        },
        upsert: async ({ create }) => { const page = { id: 'page-created-address', ...create, content: null, createdAt: new Date('2026-09-14T12:00:00.000Z'), updatedAt: new Date('2026-09-14T12:00:00.000Z'), blocks: [] }; pages.push(page); return page; },
        findMany: async () => pages,
      },
      cityImportRun: {
        updateMany: async ({ data }) => { runUpdate = data; return { count: 1 }; },
      },
    }),
  };

  const result = await new CityImportService(prisma, {
    recordWorkingRevision: async () => ({ siteRevision: 18 }),
  }).applyReport(report, { 'novyy-gorod': 'create' }, false, 'run-1', 'user-1');

  assert.equal(result.workingRevision, 18);
  assert.equal(isCityImportChangeSet(runUpdate.changeSet), true);
  assert.deepEqual(runUpdate.changeSet.createdCityIds, ['city-created']);
  assert.deepEqual(runUpdate.changeSet.createdRegions.map((region) => region.id), ['region-created']);
  assert.equal(runUpdate.changeSet.createdPages.length, withAddress ? 2 : 1);
  assert.equal(result.pagesCreated, withAddress ? 2 : 1);
  assert.equal(runUpdate.changeSet.createdPages.find(page => page.type === 'HOME').id, 'page-created');
  assert.equal(runUpdate.changeSet.createdPages[0].blocks.length, 0);
  assert.equal(runUpdate.changeSet.createdPages[0].templateId, 'template-city-home');
});

for (const withAddress of [false, true]) test(`safe city import undo removes only captured records, ADDRESS=${withAddress}`, async () => {
  const beforeCity = storedCity({ id: 'city-existing', name: 'Старое имя', status: 'DRAFT' });
  const afterCity = storedCity({ id: 'city-existing', name: 'Новое имя' });
  const createdCity = storedCity({ id: 'city-created', regionId: 'region-created', name: 'Новый город', slug: 'novyy-gorod' });
  const createdRegion = { id: 'region-created', siteId: 'site-1', name: 'Новый регион', slug: 'novyy-region', phone: null, content: null };
  const savedPage = storedPage();
  const savedPages = [savedPage, ...(withAddress ? [{ ...savedPage, id: 'page-created-address', type: 'ADDRESS_CHECK', slug: 'proverka-podklyucheniya-k-domru-po-adresu', templateId: 'template-address', blocks: [] }] : [])];
  const changeSet = {
    version: 1,
    kind: 'CITY_IMPORT',
    siteId: 'site-1',
    runId: 'run-1',
    actions: { kazan: 'update', 'novyy-gorod': 'create' },
    createdCityIds: ['city-created'],
    beforeCities: [beforeCity],
    afterCities: [afterCity, createdCity].sort((left, right) => left.id.localeCompare(right.id)),
    createdRegions: [createdRegion],
    createdPages: savedPages,
    workingRevision: 18,
  };
  let cities = structuredClone(changeSet.afterCities);
  let regions = structuredClone(changeSet.createdRegions);
  let pages = savedPages.map(page => ({ ...structuredClone(page), createdAt: new Date(page.createdAt), updatedAt: new Date(page.updatedAt) }));
  let runUpdate;
  const revisions = [];
  const prisma = {
    $transaction: async (callback, options) => {
      assert.deepEqual(options, { isolationLevel: 'Serializable', timeout: 30_000 });
      return callback({
        cityImportRun: {
          findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'APPLIED', changeSet }),
          updateMany: async ({ where, data }) => {
            assert.deepEqual(where, { id: 'run-1', status: 'APPLIED' });
            runUpdate = data;
            return { count: 1 };
          },
        },
        city: {
          findMany: async () => cities,
          findFirst: async () => null,
          update: async ({ where, data }) => {
            cities = cities.map((city) => city.id === where.id ? { ...city, ...data } : city);
            return cities.find((city) => city.id === where.id);
          },
          deleteMany: async ({ where }) => {
            const removed = cities.filter((city) => where.id.in.includes(city.id)).length;
            cities = cities.filter((city) => !where.id.in.includes(city.id));
            return { count: removed };
          },
        },
        page: {
          findMany: async () => pages,
          findFirst: async () => null,
          deleteMany: async ({ where }) => {
            const removed = pages.filter((page) => where.id.in.includes(page.id)).length;
            pages = pages.filter((page) => !where.id.in.includes(page.id));
            return { count: removed };
          },
        },
        region: {
          findMany: async () => regions,
          deleteMany: async ({ where }) => {
            const removed = regions.filter((region) => where.id.in.includes(region.id)).length;
            regions = regions.filter((region) => !where.id.in.includes(region.id));
            return { count: removed };
          },
        },
        contentRevision: { findFirst: async () => null },
        tariff: { findFirst: async () => null },
        lead: { findFirst: async () => null },
        addressCheck: { findFirst: async () => null },
        redirect: { findFirst: async () => null },
      });
    },
  };
  const publications = {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: 19 };
    },
  };

  const service = new CityImportService(prisma, publications);
  if (withAddress) {
    const address = changeSet.createdPages.find(page => page.type === 'ADDRESS_CHECK');
    address.slug = 'wrong-address';
    await assert.rejects(service.undoImport('run-1', 'user-1'), /нет полного безопасного снимка/);
    address.slug = 'proverka-podklyucheniya-k-domru-po-adresu';
    const templateId = address.templateId; address.templateId = '';
    await assert.rejects(service.undoImport('run-1', 'user-1'), /нет полного безопасного снимка/);
    address.templateId = templateId;
  }
  changeSet.createdPages[0].seo = { title: 'Исторический title' };
  await assert.rejects(service.undoImport('run-1', 'user-1'), /SEO override/);
  assert.equal(runUpdate, undefined);
  changeSet.createdPages[0].seo = {};
  const result = await service.undoImport('run-1', 'user-1');

  assert.deepEqual(result, {
    runId: 'run-1', restored: 1, removedCities: 1, removedPages: withAddress ? 2 : 1, removedRegions: 1, workingRevision: 19,
  });
  assert.deepEqual(cities, [beforeCity]);
  assert.deepEqual(pages, []);
  assert.deepEqual(regions, []);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].action, 'UNDO');
  assert.equal(revisions[0].actorId, 'user-1');
  assert.equal(revisions[0].source, 'city-import-undo:run-1');
  assert.deepEqual(revisions[0].changedFields, ['cities', 'regions', 'pages']);
  assert.equal(runUpdate.status, 'UNDONE');
  assert.equal(runUpdate.undoneById, 'user-1');
  assert.deepEqual(runUpdate.undoSiteRevisions, [{ siteId: 'site-1', workingRevision: 19 }]);
});

test('safe city import undo rejects changed snapshots and later audited mutations', async (t) => {
  const beforeCity = storedCity({ name: 'Старое имя', status: 'DRAFT' });
  const afterCity = storedCity({ name: 'Новое имя' });
  const changeSet = {
    version: 1, kind: 'CITY_IMPORT', siteId: 'site-1', runId: 'run-1', actions: { kazan: 'update' },
    createdCityIds: [], beforeCities: [beforeCity], afterCities: [afterCity], createdRegions: [], createdPages: [], workingRevision: 18,
  };

  await t.test('changed city blocks undo before any write', async () => {
    let writes = 0;
    const prisma = { $transaction: async (callback) => callback({
      cityImportRun: { findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'APPLIED', changeSet }) },
      city: { findMany: async () => [{ ...afterCity, name: 'Более новое имя' }] },
      page: { findMany: async () => [] },
      region: { findMany: async () => [] },
      contentRevision: { findFirst: async () => { writes += 1; return null; } },
    }) };

    await assert.rejects(
      new CityImportService(prisma, { recordWorkingRevision: async () => { writes += 1; } }).undoImport('run-1', 'user-1'),
      /города изменены после импорта/i,
    );
    assert.equal(writes, 0);
  });

  await t.test('later city revision blocks undo even when values match again', async () => {
    let writes = 0;
    let revisionQuery;
    const prisma = { $transaction: async (callback) => callback({
      cityImportRun: { findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'APPLIED', changeSet }) },
      city: { findMany: async () => [afterCity] },
      page: { findMany: async () => [] },
      region: { findMany: async () => [] },
      contentRevision: { findFirst: async (query) => { revisionQuery = query; return { id: 'revision-later' }; } },
    }) };

    await assert.rejects(
      new CityImportService(prisma, { recordWorkingRevision: async () => { writes += 1; } }).undoImport('run-1', 'user-1'),
      /изменялись после импорта/i,
    );
    assert.equal(writes, 0);
    assert.deepEqual(revisionQuery.where.OR[0], { entityType: 'SITE', source: { startsWith: 'city-import' } });
  });
});

test('safe city import undo blocks deletion of a new city with runtime dependencies', async () => {
  const createdCity = storedCity({ id: 'city-created' });
  const savedPage = storedPage();
  const changeSet = {
    version: 1, kind: 'CITY_IMPORT', siteId: 'site-1', runId: 'run-1', actions: { kazan: 'create' },
    createdCityIds: ['city-created'], beforeCities: [], afterCities: [createdCity], createdRegions: [],
    createdPages: [savedPage], workingRevision: 18,
  };
  let writes = 0;
  const prisma = { $transaction: async (callback) => callback({
    cityImportRun: { findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'APPLIED', changeSet }) },
    city: { findMany: async () => [createdCity], findFirst: async () => null },
    page: {
      findMany: async () => [{ ...savedPage, createdAt: new Date(savedPage.createdAt), updatedAt: new Date(savedPage.updatedAt) }],
      findFirst: async () => null,
    },
    region: { findMany: async () => [] },
    contentRevision: { findFirst: async () => null },
    tariff: { findFirst: async () => null },
    lead: { findFirst: async () => ({ id: 'lead-new' }) },
    addressCheck: { findFirst: async () => null },
    redirect: { findFirst: async () => null },
  }) };

  await assert.rejects(
    new CityImportService(prisma, { recordWorkingRevision: async () => { writes += 1; } }).undoImport('run-1', 'user-1'),
    /зависимые данные.*отмена заблокирована/i,
  );
  assert.equal(writes, 0);
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

test('city import controller preserves the working version and does not publish it', async () => {
  const actions = { kazan: 'update', innopolis: 'skip' };
  const report = { reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0, candidates: [] };
  const calls = [];
  const prisma = {
    cityImportRun: {
      findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'VALIDATED', report }),
      update: async ({ data }) => { calls.push(['run', data.status]); },
    },
  };
  const imports = { applyReport: async (received, receivedActions, confirmWarnings, runId, actorId) => {
    assert.equal(received, report);
    assert.deepEqual(receivedActions, actions);
    assert.equal(confirmWarnings, true);
    assert.equal(runId, 'run-1');
    assert.equal(actorId, 'user-1');
    return { created: 0, updated: 1, skipped: 1, pagesCreated: 0, workingRevision: 18 };
  } };
  const result = await new AdminCitiesController(prisma, imports).applyImport({
    runId: 'run-1', actions, confirmWarnings: true,
  }, { user: { id: 'user-1' } });

  assert.equal(result.updated, 1);
  assert.equal(result.workingRevision, 18);
  assert.deepEqual(calls, []);
});

test('city import controller never touches the rebuild queue after apply', async () => {
  const report = { reportVersion: 2, siteId: 'site-1', errorRows: 0, warningRows: 0, candidates: [] };
  const prisma = {
    cityImportRun: {
      findUnique: async () => ({ id: 'run-1', siteId: 'site-1', status: 'VALIDATED', report }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const imports = { applyReport: async (_report, _actions, _confirmWarnings, runId) => {
    assert.equal(runId, 'run-1');
    return { created: 0, updated: 0, skipped: 0, pagesCreated: 0 };
  } };
  const result = await new AdminCitiesController(prisma, imports).applyImport({ runId: 'run-1', actions: {} });

  assert.equal(result.runId, 'run-1');
});

test('city import undo requires explicit confirmation and attributes the operator', async () => {
  const calls = [];
  const controller = new AdminCitiesController({}, {
    undoImport: async (runId, actorId) => {
      calls.push({ runId, actorId });
      return { runId, workingRevision: 19 };
    },
  });

  assert.throws(
    () => controller.undoImport('run-1', { confirm: false }, { user: { id: 'user-1' } }),
    /явно подтвердить отмену/i,
  );
  const result = await controller.undoImport('run-1', { confirm: true }, { user: { id: 'user-1' } });

  assert.equal(result.workingRevision, 19);
  assert.deepEqual(calls, [{ runId: 'run-1', actorId: 'user-1' }]);
});

test('city import history exposes undo only for applied runs with a complete safe snapshot', async () => {
  const safeChangeSet = {
    version: 1, kind: 'CITY_IMPORT', siteId: 'site-1', runId: 'safe', actions: { kazan: 'update' },
    createdCityIds: [], beforeCities: [storedCity({ name: 'До' })], afterCities: [storedCity({ name: 'После' })],
    createdRegions: [], createdPages: [], workingRevision: 18,
  };
  const queries = [];
  const controller = new AdminCitiesController({
    cityImportRun: { findMany: async (query) => {
      queries.push(query);
      if (query.select?.changeSet) return [
        { id: 'safe', siteId: 'site-1', changeSet: safeChangeSet },
        { id: 'legacy', siteId: 'site-1', changeSet: { ...safeChangeSet, version: 0, runId: 'legacy' } },
      ];
      return [
        { id: 'safe', status: 'APPLIED' },
        { id: 'legacy', status: 'APPLIED' },
        { id: 'undone', status: 'UNDONE' },
      ];
    } },
  }, {});

  const rows = await controller.importsList();

  assert.deepEqual(rows.map(({ id, canUndo }) => ({ id, canUndo })), [
    { id: 'safe', canUndo: true },
    { id: 'legacy', canUndo: false },
    { id: 'undone', canUndo: false },
  ]);
  assert.equal('changeSet' in rows[0], false);
  assert.equal(queries[0].select.changeSet, undefined);
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
        assert.deepEqual(where, { id: 'run-1', status: 'VALIDATED' });
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
  }, { applyReport: async () => { throw new Error('serialization conflict'); } });
  await assert.rejects(controller.applyImport({ runId: 'run-1', actions: { kazan: 'skip' } }), /serialization conflict/);
  assert.deepEqual(failureUpdates[0].where, { id: 'run-1', status: 'VALIDATED' });
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
      findUnique: async () => ({ id: 'city-1', siteId: 'site-1', regionId: 'region-1', name: 'Казань', slug: 'kazan', namePrepositional: 'Казани', nameGenitive: 'Казани', legacyUrl: null, officeState: 'NO_OFFICE', officeAddress: null, officeHours: null, subscriberProfileKey: null, status: 'PUBLISHED' }),
      findFirst: async () => null,
      update: async ({ data }) => ({ id: 'city-1', siteId: 'site-1', ...data }),
    },
    region: { findFirst: async () => ({ id: 'region-1' }) },
    tariff: {
      findMany: async () => [
        { id: 'tariff-published', status: 'PUBLISHED' },
        { id: 'tariff-draft', status: 'DRAFT' },
      ],
    },
    redirect: { updateMany: async (query) => { redirectUpdates.push(query); return { count: 2 }; } },
  };
  const rebuilds = [];
  const revisions = [];
  const controller = new AdminCitiesController(
    { $transaction: async (callback) => callback(tx) },
    {},
    { recordWorkingRevision: async (_transaction, input) => { revisions.push(input); return { siteRevision: 12 }; } },
  );

  const result = await controller.update('city-1', { status: 'DRAFT' }, { user: { id: 'user-1' } });

  assert.equal(result.status, 'DRAFT');
  assert.equal(result.workingRevision, 12);
  assert.deepEqual(redirectUpdates, [{
    where: { siteId: 'site-1', managedTariffId: { in: ['tariff-published', 'tariff-draft'] } },
    data: { status: 'DRAFT' },
  }]);
  assert.equal(revisions[0].entityType, 'CITY');
  assert.equal(revisions[0].actorId, 'user-1');
  assert.deepEqual(rebuilds, []);
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

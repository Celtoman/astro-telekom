const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CANONICAL_IMPORT_COLUMNS,
  TariffImportService,
  TARIFF_ATTRIBUTE_FIELDS,
  htmlToPlainText,
  parseWorkbook,
} = require('../apps/api/dist/tariff-import.service.js');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');
const SNAPSHOT_TIME = new Date('2026-09-11T00:00:00.000Z');

const row = (overrides = {}) => ({
  subekt_rf: 'Республика Татарстан', gorod_name: 'Казань', gorod_slug: 'kazan', tarif_type: 'Интернет',
  post_title: 'Гига 500', tariff_slug: 'giga-500', nazvanie_tarifa: 'Гига 500', card_subtitle: null,
  skorost_interneta: 500, tv_channels_total: null, tv_channels_hd: null, price_standard: 990, price_promo: 890,
  connection_cost: 0, opisanie_aktsii: 'Промо', opisanie_tarifa: null, card_feature: null, online_cinemas: null,
  tvbox_installment_price: null, tvbox_installment_months: null, tvbox_buyout_price: null,
  router_installment_price: null, router_installment_months: null, router_buyout_price: null,
  srv_vkplaycloud_status: 0, srv_video_status: 0, srv_video_price: null, cctv_buyout_price: null,
  cctv_connection_price: null, srv_gaming_status: 0, game_code: null, srv_litres_status: 0,
  srv_ont_status: 1, ont_buyout_price: null, srv_staticip_status: 0, badge_text: null, is_sticky: 0,
  ...overrides,
});

function service() {
  return new TariffImportService({
    city: { findMany: async () => [{ id: 'city-1', name: 'Казань', slug: 'kazan', siteId: 'site-1', region: { name: 'Республика Татарстан' }, pages: [] }] },
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
  const lifecycleMigration = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '0038_tariff_archive_lifecycle', 'migration.sql'), 'utf8');
  assert.match(lifecycleMigration, /CREATE TYPE "TariffAvailability" AS ENUM \('ACTIVE', 'ARCHIVED'\)/);
  assert.match(lifecycleMigration, /"archiveReason" = 'ABSENT_FROM_IMPORT'.*"archivedByImportRunId" IS NOT NULL/s);
  assert.match(lifecycleMigration, /FOREIGN KEY \("archivedByImportRunId"\) REFERENCES "TariffImportRun"/);
});

test('the tariff attribute registry exposes only canonical typed tariff attributes', () => {
  assert.deepEqual(TARIFF_ATTRIBUTE_FIELDS.map(({ key }) => key), [
    'card_subtitle', 'badge_text', 'card_feature', 'opisanie_tarifa', 'is_sticky',
    'tv_channels_total', 'tv_channels_hd', 'online_cinemas', 'router_buyout_price', 'router_installment_months',
    'router_installment_price', 'tvbox_buyout_price', 'tvbox_installment_months',
    'tvbox_installment_price', 'ont_buyout_price', 'cctv_buyout_price', 'cctv_connection_price',
    'srv_video_status', 'srv_video_price', 'srv_gaming_status', 'game_code',
    'srv_vkplaycloud_status', 'srv_litres_status', 'srv_ont_status', 'srv_staticip_status',
  ]);
});

test('canonical tariff XLSX contains exactly 37 agreed headers in order', () => {
  assert.equal(CANONICAL_IMPORT_COLUMNS.length, 37);
  assert.deepEqual(Object.keys(row()), [...CANONICAL_IMPORT_COLUMNS]);
  for (const forbidden of ['show_on_site', 'external_id', 'equip_router', 'equip_tv_box', 'srv_gaming_name', 'is_gaming_tarif']) {
    assert.equal(CANONICAL_IMPORT_COLUMNS.includes(forbidden), false);
  }
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

test('validation maps canonical top-level tariff values without price coercion', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row()]);
  assert.equal(report.errorRows, 0);
  assert.equal(report.validRows, 1);
  assert.equal(report.candidates[0].key, 'kazan|гига 500|Интернет');
  assert.equal(report.candidates[0].standardPrice, 990);
  assert.equal(report.candidates[0].promoPrice, 890);
  assert.equal(report.candidates[0].connectionFee, 0);
  assert.equal(report.reportVersion, 3);
  assert.deepEqual(report.existingSnapshot, []);
  assert.deepEqual({ created: report.diff.created, updated: report.diff.updated, archived: report.diff.archived, unchanged: report.diff.unchanged }, { created: 1, updated: 0, archived: 0, unchanged: 0 });
  assert.equal(report.diff.changes[0].action, 'create');
});

test('tariff region validation follows the city import region slug without accepting a different region', async () => {
  const instance = new TariffImportService({
    city: { findMany: async () => [{
      id: 'city-1', name: 'Казань', slug: 'kazan',
      region: { name: 'Республика Татарстан', slug: 'tatarstan' }, pages: [],
    }] },
    tariff: { findMany: async () => [] },
  });

  const accepted = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({ subekt_rf: 'Татарстан' })]);
  assert.equal(accepted.errorRows, 0);
  assert.equal(accepted.validRows, 1);

  const rejected = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({ subekt_rf: 'Самарская область' })]);
  assert.equal(rejected.errorRows, 1);
  assert.equal(rejected.validRows, 0);
  assert.match(rejected.issues[0].message, /subekt_rf не соответствует региону города/);
});

test('validation preserves tariff description and normalized TV channel counters in attributes', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({
    tarif_type: 'Интернет+ТВ',
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
    post_title: 'Название в карточке', nazvanie_tarifa: 'Название в карточке', card_subtitle: 'Подзаголовок',
    is_sticky: 0, srv_video_status: 1, router_installment_months: 12, router_installment_price: 350, badge_text: 'Хит',
  })]);

  assert.equal(report.errorRows, 0);
  assert.equal(report.candidates[0].name, 'Название в карточке');
  assert.equal(report.candidates[0].attributes.card_subtitle, 'Подзаголовок');
  assert.equal(report.candidates[0].attributes.is_sticky, false);
  assert.equal(report.candidates[0].attributes.srv_video_status, 'OPTIONAL');
  assert.equal(report.candidates[0].attributes.router_installment_months, 12);
});

test('validation rejects a non-empty column outside the current tariff field registry', async () => {
  await assert.rejects(
    service().validateRows('provider-1', 'tariffs.xlsx', [row({ surprise_column: 'unexpected' })]),
    /37 колонок в точном порядке/i,
  );
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
    row({ tariff_slug: 'negative-total', post_title: 'Negative', nazvanie_tarifa: 'Negative', tarif_type: 'Интернет+ТВ', tv_channels_total: -2 }),
    row({ tariff_slug: 'fractional-hd', post_title: 'Fractional', nazvanie_tarifa: 'Fractional', tarif_type: 'Интернет+ТВ', tv_channels_total: 100, tv_channels_hd: 10.5 }),
    row({ tariff_slug: 'hd-over-total', post_title: 'Over', nazvanie_tarifa: 'Over', tarif_type: 'Интернет+ТВ', tv_channels_total: 50, tv_channels_hd: 51 }),
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
    row({ gorod_slug: 'unknown', gorod_name: 'Неизвестный', tariff_slug: 'giga-500-2' }),
  ]);
  assert.equal(report.validRows, 0);
  assert.ok(report.issues.some((issue) => issue.message.includes('srv_video_status')));
  assert.ok(report.issues.some((issue) => issue.message.includes('не найден')));
});

test('validation accepts service status minus one from a string XLSX cell', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({ srv_video_status: '-1' })]);

  assert.equal(report.errorRows, 0);
  assert.equal(report.candidates[0].attributes.srv_video_status, 'INCLUDED');
});

test('validation reports duplicate business keys before apply', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row(), row()]);
  assert.equal(report.validRows, 0);
  assert.ok(report.issues.some((issue) => issue.message.includes('Дубликат ключа')));
});

test('business-key normalization collapses spaces and case but preserves е/ё', async () => {
  const duplicate = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row(),
    row({ post_title: '  ГИГА\u00a0 500  ', nazvanie_tarifa: '  ГИГА\u00a0 500  ', tariff_slug: 'giga-500-copy' }),
  ]);
  assert.equal(duplicate.validRows, 0);
  assert.ok(duplicate.issues.some((issue) => issue.message.includes('Дубликат ключа')));

  const distinct = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ post_title: 'Все', nazvanie_tarifa: 'Все', tariff_slug: 'vse' }),
    row({ post_title: 'Всё', nazvanie_tarifa: 'Всё', tariff_slug: 'vsyo' }),
  ]);
  assert.equal(distinct.errorRows, 0);
  assert.equal(distinct.validRows, 2);
});

test('matching uses normalized name instead of slug and treats a rename as a new tariff', async () => {
  const existing = {
    id: 'existing', cityId: 'city-1', name: 'Гига 500', slug: 'giga-500',
    identityKey: 'city-1:гига 500:INTERNET', updatedAt: SNAPSHOT_TIME,
  };
  const instance = new TariffImportService({
    city: { findMany: async () => [{ id: 'city-1', name: 'Казань', slug: 'kazan', region: { name: 'Республика Татарстан' }, pages: [] }] },
    tariff: { findMany: async () => [existing] },
  });

  const matched = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);
  assert.deepEqual({ created: matched.diff.created, updated: matched.diff.updated, archived: matched.diff.archived }, { created: 0, updated: 1, archived: 0 });

  const renamed = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({
    post_title: 'Гига 500 Новый', nazvanie_tarifa: 'Гига 500 Новый', tariff_slug: 'giga-500-new',
  })]);
  assert.deepEqual({ created: renamed.diff.created, updated: renamed.diff.updated, archived: renamed.diff.archived }, { created: 1, updated: 0, archived: 1 });
  assert.deepEqual(renamed.diff.archivedTariffs, [{ id: 'existing', cityId: 'city-1', name: 'Гига 500', slug: 'giga-500' }]);
  assert.deepEqual(renamed.diff.changes.map(({ action }) => action), ['create', 'archive']);
});

test('a matched tariff slug change must use the confirmed editor redirect flow', async () => {
  const instance = new TariffImportService({
    city: { findMany: async () => [{ id: 'city-1', name: 'Казань', slug: 'kazan', region: { name: 'Республика Татарстан' }, pages: [] }] },
    tariff: { findMany: async () => [{
      id: 'existing', cityId: 'city-1', name: 'Гига 500', slug: 'old-slug',
      identityKey: 'city-1:гига 500:INTERNET', updatedAt: SNAPSHOT_TIME,
    }] },
  });

  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({ tariff_slug: 'new-slug' })]);

  assert.equal(report.validRows, 0);
  assert.equal(report.errorRows, 1);
  assert.ok(report.issues.some((issue) => /редакторе.*301-редиректа/i.test(issue.message)));
});

test('validation rejects a city slug collision across different service types', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ tarif_type: 'Интернет' }),
    row({ tarif_type: 'Интернет+ТВ', tv_channels_total: 150 }),
  ]);

  assert.equal(report.validRows, 0);
  assert.equal(report.errorRows, 2);
  assert.ok(report.issues.some((issue) => issue.message.includes('tariff_slug «giga-500»')));
  assert.ok(report.issues.some((issue) => issue.message.includes('городе «kazan»')));
});

test('validation rejects a tariff URL already occupied by a published page', async () => {
  const instance = new TariffImportService({
    city: { findMany: async () => [{ id: 'city-1', name: 'Казань', slug: 'kazan', region: { name: 'Республика Татарстан' }, pages: [{ slug: 'internet' }] }] },
    tariff: { findMany: async () => [] },
  });

  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({ tariff_slug: 'internet' })]);

  assert.equal(report.errorRows, 1);
  assert.equal(report.validRows, 0);
  assert.match(report.issues[0].message, /URL \/kazan\/internet.*занят опубликованной страницей/i);
});

test('validation rejects missing or reordered canonical headers before reading values', async () => {
  const missing = row();
  delete missing.badge_text;
  await assert.rejects(service().validateRows('provider-1', 'tariffs.xlsx', [missing]), /37 колонок в точном порядке/i);

  const entries = Object.entries(row());
  [entries[0], entries[1]] = [entries[1], entries[0]];
  await assert.rejects(
    service().validateRows('provider-1', 'tariffs.xlsx', [Object.fromEntries(entries)]),
    /37 колонок в точном порядке/i,
  );
});

test('validation rejects fractional, negative and decorated numeric values without coercion', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ tariff_slug: 'decorated-speed', post_title: 'Decorated speed', nazvanie_tarifa: 'Decorated speed', skorost_interneta: '500 Мбит/с' }),
    row({ tariff_slug: 'fractional-price', post_title: 'Fractional price', nazvanie_tarifa: 'Fractional price', price_standard: 990.5 }),
    row({ tariff_slug: 'invalid-promo', post_title: 'Invalid promo', nazvanie_tarifa: 'Invalid promo', price_promo: 990 }),
    row({ tariff_slug: 'negative-connection', post_title: 'Negative connection', nazvanie_tarifa: 'Negative connection', connection_cost: -1 }),
  ]);

  assert.equal(report.validRows, 0);
  assert.equal(report.errorRows, 4);
  assert.ok(report.issues.some((issue) => issue.message.includes('skorost_interneta')));
  assert.ok(report.issues.some((issue) => issue.message.includes('price_standard')));
  assert.ok(report.issues.some((issue) => issue.message.includes('price_promo')));
  assert.ok(report.issues.some((issue) => issue.message.includes('connection_cost')));
});

test('validation normalizes only an empty zero installment pair and rejects a half-filled pair', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ router_installment_price: 0, router_installment_months: 0 }),
    row({ tariff_slug: 'half-installment', post_title: 'Half installment', nazvanie_tarifa: 'Half installment', router_installment_price: 350 }),
  ]);

  assert.equal(report.validRows, 1);
  assert.equal(report.errorRows, 1);
  assert.equal(Object.hasOwn(report.candidates[0].attributes, 'router_installment_price'), false);
  assert.equal(Object.hasOwn(report.candidates[0].attributes, 'router_installment_months'), false);
  assert.ok(report.issues.some((issue) => issue.message.includes('должны быть заполнены вместе')));
});

test('validation accepts only closed cinema and game codes with consistent service status', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [
    row({ online_cinemas: 'IVI, kinopoisk,ivi', srv_gaming_status: 1, game_code: 'LESTA' }),
    row({ tariff_slug: 'unknown-cinema', post_title: 'Unknown cinema', nazvanie_tarifa: 'Unknown cinema', online_cinemas: 'netflix' }),
    row({ tariff_slug: 'unknown-game', post_title: 'Unknown game', nazvanie_tarifa: 'Unknown game', srv_gaming_status: 1, game_code: 'unknown' }),
    row({ tariff_slug: 'contradicting-game', post_title: 'Contradicting game', nazvanie_tarifa: 'Contradicting game', srv_gaming_status: 0, game_code: 'warface' }),
  ]);

  assert.equal(report.validRows, 1);
  assert.equal(report.errorRows, 3);
  assert.equal(report.candidates[0].attributes.online_cinemas, 'ivi,kinopoisk');
  assert.equal(report.candidates[0].attributes.srv_gaming_status, 'OPTIONAL');
  assert.equal(report.candidates[0].attributes.game_code, 'lesta');
});

test('public text normalization removes markup, decodes entities and preserves multiline structure only where allowed', async () => {
  const report = await service().validateRows('provider-1', 'tariffs.xlsx', [row({
    post_title: '<b>Гига &amp; 500</b>',
    nazvanie_tarifa: '<b>Гига &amp; 500</b>',
    card_subtitle: '<i>Одна   строка</i>',
    opisanie_tarifa: '<p>Первый&nbsp;абзац</p><ul><li>Пункт &amp; один</li></ul><script>alert(1)</script>',
  })]);

  assert.equal(report.errorRows, 0);
  assert.equal(report.candidates[0].name, 'Гига & 500');
  assert.equal(report.candidates[0].attributes.card_subtitle, 'Одна строка');
  assert.equal(report.candidates[0].attributes.opisanie_tarifa, 'Первый абзац\n- Пункт & один');
  assert.equal(htmlToPlainText('A &#x110000; B'), 'A &#x110000; B');
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
  assert.deepEqual(result, { created: 1, updated: 0, archived: 0, unchanged: 0, applied: 1 });
  assert.equal(calls[0].identityKey, 'city-1:гига 500:INTERNET');
  assert.equal(calls[0].status, 'PUBLISHED');
});

test('full snapshot archives missing tariffs without deleting records or lead links', async () => {
  const record = (overrides) => ({
    providerId: 'provider-1', cityId: 'city-1', serviceType: 'INTERNET', standardPrice: 500,
    promoPrice: null, speed: 100, promoText: null, connectionFee: null, availability: 'ACTIVE',
    externalId: null, dataSource: 'tariffs.xlsx', attributes: {}, seo: null, status: 'PUBLISHED',
    archiveReason: null, archivedAt: null, archivedByImportRunId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: SNAPSHOT_TIME,
    ...overrides,
  });
  const records = [
    record({ id: 'keep', name: 'Гига 500', slug: 'giga-500', identityKey: 'city-1:гига 500:INTERNET' }),
    record({ id: 'stale', name: 'Старый 100', slug: 'old-100', identityKey: 'city-1:старый 100:INTERNET' }),
  ];
  let leadQueries = 0;
  const prisma = {
    city: { findMany: async () => [{ id: 'city-1', slug: 'kazan', siteId: 'site-1' }] },
    tariff: { findMany: async () => records },
    $transaction: async (callback) => callback({
      page: { findMany: async () => [] },
      city: { findMany: async () => [{ id: 'city-1', siteId: 'site-1' }] },
      redirect: { findMany: async () => [] },
      lead: { findMany: async () => { leadQueries += 1; return []; } },
      tariffImportRun: { updateMany: async () => ({ count: 1 }) },
      tariff: {
        findMany: async () => records,
        findFirst: async ({ where }) => records.find((item) => item.cityId === where.cityId && item.identityKey === where.identityKey) || null,
        update: async ({ where, data }) => Object.assign(records.find((item) => item.id === where.id), data),
        create: async ({ data }) => { records.push({ id: `new-${records.length}`, ...data }); },
        updateMany: async ({ where, data }) => {
          const targets = records.filter((item) => where.id.in.includes(item.id));
          for (const target of targets) Object.assign(target, data, { updatedAt: new Date('2026-09-11T01:00:00.000Z') });
          return { count: targets.length };
        },
      },
    }),
  };
  const instance = new TariffImportService(prisma, { recordWorkingRevision: async () => ({ siteRevision: 1 }) });
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row()]);
  assert.equal(report.diff.archived, 1);
  assert.deepEqual(report.diff.archivedTariffs, [{ id: 'stale', cityId: 'city-1', name: 'Старый 100', slug: 'old-100' }]);

  const result = await instance.applyReport(report, { confirmWarnings: true }, 'run-1', 'user-1');

  assert.equal(result.archived, 1);
  assert.deepEqual(records.map((item) => item.id), ['keep', 'stale']);
  assert.equal(records[1].availability, 'ARCHIVED');
  assert.equal(records[1].status, 'ARCHIVED');
  assert.equal(records[1].archiveReason, 'ABSENT_FROM_IMPORT');
  assert.equal(records[1].archivedByImportRunId, 'run-1');
  assert.equal(leadQueries, 0);
});

test('warnings block apply until they are explicitly confirmed', async () => {
  const instance = service();
  const report = await instance.validateRows('provider-1', 'tariffs.xlsx', [row({ card_feature: 'x'.repeat(165) })]);

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
    connectionFee: null, availability: 'ACTIVE', externalId: null, identityKey: 'city-1:old:internet',
    dataSource: 'old.xlsx', attributes: {}, seo: null, status: 'PUBLISHED', archiveReason: null, archivedAt: null, archivedByImportRunId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: SNAPSHOT_TIME,
  }];
  const records = structuredClone(before);
  let runUpdate;
  const revisions = [];
  const report = {
    reportVersion: 3, providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [], diff: { changes: [], created: 0, updated: 0, archived: 1, unchanged: 0 },
    existingSnapshot: [{ id: 'tariff-old', updatedAt: SNAPSHOT_TIME.toISOString() }],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      page: { findMany: async () => [] },
      city: { findMany: async () => [{ id: 'city-1', siteId: 'site-1' }] },
      redirect: { findMany: async () => [] },
      tariff: {
        findMany: async () => records,
        updateMany: async ({ data }) => { Object.assign(records[0], data, { updatedAt: new Date('2026-09-11T01:00:00.000Z') }); return { count: 1 }; },
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
  assert.equal(revisions[0].snapshot.tariffs.length, 1);
  assert.equal(revisions[0].snapshot.tariffs[0].availability, 'ARCHIVED');
  assert.equal(runUpdate.status, 'APPLIED');
  assert.equal(runUpdate.appliedById, 'user-1');
  assert.equal(runUpdate.changeSet.version, 3);
  assert.equal(runUpdate.changeSet.kind, 'TARIFF_IMPORT');
  assert.deepEqual(runUpdate.changeSet.leadAssignments, []);
  assert.deepEqual(runUpdate.changeSet.siteCityIds, [{ siteId: 'site-1', cityIds: ['city-1'] }]);
  assert.deepEqual(runUpdate.changeSet.workingRevisions, [{ siteId: 'site-1', workingRevision: 12 }]);
});

test('version 3 undo restores an imported archive when no later change exists', async () => {
  const base = {
    id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Тариф', slug: 'tariff',
    serviceType: 'INTERNET', standardPrice: 500, promoPrice: null, speed: 100, promoText: null,
    connectionFee: null, externalId: null, identityKey: 'city-1:тариф:INTERNET', dataSource: 'old.xlsx',
    attributes: {}, seo: null, createdAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const before = { ...base, availability: 'ACTIVE', status: 'PUBLISHED', archiveReason: null, archivedAt: null, archivedByImportRunId: null, updatedAt: SNAPSHOT_TIME };
  const archivedAt = new Date('2026-09-11T01:00:00.000Z');
  let current = { ...base, availability: 'ARCHIVED', status: 'ARCHIVED', archiveReason: 'ABSENT_FROM_IMPORT', archivedAt, archivedByImportRunId: 'run-1', updatedAt: archivedAt };
  const stored = (tariff) => ({
    ...tariff,
    standardPrice: String(tariff.standardPrice),
    createdAt: tariff.createdAt.toISOString(),
    updatedAt: tariff.updatedAt.toISOString(),
    archivedAt: tariff.archivedAt?.toISOString() ?? null,
  });
  const changeSet = {
    version: 3, kind: 'TARIFF_IMPORT', providerId: 'provider-1', runId: 'run-1',
    beforeTariffs: [stored(before)], afterTariffs: [stored(current)], redirectSnapshot: [], leadAssignments: [],
    siteCityIds: [{ siteId: 'site-1', cityIds: ['city-1'] }], workingRevisions: [{ siteId: 'site-1', workingRevision: 12 }],
  };
  let runUpdate;
  const prisma = {
    $transaction: async (callback) => callback({
      tariffImportRun: {
        findUnique: async () => ({ id: 'run-1', providerId: 'provider-1', status: 'APPLIED', changeSet }),
        updateMany: async ({ data }) => { runUpdate = data; return { count: 1 }; },
      },
      tariff: {
        findMany: async () => [current],
        upsert: async ({ update }) => { current = { ...current, ...update, updatedAt: new Date('2026-09-11T02:00:00.000Z') }; return current; },
      },
      contentRevision: { findFirst: async () => null },
      redirect: { findMany: async () => [] },
    }),
  };

  const service = new TariffImportService(prisma, { recordWorkingRevision: async () => ({ siteRevision: 13 }) });
  changeSet.beforeTariffs[0].seo = { title: 'Исторический title' };
  await assert.rejects(service.undoImport('run-1', 'user-1'), /SEO override/);
  assert.equal(runUpdate, undefined);
  changeSet.beforeTariffs[0].seo = null;
  const result = await service.undoImport('run-1', 'user-1');

  assert.equal(current.availability, 'ACTIVE');
  assert.equal(current.status, 'PUBLISHED');
  assert.equal(current.archiveReason, null);
  assert.equal(current.archivedAt, null);
  assert.equal(current.archivedByImportRunId, null);
  assert.equal(runUpdate.status, 'UNDONE');
  assert.deepEqual(result.workingRevisions, [{ siteId: 'site-1', workingRevision: 13 }]);
});

test('safe undo restores the tariff business snapshot and detached lead links as a new working revision', async () => {
  const record = (overrides = {}) => ({
    id: 'tariff-updated', providerId: 'provider-1', cityId: 'city-1', name: 'Тариф', slug: 'tariff',
    serviceType: 'INTERNET', standardPrice: 500, promoPrice: null, speed: 100, promoText: null,
    connectionFee: null, availability: true, externalId: null, identityKey: 'city-1:tariff:internet',
    dataSource: 'tariffs.xlsx', attributes: {}, seo: null, status: 'PUBLISHED',
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-14T10:00:00.000Z'),
    ...overrides,
  });
  const stored = (tariff) => ({
    ...tariff,
    standardPrice: tariff.standardPrice === null ? null : String(tariff.standardPrice),
    promoPrice: tariff.promoPrice === null ? null : String(tariff.promoPrice),
    connectionFee: tariff.connectionFee === null ? null : String(tariff.connectionFee),
    createdAt: tariff.createdAt.toISOString(),
    updatedAt: tariff.updatedAt.toISOString(),
  });
  const before = [
    record({ standardPrice: 500 }),
    record({ id: 'tariff-deleted', name: 'Удаленный тариф', slug: 'deleted', identityKey: 'city-1:deleted:internet' }),
  ];
  const after = [
    record({ standardPrice: 650, updatedAt: new Date('2026-09-14T11:00:00.000Z') }),
    record({ id: 'tariff-created', name: 'Новый тариф', slug: 'created', identityKey: 'city-1:created:internet', updatedAt: new Date('2026-09-14T11:00:00.000Z') }),
  ];
  let tariffs = structuredClone(after);
  const leadTime = new Date('2026-09-14T10:30:00.000Z');
  const leads = [{ id: 'lead-1', tariffId: null, updatedAt: leadTime }];
  const revisions = [];
  const tariffWrites = [];
  const leadWrites = [];
  const undoTime = new Date('2026-09-14T14:00:00.000Z');
  let runUpdate;
  const changeSet = {
    version: 2,
    kind: 'TARIFF_IMPORT',
    providerId: 'provider-1',
    runId: 'run-1',
    beforeTariffs: before.map(stored).sort((left, right) => left.id.localeCompare(right.id)),
    afterTariffs: after.map(stored).sort((left, right) => left.id.localeCompare(right.id)),
    redirectSnapshot: [],
    leadAssignments: [{ id: 'lead-1', tariffId: 'tariff-deleted', updatedAt: leadTime.toISOString() }],
    siteCityIds: [{ siteId: 'site-1', cityIds: ['city-1'] }],
    workingRevisions: [{ siteId: 'site-1', workingRevision: 12 }],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      tariffImportRun: {
        findUnique: async () => ({ id: 'run-1', providerId: 'provider-1', status: 'APPLIED', changeSet }),
        updateMany: async ({ data }) => { runUpdate = data; return { count: 1 }; },
      },
      tariff: {
        findMany: async () => tariffs,
        deleteMany: async ({ where }) => {
          tariffs = tariffs.filter((tariff) => !where.id.in.includes(tariff.id));
          return { count: 1 };
        },
        upsert: async ({ where, create, update }) => {
          tariffWrites.push({ create, update });
          const index = tariffs.findIndex((tariff) => tariff.id === where.id);
          const restored = structuredClone({
            ...(index === -1 ? create : { ...tariffs[index], ...update }),
            updatedAt: undoTime,
          });
          if (index === -1) tariffs.push(restored); else tariffs[index] = restored;
          return restored;
        },
      },
      redirect: { findMany: async () => [] },
      contentRevision: { findFirst: async () => null },
      lead: {
        findMany: async ({ where }) => where.id?.in
          ? leads.filter((lead) => where.id.in.includes(lead.id))
          : leads.filter((lead) => lead.tariffId && where.tariffId.in.includes(lead.tariffId)),
        updateMany: async ({ where, data }) => {
          leadWrites.push(data);
          const lead = leads.find((item) => item.id === where.id && item.tariffId === null && item.updatedAt.getTime() === where.updatedAt.getTime());
          if (!lead) return { count: 0 };
          Object.assign(lead, data, { updatedAt: undoTime });
          return { count: 1 };
        },
      },
    }),
  };
  const publications = {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: 13 };
    },
  };

  const result = await new TariffImportService(prisma, publications).undoImport('run-1', 'user-1');

  assert.deepEqual(tariffs.map((tariff) => tariff.id).sort(), ['tariff-deleted', 'tariff-updated']);
  assert.equal(tariffs.find((tariff) => tariff.id === 'tariff-updated').standardPrice, '500');
  assert.equal(tariffs.every((tariff) => tariff.updatedAt.getTime() === undoTime.getTime()), true);
  assert.equal(tariffWrites.every(({ create, update }) => !('updatedAt' in create) && !('updatedAt' in update)), true);
  assert.equal(tariffWrites.every(({ update }) => !('createdAt' in update)), true);
  assert.equal(leads[0].tariffId, 'tariff-deleted');
  assert.equal(leads[0].updatedAt.getTime(), undoTime.getTime());
  assert.deepEqual(leadWrites, [{ tariffId: 'tariff-deleted' }]);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].action, 'UNDO');
  assert.equal(revisions[0].actorId, 'user-1');
  assert.equal(revisions[0].source, 'tariff-import-undo:run-1');
  assert.deepEqual(revisions[0].changedFields, ['tariffs', 'leadAssignments']);
  assert.deepEqual(revisions[0].previousSnapshot.leadAssignments, [{ id: 'lead-1', tariffId: null }]);
  assert.deepEqual(revisions[0].snapshot.leadAssignments, [{ id: 'lead-1', tariffId: 'tariff-deleted' }]);
  assert.equal(runUpdate.status, 'UNDONE');
  assert.equal(runUpdate.undoneById, 'user-1');
  assert.deepEqual(runUpdate.undoSiteRevisions, [{ siteId: 'site-1', workingRevision: 13 }]);
  assert.deepEqual(result.workingRevisions, [{ siteId: 'site-1', workingRevision: 13 }]);
});

test('safe undo rejects a later audited mutation even when the catalog matches the import snapshot again', async () => {
  let writes = 0;
  const tariff = {
    id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'После импорта', slug: 'tariff',
    serviceType: 'INTERNET', standardPrice: 500, promoPrice: null, speed: 100, promoText: null,
    connectionFee: null, availability: true, externalId: null, identityKey: 'city-1:tariff:internet',
    dataSource: 'tariffs.xlsx', attributes: {}, seo: null, status: 'PUBLISHED',
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-14T12:00:00.000Z'),
  };
  const storedTariff = {
    ...tariff,
    standardPrice: '500',
    createdAt: tariff.createdAt.toISOString(),
    updatedAt: tariff.updatedAt.toISOString(),
  };
  const changeSet = {
    version: 2, kind: 'TARIFF_IMPORT', providerId: 'provider-1', runId: 'run-1',
    beforeTariffs: [storedTariff], afterTariffs: [storedTariff], redirectSnapshot: [], leadAssignments: [],
    siteCityIds: [{ siteId: 'site-1', cityIds: ['city-1'] }],
    workingRevisions: [{ siteId: 'site-1', workingRevision: 12 }],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      tariffImportRun: {
        findUnique: async () => ({ id: 'run-1', providerId: 'provider-1', status: 'APPLIED', changeSet }),
        updateMany: async () => { writes += 1; return { count: 1 }; },
      },
      tariff: {
        findMany: async () => [tariff],
        upsert: async () => { writes += 1; return tariff; },
      },
      redirect: { findMany: async () => [] },
      contentRevision: { findFirst: async () => ({ id: 'later-revision' }) },
    }),
  };

  await assert.rejects(
    new TariffImportService(prisma, { recordWorkingRevision: async () => { writes += 1; } }).undoImport('run-1', 'user-1'),
    /изменялись после импорта/i,
  );
  assert.equal(writes, 0);
});

test('safe undo rejects a tariff changed after import before writing anything', async () => {
  let writes = 0;
  const tariff = {
    id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Изменен позже', slug: 'tariff',
    serviceType: 'INTERNET', standardPrice: 500, promoPrice: null, speed: 100, promoText: null,
    connectionFee: null, availability: true, externalId: null, identityKey: 'city-1:tariff:internet',
    dataSource: 'tariffs.xlsx', attributes: {}, seo: null, status: 'PUBLISHED',
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-14T12:00:00.000Z'),
  };
  const changeSet = {
    version: 2, kind: 'TARIFF_IMPORT', providerId: 'provider-1', runId: 'run-1',
    beforeTariffs: [],
    afterTariffs: [{ ...tariff, name: 'После импорта', standardPrice: '500', createdAt: tariff.createdAt.toISOString(), updatedAt: tariff.updatedAt.toISOString() }],
    redirectSnapshot: [], leadAssignments: [],
    siteCityIds: [{ siteId: 'site-1', cityIds: ['city-1'] }], workingRevisions: [],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      tariffImportRun: { findUnique: async () => ({ id: 'run-1', providerId: 'provider-1', status: 'APPLIED', changeSet }) },
      tariff: {
        findMany: async () => [tariff],
        deleteMany: async () => { writes += 1; },
        upsert: async () => { writes += 1; },
      },
    }),
  };

  await assert.rejects(
    new TariffImportService(prisma, { recordWorkingRevision: async () => { writes += 1; } }).undoImport('run-1', 'user-1'),
    /изменен после импорта/i,
  );
  assert.equal(writes, 0);
});

test('safe undo ignores redirect hit metrics while preserving the redirect content guard', async () => {
  const tariff = {
    id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Тариф', slug: 'tariff',
    serviceType: 'INTERNET', standardPrice: 500, promoPrice: null, speed: 100, promoText: null,
    connectionFee: null, availability: true, externalId: null, identityKey: 'city-1:tariff:internet',
    dataSource: 'tariffs.xlsx', attributes: {}, seo: null, status: 'PUBLISHED',
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-14T12:00:00.000Z'),
  };
  const storedTariff = { ...tariff, standardPrice: '500', createdAt: tariff.createdAt.toISOString(), updatedAt: tariff.updatedAt.toISOString() };
  const redirect = {
    id: 'redirect-1', siteId: 'site-1', cityId: 'city-1', sourcePath: '/old', targetPath: '/city/tariff',
    managedTariffId: 'tariff-1', status: 'PUBLISHED', hitCount: 10,
    lastHitAt: new Date('2026-09-14T13:00:00.000Z'), createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-14T13:00:00.000Z'),
  };
  const changeSet = {
    version: 2, kind: 'TARIFF_IMPORT', providerId: 'provider-1', runId: 'run-1',
    beforeTariffs: [storedTariff], afterTariffs: [storedTariff],
    redirectSnapshot: [{
      ...redirect,
      hitCount: 0,
      lastHitAt: null,
      createdAt: redirect.createdAt.toISOString(),
      updatedAt: new Date('2026-09-14T12:00:00.000Z').toISOString(),
    }],
    leadAssignments: [], siteCityIds: [{ siteId: 'site-1', cityIds: ['city-1'] }],
    workingRevisions: [{ siteId: 'site-1', workingRevision: 12 }],
  };
  let runUpdate;
  const prisma = {
    $transaction: async (callback) => callback({
      tariffImportRun: {
        findUnique: async () => ({ id: 'run-1', providerId: 'provider-1', status: 'APPLIED', changeSet }),
        updateMany: async ({ data }) => { runUpdate = data; return { count: 1 }; },
      },
      tariff: { findMany: async () => [tariff], upsert: async () => tariff },
      redirect: { findMany: async () => [redirect] },
      contentRevision: { findFirst: async () => null },
    }),
  };

  await new TariffImportService(prisma, {
    recordWorkingRevision: async () => ({ siteRevision: 14 }),
  }).undoImport('run-1', 'user-1');

  assert.equal(runUpdate.status, 'UNDONE');
  redirect.targetPath = '/other-target';
  await assert.rejects(
    new TariffImportService(prisma, { recordWorkingRevision: async () => ({ siteRevision: 15 }) }).undoImport('run-1', 'user-1'),
    /Редиректы затронутого сайта изменены после импорта/i,
  );
});

test('safe undo blocks removal of an imported tariff referenced by a newer lead', async () => {
  let writes = 0;
  const tariff = {
    id: 'tariff-created', providerId: 'provider-1', cityId: 'city-1', name: 'Новый тариф', slug: 'created',
    serviceType: 'INTERNET', standardPrice: 500, promoPrice: null, speed: 100, promoText: null,
    connectionFee: null, availability: true, externalId: null, identityKey: 'city-1:created:internet',
    dataSource: 'tariffs.xlsx', attributes: {}, seo: null, status: 'PUBLISHED',
    createdAt: new Date('2026-09-14T12:00:00.000Z'), updatedAt: new Date('2026-09-14T12:00:00.000Z'),
  };
  const changeSet = {
    version: 2, kind: 'TARIFF_IMPORT', providerId: 'provider-1', runId: 'run-1', beforeTariffs: [],
    afterTariffs: [{ ...tariff, standardPrice: '500', createdAt: tariff.createdAt.toISOString(), updatedAt: tariff.updatedAt.toISOString() }],
    redirectSnapshot: [], leadAssignments: [],
    siteCityIds: [{ siteId: 'site-1', cityIds: ['city-1'] }],
    workingRevisions: [{ siteId: 'site-1', workingRevision: 12 }],
  };
  const prisma = {
    $transaction: async (callback) => callback({
      tariffImportRun: { findUnique: async () => ({ id: 'run-1', providerId: 'provider-1', status: 'APPLIED', changeSet }) },
      tariff: { findMany: async () => [tariff], deleteMany: async () => { writes += 1; } },
      redirect: { findMany: async () => [] },
      contentRevision: { findFirst: async () => null },
      lead: { findMany: async () => [{ id: 'lead-new' }] },
    }),
  };

  await assert.rejects(
    new TariffImportService(prisma, { recordWorkingRevision: async () => { writes += 1; } }).undoImport('run-1', 'user-1'),
    /появились заявки на новые тарифы/i,
  );
  assert.equal(writes, 0);
});

test('tariff import undo requires explicit confirmation and attributes the operator', async () => {
  const calls = [];
  const controller = new AdminTariffsController({}, {
    undoImport: async (runId, actorId) => { calls.push({ runId, actorId }); return { workingRevisions: [] }; },
  }, {});

  assert.throws(
    () => controller.undoImport('run-1', { confirm: false }, { user: { id: 'user-1' } }),
    /подтвердить отмену/i,
  );
  const result = await controller.undoImport('run-1', { confirm: true }, { user: { id: 'user-1' } });

  assert.deepEqual(calls, [{ runId: 'run-1', actorId: 'user-1' }]);
  assert.deepEqual(result.workingRevisions, []);
});

test('tariff import history exposes undo only for applied runs with a complete safe snapshot', async () => {
  const queries = [];
  const controller = new AdminTariffsController({
    tariffImportRun: {
      findMany: async (query) => {
        queries.push(query);
        if (query.where) return [{ id: 'safe' }];
        return [
          { id: 'safe', status: 'APPLIED' },
          { id: 'legacy', status: 'APPLIED' },
          { id: 'undone', status: 'UNDONE' },
        ];
      },
    },
  }, {}, {});

  const rows = await controller.listImports();

  assert.deepEqual(rows.map(({ id, canUndo }) => ({ id, canUndo })), [
    { id: 'safe', canUndo: true },
    { id: 'legacy', canUndo: false },
    { id: 'undone', canUndo: false },
  ]);
  assert.equal('changeSet' in rows[0], false);
  assert.equal(queries[0].select.changeSet, undefined);
  assert.deepEqual(queries[1].select, { id: true });
  assert.deepEqual(queries[1].where.id.in, ['safe', 'legacy']);
  assert.deepEqual(queries[1].where.OR.map((condition) => condition.changeSet.equals), [2, 3]);
});

test('tariff import controller preserves the working version and does not publish it', async () => {
  const report = { reportVersion: 3, providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [], existingSnapshot: [], diff: { changes: [] } };
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
      return { created: 0, updated: 0, archived: 2, unchanged: 0, applied: 0, workingRevisions: [{ siteId: 'site-1', workingRevision: 7 }] };
    },
  };
  const controller = new AdminTariffsController(prisma, imports);

  const result = await controller.applyImport({ runId: 'run-1' }, { user: { id: 'user-1' } });

  assert.equal(result.archived, 2);
  assert.deepEqual(result.workingRevisions, [{ siteId: 'site-1', workingRevision: 7 }]);
});

test('full snapshot rejects a catalog changed after validation before writing', async () => {
  let updated = false;
  const validatedTariff = {
    id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Гига 500', slug: 'giga-500',
    identityKey: 'city-1:гига 500:INTERNET', updatedAt: SNAPSHOT_TIME,
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
  const report = { reportVersion: 3, providerId: 'provider-1', errorRows: 0, warningRows: 0, candidates: [], existingSnapshot: [], diff: { changes: [] } };
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
  }, {});

  await assert.rejects(
    controller.applyImport({ runId: 'run-1', acceptedKeys: ['kazan-giga-500-Интернет'] }),
    /частичное применение/i,
  );
});

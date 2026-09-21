const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');
const { TariffImportService } = require('../apps/api/dist/tariff-import.service.js');
const { UpdateTariffDto } = require('../apps/api/dist/tariff.dto.js');
const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');

const publicationStub = {
  recordWorkingRevision: async () => ({ siteRevision: 1 }),
  captureWorkingPublication: async (_transaction, input) => ({ id: `publication-${input.siteRevision}`, siteRevision: input.siteRevision, status: 'PENDING' }),
};

const existingTariff = {
  id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Гига 500', slug: 'giga-500',
  serviceType: 'INTERNET', standardPrice: 900, promoPrice: 700, speed: 500, promoText: 'Первые 3 месяца',
  connectionFee: 0, availability: true, externalId: 'external-1', identityKey: 'city-1:гига 500:INTERNET',
  dataSource: 'tariffs.xlsx', attributes: { opisanie_tarifa: 'Описание' }, seo: { title: 'SEO title' },
  status: 'PUBLISHED', createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-10T00:00:00Z'),
};
const withRelations = (tariff) => ({
  ...tariff,
  provider: { id: 'provider-1', name: 'Дом.ру' },
  city: { id: 'city-1', name: 'Казань', slug: 'kazan', siteId: 'site-1' },
});

test('tariff detail exposes the full stored model with provider and city context', async () => {
  let query;
  const prisma = { tariff: { findUnique: async (request) => { query = request; return { ...existingTariff, provider: { id: 'provider-1', name: 'Дом.ру' }, city: { id: 'city-1', name: 'Казань', slug: 'kazan', siteId: 'site-1' } }; } } };
  const controller = new AdminTariffsController(prisma);

  const detail = await controller.detail('tariff-1');

  assert.equal(detail.id, 'tariff-1');
  assert.equal(detail.attributes.opisanie_tarifa, 'Описание');
  assert.deepEqual(detail.provider, { id: 'provider-1', name: 'Дом.ру' });
  assert.deepEqual(query.include.city.select, { id: true, name: true, slug: true, siteId: true });
  assert.ok(detail.attributeSchema.some((field) => field.key === 'game_code' && field.kind === 'game-code'));
  assert.equal(detail.attributeSchema.some((field) => field.key === 'show_on_site'), false);
});

test('sensitive tariff changes require explicit confirmation before any write', async () => {
  let updated = false;
  const tx = {
    tariff: {
      findUnique: async () => existingTariff,
      update: async () => { updated = true; },
    },
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const controller = new AdminTariffsController(prisma);
  const expectedUpdatedAt = existingTariff.updatedAt.toISOString();

  await assert.rejects(controller.update('tariff-1', { expectedUpdatedAt, standardPrice: 950 }), /подтверждение.*цен/i);
  await assert.rejects(controller.update('tariff-1', { expectedUpdatedAt, status: 'DRAFT' }), /подтверждение.*статус/i);
  await assert.rejects(controller.update('tariff-1', { expectedUpdatedAt, seo: { title: 'Новое SEO' } }), /подтверждение.*SEO/i);
  assert.equal(updated, false);
});

test('confirmed manual edit returns the persisted tariff and working revision without publishing', async () => {
  let saved;
  const calls = [];
  const tx = {
    city: { findUnique: async () => ({ id: 'city-1', slug: 'kazan', siteId: 'site-1', site: { providerId: 'provider-1' } }) },
    page: { findFirst: async () => null },
    redirect: { findUnique: async () => null, updateMany: async () => ({ count: 0 }), create: async () => ({}) },
    tariff: {
      findUnique: async () => existingTariff,
      findFirst: async () => null,
      update: async ({ data }) => { saved = data; return withRelations({ ...existingTariff, ...data }); },
    },
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const controller = new AdminTariffsController(
    prisma,
    undefined,
    {
      recordWorkingRevision: async () => { calls.push('revision'); return { siteRevision: 4 }; },
      captureWorkingPublication: async () => { calls.push('snapshot'); return { id: 'publication-4' }; },
    },
  );

  const result = await controller.update('tariff-1', {
    expectedUpdatedAt: existingTariff.updatedAt.toISOString(), promoText: 'Новое промо', standardPrice: 950, confirmSensitiveChanges: true,
  });

  assert.equal(saved.confirmSensitiveChanges, undefined);
  assert.equal(saved.expectedUpdatedAt, undefined);
  assert.equal(saved.promoText, 'Новое промо');
  assert.equal(result.tariff.standardPrice, 950);
  assert.equal(result.tariff.publicPath, '/kazan/giga-500');
  assert.ok(result.tariff.attributeSchema.some((field) => field.key === 'online_cinemas' && field.kind === 'code-list'));
  assert.equal(result.tariff.provider.name, 'Дом.ру');
  assert.equal(result.workingRevision, 4);
  assert.equal('publication' in result, false);
  assert.equal('rebuild' in result, false);
  assert.deepEqual(calls, ['revision']);
});

test('tariff update DTO rejects unknown, empty and malformed edit fields at runtime', async () => {
  const pipe = createGlobalValidationPipe();
  const metadata = { type: 'body', metatype: UpdateTariffDto };
  const rejectsWith = async (payload, pattern) => assert.rejects(pipe.transform(payload, metadata), (error) => pattern.test(error.getResponse().message.join(' ')));
  await rejectsWith({ expectedUpdatedAt: existingTariff.updatedAt.toISOString(), unknown: true }, /property unknown should not exist/i);
  await rejectsWith({ expectedUpdatedAt: existingTariff.updatedAt.toISOString(), name: '' }, /name must be longer/i);
  await rejectsWith({ expectedUpdatedAt: existingTariff.updatedAt.toISOString(), name: '   ' }, /name must be longer/i);
  await rejectsWith({ expectedUpdatedAt: existingTariff.updatedAt.toISOString(), slug: 'Bad URL' }, /slug/i);
  for (const field of ['cityId', 'name', 'slug', 'serviceType', 'availability', 'status']) {
    await rejectsWith({ expectedUpdatedAt: existingTariff.updatedAt.toISOString(), [field]: null }, new RegExp(field, 'i'));
  }
  const nullable = await pipe.transform({
    expectedUpdatedAt: existingTariff.updatedAt.toISOString(), standardPrice: null, promoPrice: null, speed: null,
    promoText: null, connectionFee: null, attributes: null, seo: null,
  }, metadata);
  assert.equal(nullable.standardPrice, null);
  assert.equal(nullable.promoPrice, null);
  assert.equal(nullable.speed, null);
  assert.equal(nullable.promoText, null);
  assert.equal(nullable.connectionFee, null);
  assert.equal(nullable.attributes, null);
  assert.equal(nullable.seo, null);
});

test('stale tariff editor cannot overwrite a newer import or manual update', async () => {
  let updated = false;
  const tx = { tariff: { findUnique: async () => existingTariff, update: async () => { updated = true; } } };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const controller = new AdminTariffsController(prisma);

  await assert.rejects(controller.update('tariff-1', {
    expectedUpdatedAt: '2026-09-09T00:00:00.000Z', name: 'Устаревшая правка',
  }), /изменился после открытия формы/i);
  assert.equal(updated, false);
});

test('manual editor rejects attributes outside the shared tariff field registry', async () => {
  const tx = { tariff: { findUnique: async () => existingTariff } };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const controller = new AdminTariffsController(prisma);

  await assert.rejects(controller.update('tariff-1', {
    expectedUpdatedAt: existingTariff.updatedAt.toISOString(), attributes: { surprise: true },
  }), /surprise.*не входит.*контракт/i);
});

test('persisted tariff edit does not touch the rebuild queue during save', async () => {
  const tx = {
    city: { findUnique: async () => ({ id: 'city-1', slug: 'kazan', siteId: 'site-1', site: { providerId: 'provider-1' } }) },
    page: { findFirst: async () => null },
    tariff: {
      findUnique: async () => existingTariff,
      findFirst: async () => null,
      update: async ({ data }) => withRelations({ ...existingTariff, ...data, updatedAt: new Date('2026-09-11T00:00:00Z') }),
    },
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const controller = new AdminTariffsController(prisma, undefined, publicationStub);

  const result = await controller.update('tariff-1', {
    expectedUpdatedAt: existingTariff.updatedAt.toISOString(), promoText: 'Сохраненное промо',
  });

  assert.equal(result.tariff.promoText, 'Сохраненное промо');
  assert.equal(result.workingRevision, 1);
});

test('manual tariff edit records only a working revision until explicit publication', async () => {
  const calls = [];
  const tx = {
    city: { findUnique: async () => ({ id: 'city-1', slug: 'kazan', siteId: 'site-1', status: 'PUBLISHED', site: { providerId: 'provider-1' } }) },
    page: { findFirst: async () => null },
    redirect: { findUnique: async () => null, updateMany: async () => ({ count: 0 }), create: async () => ({}) },
    tariff: {
      findUnique: async () => existingTariff,
      findFirst: async () => null,
      update: async ({ data }) => withRelations({ ...existingTariff, ...data, updatedAt: new Date('2026-09-12T00:00:00Z') }),
    },
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const publications = {
    recordWorkingRevision: async (_transaction, input) => {
      calls.push(['revision', input]);
      return { siteRevision: 7 };
    },
    captureWorkingPublication: async (_transaction, input) => {
      calls.push(['snapshot', input]);
      return { id: 'publication-7', siteRevision: input.siteRevision, status: 'PENDING' };
    },
  };
  const controller = new AdminTariffsController(prisma, undefined, publications);

  const result = await controller.update('tariff-1', {
    expectedUpdatedAt: existingTariff.updatedAt.toISOString(),
    promoText: 'Промо рабочей версии',
  });

  assert.deepEqual(calls.map(([type]) => type), ['revision']);
  assert.equal(calls[0][1].entityType, 'TARIFF');
  assert.equal(calls[0][1].siteId, 'site-1');
  assert.deepEqual(calls[0][1].changedFields, ['promoText']);
  assert.equal(result.workingRevision, 7);
  assert.equal('publication' in result, false);
  assert.equal('rebuild' in result, false);
});

test('an imported tariff round-trips through detail and the manual editor contract', async () => {
  let record = null;
  const city = { id: 'city-1', slug: 'kazan', siteId: 'site-1' };
  const enrich = (tariff) => ({
    ...tariff,
    provider: { id: 'provider-1', name: 'Дом.ру' },
    city: { ...city, name: 'Казань' },
  });
  const prisma = {
    city: {
      findMany: async () => [city],
      findUnique: async () => ({ ...city, site: { providerId: 'provider-1' } }),
    },
    page: { findFirst: async () => null, findMany: async () => [] },
    redirect: { findUnique: async () => null, updateMany: async () => ({ count: 0 }), create: async () => ({}) },
    tariff: {
      findMany: async () => record ? [record] : [],
      findFirst: async ({ where }) => where?.id?.not ? null : record,
      findUnique: async () => record ? enrich(record) : null,
      create: async ({ data }) => {
        record = { id: 'tariff-1', createdAt: new Date('2026-09-11T00:00:00Z'), updatedAt: new Date('2026-09-11T00:00:00Z'), ...data };
        return record;
      },
      update: async ({ data }) => {
        record = { ...record, ...data, updatedAt: new Date('2026-09-11T01:00:00Z') };
        return enrich(record);
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const importer = new TariffImportService(prisma);
  const report = await importer.validateRows('provider-1', 'tariffs.xlsx', [{
    subekt_rf: 'Республика Татарстан', gorod_name: 'Казань', gorod_slug: 'kazan', tarif_type: 'Интернет',
    post_title: 'Гига 500', tariff_slug: 'giga-500', nazvanie_tarifa: 'Гига 500', card_subtitle: 'Название карточки',
    skorost_interneta: 500, tv_channels_total: null, tv_channels_hd: null, price_standard: 900, price_promo: null,
    connection_cost: 0, opisanie_aktsii: null, opisanie_tarifa: null, card_feature: null, online_cinemas: 'ivi',
    tvbox_installment_price: null, tvbox_installment_months: null, tvbox_buyout_price: null,
    router_installment_price: null, router_installment_months: null, router_buyout_price: null,
    srv_vkplaycloud_status: 0, srv_video_status: '-1', srv_video_price: null, cctv_buyout_price: null,
    cctv_connection_price: null, srv_gaming_status: 0, game_code: null, srv_litres_status: 0,
    srv_ont_status: 0, ont_buyout_price: null, srv_staticip_status: 0, badge_text: null, is_sticky: 0,
  }]);
  await importer.applyReport(report, { confirmWarnings: true });

  const controller = new AdminTariffsController(prisma, importer, publicationStub);
  const detail = await controller.detail('tariff-1');
  assert.equal(detail.attributes.card_subtitle, 'Название карточки');
  assert.equal(detail.attributes.online_cinemas, 'ivi');
  assert.equal(detail.attributes.srv_video_status, 'INCLUDED');

  const result = await controller.update('tariff-1', {
    expectedUpdatedAt: detail.updatedAt.toISOString(),
    attributes: { ...detail.attributes, card_subtitle: 'Новое название карточки' },
  });
  assert.equal(result.tariff.attributes.card_subtitle, 'Новое название карточки');
  assert.equal(result.tariff.publicPath, '/kazan/giga-500');
  assert.equal(result.tariff.attributeSchema.some((field) => field.key === 'show_on_site'), false);
});

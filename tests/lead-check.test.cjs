const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');

function fixture(check, recentLeads = []) {
  let saved;
  let contractLocation;
  let contractChecks = 0;
  let deliveryEnqueues = 0;
  const transaction = {
    lead: { create: async ({ data }) => { saved = data; return { ...data, id: 'lead', status: 'NEW' }; } },
    leadActivityEvent: { createMany: async () => ({ count: 0 }) },
  };
  const prisma = {
    site: { findFirst: async () => ({ id: 'site' }) },
    city: { findFirst: async () => ({ id: 'city', name: 'Казань', slug: 'kazan' }) },
    addressCheck: { findFirst: async ({ where }) => {
      assert.equal(where.siteId, 'site');
      assert.equal(where.cityId, 'city');
      return check;
    } },
    lead: { findMany: async ({ where }) => {
      assert.equal(where.siteId, 'site');
      assert.ok(where.createdAt.gte instanceof Date);
      return recentLeads;
    } },
    $transaction: async (callback) => callback(transaction),
  };
  const contract = {
    check: async (phone, location) => {
      contractChecks += 1;
      assert.equal(typeof phone, 'string');
      contractLocation = location;
      return { status: 'NOT_FOUND', active: false };
    },
  };
  const delivery = {
    enqueue: async (leadId) => {
      deliveryEnqueues += 1;
      assert.equal(leadId, 'lead');
    },
  };
  const controller = new PublicLeadsController(prisma, { notifyLead: async () => {} }, contract, delivery);
  return {
    controller,
    create: (body) => controller.create(body, { headers: {}, url: '/leads' }),
    saved: () => saved,
    contractChecks: () => contractChecks,
    contractLocation: () => contractLocation,
    deliveryEnqueues: () => deliveryEnqueues,
  };
}
const base = { citySlug: 'kazan', phone: '+79000000000' };

test('lead rejects a site that is not publicly published', async () => {
  const prisma = {
    site: { findFirst: async ({ where }) => { assert.equal(where.status, 'PUBLISHED'); return null; } },
  };
  const controller = new PublicLeadsController(prisma, { notifyLead: async () => {} });
  await assert.rejects(controller.create(base), /Сайт не найден/);
});

test('lead rejects an unavailable requested page or tariff', async () => {
  const f = fixture(null);
  f.controller.prisma.page = { findFirst: async () => null };
  await assert.rejects(f.create({ ...base, pageSlug: 'draft-page' }), /Страница не найдена/);
  f.controller.prisma.page = undefined;
  f.controller.prisma.tariff = { findFirst: async () => null };
  await assert.rejects(f.create({ ...base, tariffSlug: 'draft-tariff' }), /Тариф не найден/);
});

test('lead uses persisted status and object details despite forged client status', async () => {
  const f = fixture({
    id: 'check',
    status: 'UNAVAILABLE',
    address: 'Улица, 1',
    objectType: 'apartment',
    response: { available: false },
  });
  await f.create({ ...base, addressCheckId: 'check', checkStatus: 'AVAILABLE' });
  assert.deepEqual(f.saved().apiResult, { status: 'UNAVAILABLE', response: { available: false } });
  assert.equal(f.saved().address, 'Улица, 1');
  assert.equal(f.saved().objectType, 'apartment');
});
test('manual lead cannot manufacture a coverage result', async () => {
  const f = fixture(null);
  await f.create({ ...base, checkStatus: 'AVAILABLE' });
  assert.equal(f.saved().apiResult, undefined);
  assert.equal(f.saved().processingStatus, 'MANUAL_CHECK');
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});
test('unknown check is rejected before saving', async () => {
  const f = fixture(null);
  await assert.rejects(f.create({ ...base, addressCheckId: 'foreign' }), /не найдена/);
  assert.equal(f.saved(), undefined);
});
test('a check cannot be attached to a different address', async () => {
  const f = fixture({ id: 'check', address: 'Улица, 1' });
  await assert.rejects(f.create({ ...base, addressCheckId: 'check', address: 'Улица, 2' }), /Адрес изменился/);
  assert.equal(f.saved(), undefined);
});

test('lead with the same normalized phone within 24 hours is suppressed as duplicate', async () => {
  const f = fixture(null, [{ id: 'existing-phone', phone: '8 (900) 000-00-00', address: 'Старый адрес' }]);

  await f.create({ ...base, phone: '+7 900 000 00 00', address: 'Новый адрес' });

  assert.equal(f.saved().processingStatus, 'DUPLICATE_SUPPRESSED');
  assert.equal(f.saved().duplicateOfId, 'existing-phone');
  assert.equal(f.saved().duplicateReason, 'phone_24h');
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('lead with the same normalized address within 24 hours is suppressed as duplicate', async () => {
  const f = fixture(null, [{ id: 'existing-address', phone: '+79010000000', address: 'ул. Ленина, д. 1' }]);

  await f.create({ ...base, phone: '+79020000000', address: 'УЛ ЛЕНИНА Д 1' });

  assert.equal(f.saved().processingStatus, 'DUPLICATE_SUPPRESSED');
  assert.equal(f.saved().duplicateOfId, 'existing-address');
  assert.equal(f.saved().duplicateReason, 'address_24h');
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('lead checks the subscriber for alternative providers but never queues target-provider delivery', async () => {
  const f = fixture({
    id: 'check',
    status: 'UNAVAILABLE',
    address: 'Улица, 1',
    objectType: 'apartment',
    response: {
      integration: 'tarifnik',
      suggestion: { value: 'Улица, 1', unrestricted_value: 'Улица, 1', data: { city: 'Казань' } },
      providers: { 17: 'Альтернативный провайдер' },
      targetProviderId: '8',
      hasAnyProvider: true,
      hasTargetProvider: false,
    },
  });

  await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(f.contractChecks(), 1);
  assert.equal(f.contractLocation().city, 'Казань');
  assert.equal(f.saved().processingStatus, 'PROVIDER_NOT_AVAILABLE_NOT_SENT');
  assert.equal(f.deliveryEnqueues(), 0);
});

test('lead from a Kazan page checks the subscriber using the normalized city of the submitted address', async () => {
  const f = fixture({
    id: 'check',
    status: 'AVAILABLE',
    address: 'г Набережные Челны, пр-кт Тестовый, д 1',
    objectType: 'apartment',
    response: {
      integration: 'tarifnik',
      suggestion: {
        value: 'г Набережные Челны, пр-кт Тестовый, д 1',
        unrestricted_value: 'Республика Татарстан, г Набережные Челны, пр-кт Тестовый, д 1',
        data: { city: 'Набережные Челны', region: 'Республика Татарстан', house: '1' },
      },
      providers: { 8: 'Дом.ру' },
      targetProviderId: '8',
      hasAnyProvider: true,
      hasTargetProvider: true,
    },
  });

  await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(f.saved().cityId, 'city');
  assert.equal(f.saved().address, 'г Набережные Челны, пр-кт Тестовый, д 1');
  assert.deepEqual(f.contractLocation(), {
    city: 'Набережные Челны',
    region: 'Республика Татарстан',
    house: '1',
  });
  assert.equal(f.deliveryEnqueues(), 1);
});

test('lead with no providers skips subscriber check and delivery without pretending manual review is needed', async () => {
  const f = fixture({
    id: 'check',
    status: 'UNAVAILABLE',
    address: 'Улица, 1',
    objectType: 'apartment',
    response: {
      integration: 'tarifnik',
      suggestion: { value: 'Улица, 1', unrestricted_value: 'Улица, 1', data: { city: 'Казань' } },
      providers: {},
      targetProviderId: '8',
      hasAnyProvider: false,
      hasTargetProvider: false,
    },
  });

  await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(f.contractChecks(), 0);
  assert.equal(f.saved().processingStatus, 'NO_PROVIDERS_NOT_SENT');
  assert.equal(f.deliveryEnqueues(), 0);
});

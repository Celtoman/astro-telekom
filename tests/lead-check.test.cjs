const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');
function fixture(check, recentLeads = [], enqueueNotification = async () => true) {
  let saved;
  let leadCreates = 0;
  let notificationCreated;
  let notificationEnqueues = 0;
  let contractLocation;
  let contractPhone;
  let contractChecks = 0;
  let deliveryEnqueues = 0;
  const transaction = {
    lead: { create: async ({ data }) => {
      leadCreates += 1;
      saved = { ...data, id: 'lead', status: 'NEW' };
      return saved;
    } },
    leadNotification: { create: async ({ data }) => {
      notificationCreated = data;
      return { id: 'notification', ...data, status: 'PENDING', revision: 1, maxAttempts: 3 };
    } },
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
    lead: {
      findUnique: async ({ where }) => (
        saved?.submissionKey === where.submissionKey ? saved : null
      ),
      findMany: async ({ where }) => {
        assert.equal(where.siteId, 'site');
        assert.ok(where.createdAt.gte instanceof Date);
        return recentLeads;
      },
    },
    $transaction: async (callback) => callback(transaction),
  };
  const contract = {
    check: async (phone, location) => {
      contractChecks += 1;
      assert.equal(typeof phone, 'string');
      contractPhone = phone;
      contractLocation = location;
      return { status: 'NOT_FOUND', active: false };
    },
  };
  const delivery = {
    enqueueTracked: async (leadId) => {
      deliveryEnqueues += 1;
      assert.equal(leadId, 'lead');
      return { queued: true, processingStatus: 'PENDING' };
    },
  };
  const notifications = {
    create: (tx, leadId) => tx.leadNotification.create({ data: { leadId } }),
    enqueueTracked: async (notificationId) => {
      notificationEnqueues += 1;
      assert.equal(notificationId, 'notification');
      return enqueueNotification(notificationId);
    },
  };
  const controller = new PublicLeadsController(prisma, contract, delivery, notifications);
  return {
    controller,
    create: (body) => controller.create(body, { headers: {}, url: '/leads' }),
    saved: () => saved,
    contractChecks: () => contractChecks,
    contractLocation: () => contractLocation,
    contractPhone: () => contractPhone,
    deliveryEnqueues: () => deliveryEnqueues,
    notificationCreated: () => notificationCreated,
    notificationEnqueues: () => notificationEnqueues,
    leadCreates: () => leadCreates,
  };
}
const base = {
  citySlug: 'kazan',
  phone: '+79000000000',
  submissionKey: '11111111-1111-4111-8111-111111111111',
  consentVersion: 'lead-form-v1-2026-09-22',
};

function targetCheck(overrides = {}) {
  return {
    id: 'check',
    status: 'AVAILABLE',
    address: 'Улица, 1',
    objectType: 'apartment',
    response: {
      integration: 'tarifnik',
      suggestion: {
        value: 'Улица, 1',
        unrestricted_value: 'Улица, 1',
        data: { city: 'Казань', house: '1' },
      },
      providers: { 8: 'Дом.ру' },
      targetProviderId: '8',
      hasAnyProvider: true,
      hasTargetProvider: true,
    },
    ...overrides,
  };
}

test('lead rejects a site that is not publicly published', async () => {
  const prisma = {
    site: { findFirst: async ({ where }) => { assert.equal(where.status, 'PUBLISHED'); return null; } },
  };
  const controller = new PublicLeadsController(prisma);
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
  const f = fixture(targetCheck());
  await f.create({ ...base, addressCheckId: 'check', checkStatus: 'AVAILABLE' });
  assert.deepEqual(f.saved().apiResult, { status: 'AVAILABLE', response: targetCheck().response });
  assert.equal(f.saved().address, 'Улица, 1');
  assert.equal(f.saved().objectType, 'apartment');
});
test('manual lead cannot manufacture a positive coverage result', async () => {
  const f = fixture(null);
  await assert.rejects(f.create({ ...base, checkStatus: 'AVAILABLE' }), /положительной проверки адреса/i);
  assert.equal(f.saved(), undefined);
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('lead and its notification outbox record are created atomically before enqueue', async () => {
  const f = fixture(targetCheck());
  const created = await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(created.id, 'lead');
  assert.deepEqual(f.notificationCreated(), { leadId: 'lead' });
  assert.equal(f.notificationEnqueues(), 1);
});

test('lead remains accepted when notification queueing fails after the transaction', async () => {
  const f = fixture(targetCheck(), [], async () => { throw new Error('database error containing +79000000000'); });
  const logged = [];
  f.controller.logger = { error: (message) => logged.push(message) };

  const created = await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(created.id, 'lead');
  assert.deepEqual(f.notificationCreated(), { leadId: 'lead' });
  assert.equal(f.notificationEnqueues(), 1);
  assert.deepEqual(logged, [{
    message: 'Lead notification outbox could not be queued',
    leadId: 'lead',
    notificationId: 'notification',
    code: 'outbox_error',
  }]);
  assert.doesNotMatch(JSON.stringify(logged), /\+79000000000/);
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
  const f = fixture(targetCheck(), [{ id: 'existing-phone', phone: '8 (900) 000-00-00', address: 'Старый адрес' }]);

  await f.create({ ...base, phone: '+7 900 000 00 00', addressCheckId: 'check' });

  assert.equal(f.saved().processingStatus, 'DUPLICATE_SUPPRESSED');
  assert.equal(f.saved().duplicateOfId, 'existing-phone');
  assert.equal(f.saved().duplicateReason, 'phone_24h');
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('lead with the same normalized address within 24 hours is suppressed as duplicate', async () => {
  const f = fixture(targetCheck({ address: 'УЛ ЛЕНИНА Д 1' }), [{ id: 'existing-address', phone: '+79010000000', address: 'ул. Ленина, д. 1' }]);

  await f.create({ ...base, phone: '+79020000000', addressCheckId: 'check' });

  assert.equal(f.saved().processingStatus, 'DUPLICATE_SUPPRESSED');
  assert.equal(f.saved().duplicateOfId, 'existing-address');
  assert.equal(f.saved().duplicateReason, 'address_24h');
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('lead rejects alternative providers before subscriber or delivery work', async () => {
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

  await assert.rejects(f.create({ ...base, addressCheckId: 'check' }), /положительной проверки адреса/i);

  assert.equal(f.contractChecks(), 0);
  assert.equal(f.saved(), undefined);
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

test('lead with no providers is rejected without subscriber check or delivery', async () => {
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

  await assert.rejects(f.create({ ...base, addressCheckId: 'check' }), /положительной проверки адреса/i);

  assert.equal(f.contractChecks(), 0);
  assert.equal(f.saved(), undefined);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('active subscriber response exposes only a non-authoritative UI mode flag', async () => {
  const f = fixture({
    id: 'check',
    status: 'AVAILABLE',
    address: 'Улица, 1',
    objectType: 'apartment',
    response: {
      integration: 'tarifnik',
      suggestion: { value: 'Улица, 1', unrestricted_value: 'Улица, 1', data: { city: 'Казань' } },
      providers: { 8: 'Дом.ру' },
      targetProviderId: '8',
      hasAnyProvider: true,
      hasTargetProvider: true,
    },
  });
  f.controller.contract.check = async () => ({ status: 'ACTIVE', active: true, contacts: [{}] });

  const created = await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(f.saved().processingStatus, 'ACTIVE_SUBSCRIBER_NOT_SENT');
  assert.equal(created.subscriberMode, true);
  assert.equal(Object.hasOwn(created, 'subscriberCookie'), false);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('positive lead stores normalized phone, immutable consent evidence and tariff context', async () => {
  const f = fixture(targetCheck());
  f.controller.prisma.tariff = { findFirst: async () => ({ id: 'tariff', serviceType: 'INTERNET' }) };

  await f.create({
    ...base,
    phone: '8 (900) 000-00-00',
    addressCheckId: 'check',
    tariffSlug: 'internet-300',
  });

  assert.equal(f.saved().phone, '79000000000');
  assert.equal(f.contractPhone(), '79000000000');
  assert.equal(f.saved().tariffId, 'tariff');
  assert.equal(f.saved().submissionKey, base.submissionKey);
  assert.equal(f.saved().consentVersion, base.consentVersion);
  assert.ok(f.saved().consentAcceptedAt instanceof Date);
});

test('public lead rejects incomplete and non-mobile Russian phones before any persistence', async () => {
  for (const phone of [
    '+1 900 000-00-00',
    '+8 900 000-00-00',
    '+7927498570',
    '7927498570',
    '8927498570',
    '+7 (800) 123-45-67',
  ]) {
    const f = fixture(targetCheck());
    await assert.rejects(
      f.create({ ...base, phone, addressCheckId: 'check' }),
      /Введите мобильный номер в формате \+7 \(9XX\) XXX-XX-XX/,
    );
    assert.equal(f.leadCreates(), 0);
  }
});

test('public lead rejects every result except confirmed target-provider availability', async () => {
  for (const check of [
    null,
    targetCheck({ status: 'MANUAL_CHECK' }),
    targetCheck({ status: 'UNAVAILABLE', response: { ...targetCheck().response, hasTargetProvider: false } }),
  ]) {
    const f = fixture(check);
    await assert.rejects(
      f.create({ ...base, addressCheckId: check ? 'check' : undefined }),
      /положительной проверки адреса/i,
    );
    assert.equal(f.leadCreates(), 0);
  }
});

test('replaying the same submission key returns the existing lead without duplicate side effects', async () => {
  const f = fixture(targetCheck());
  const body = { ...base, addressCheckId: 'check' };

  const first = await f.create(body);
  const replay = await f.create(body);

  assert.equal(replay.id, first.id);
  assert.equal(f.leadCreates(), 1);
  assert.equal(f.notificationEnqueues(), 1);
  assert.equal(f.deliveryEnqueues(), 1);
});

test('submission key cannot be reused with a different lead context', async () => {
  const f = fixture(targetCheck());
  const body = { ...base, addressCheckId: 'check', serviceType: 'INTERNET' };
  await f.create(body);

  await assert.rejects(
    f.create({ ...body, serviceType: 'TV' }),
    /Ключ отправки уже использован для другой заявки/,
  );
  assert.equal(f.leadCreates(), 1);
});

test('lead schema and forward migration preserve submission and consent evidence', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const migration = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '0040_lead_positive_submission', 'migration.sql'), 'utf8');

  assert.match(schema, /submissionKey\s+String\?\s+@unique/);
  assert.match(schema, /consentVersion\s+String\?/);
  assert.match(schema, /consentAcceptedAt\s+DateTime\?/);
  assert.match(migration, /ADD COLUMN\s+"submissionKey"/);
  assert.match(migration, /CREATE UNIQUE INDEX\s+"Lead_submissionKey_key"/);
});

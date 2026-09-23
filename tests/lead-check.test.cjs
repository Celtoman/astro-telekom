const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');
function fixture(check, recentLeads = [], enqueueNotification = async () => true) {
  let saved;
  let submittedBody;
  let savedBody;
  let leadCreates = 0;
  let notificationCreated;
  let notificationEnqueues = 0;
  let decisionEnqueues = 0;
  const decisionEvents = [];
  const transaction = {
    lead: { create: async ({ data }) => {
      leadCreates += 1;
      saved = { ...data, id: 'lead', status: 'NEW' };
      savedBody = submittedBody;
      return saved;
    } },
    leadNotification: { create: async ({ data }) => {
      notificationCreated = data;
      return { id: 'notification', ...data, status: 'PENDING', revision: 1, maxAttempts: 3 };
    } },
    leadActivityEvent: { createMany: async () => ({ count: 0 }) },
    leadDecisionEvent: { create: async ({ data }) => { decisionEvents.push(data); return data; } },
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
        saved?.submissionKey === where.submissionKey ? {
          ...saved,
          site: { slug: savedBody.siteSlug || 'domru-site' },
          city: { slug: savedBody.citySlug },
          page: saved.pageId ? { slug: savedBody.pageSlug } : null,
          tariff: saved.tariffId ? { slug: savedBody.tariffSlug, serviceType: saved.serviceType } : null,
        } : null
      ),
      findMany: async ({ where }) => {
        assert.equal(where.siteId, 'site');
        assert.ok(where.createdAt.gte instanceof Date);
        return recentLeads;
      },
    },
    $transaction: async (callback) => callback(transaction),
  };
  const decisions = {
    enqueueTracked: async (leadId) => {
      decisionEnqueues += 1;
      assert.equal(leadId, 'lead');
      assert.equal(saved.processingStatus, 'DECISION_PENDING');
      return { queued: true };
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
  const controller = new PublicLeadsController(prisma, decisions, notifications);
  return {
    controller,
    create: (body) => { submittedBody = body; return controller.create(body, { headers: {}, url: '/leads' }); },
    saved: () => saved,
    contractChecks: () => 0,
    deliveryEnqueues: () => decisionEnqueues,
    decisionEnqueues: () => decisionEnqueues,
    notificationCreated: () => notificationCreated,
    notificationEnqueues: () => notificationEnqueues,
    leadCreates: () => leadCreates,
    decisionEvents: () => decisionEvents,
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
    lead: { findUnique: async () => null },
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

test('non-sales reason is snapshotted and bypasses address coverage, subscriber check and delivery', async () => {
  const f = fixture(null);
  const result = await f.create({ ...base, reasonCode: 'billing' });
  assert.equal(result.id, 'lead');
  assert.deepEqual({ code: f.saved().reasonCode, label: f.saved().reasonLabel, route: f.saved().reasonRoute, version: f.saved().reasonRegistryVersion },
    { code: 'billing', label: 'Оплата', route: 'NON_SALES', version: 1 });
  assert.equal(f.saved().processingStatus, 'NON_SALES_NOT_SENT');
  assert.deepEqual(f.decisionEvents(), [{ leadId: 'lead', type: 'ROUTE_DECISION', outcome: 'NON_SALES_NOT_SENT',
    evidence: { reasonRoute: 'NON_SALES', commentOutcome: 'NONE', duplicate: false } }]);
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
  assert.equal(f.notificationEnqueues(), 1);
});

test('other reason stays in manual review and unknown reasons are rejected before save', async () => {
  const f = fixture(null);
  await f.create({ ...base, reasonCode: 'other' });
  assert.equal(f.saved().processingStatus, 'MANUAL_CHECK');
  assert.equal(f.decisionEvents()[0]?.outcome, 'MANUAL_CHECK');
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
  const unknown = fixture(null);
  await assert.rejects(unknown.create({ ...base, reasonCode: 'domofon' }), /Неизвестная причина обращения/);
  assert.equal(unknown.leadCreates(), 0);
});

test('reason cannot be changed by reusing an existing submission key', async () => {
  const f = fixture(targetCheck());
  await f.create({ ...base, reasonCode: 'new_connection', addressCheckId: 'check' });
  await assert.rejects(f.create({ ...base, reasonCode: 'billing', addressCheckId: 'check' }), /Ключ отправки/);
  assert.equal(f.leadCreates(), 1);
});

test('comment contradiction is snapshotted and short-circuits sales checks without rejecting the lead', async () => {
  const f = fixture(null);
  const result = await f.create({ ...base, reasonCode: 'new_connection', comment: 'Списали деньги' });
  assert.equal(result.id, 'lead');
  assert.equal(f.saved().processingStatus, 'MANUAL_CHECK');
  assert.equal(f.saved().comment, 'Списали деньги');
  assert.equal(f.saved().commentAnalysisVersion, 1);
  assert.equal(f.saved().commentAnalysisOutcome, 'MANUAL_REVIEW');
  assert.equal(f.saved().commentAnalysisCategory, 'billing');
  assert.equal(f.saved().commentAnalysisEvidence[0].fragment, 'Списали деньги');
  assert.equal(f.decisionEvents()[0]?.evidence.commentOutcome, 'MANUAL_REVIEW');
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('the comment is immutable for submission-key replay', async () => {
  const f = fixture(targetCheck());
  await f.create({ ...base, reasonCode: 'billing', addressCheckId: 'check', comment: 'Вопрос по оплате' });
  await assert.rejects(f.create({ ...base, reasonCode: 'billing', addressCheckId: 'check', comment: 'Списали деньги' }), /Ключ отправки/);
  assert.equal(f.leadCreates(), 1);
});

test('lead and its notification outbox record are created atomically before enqueue', async () => {
  const f = fixture(targetCheck());
  const created = await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(created.id, 'lead');
  assert.deepEqual(f.notificationCreated(), { leadId: 'lead' });
  assert.equal(f.notificationEnqueues(), 1);
});

test('public decision polling reveals only completion and subscriber mode to the submission key holder', async () => {
  const f = fixture(targetCheck());
  await f.create({ ...base, addressCheckId: 'check' });
  f.controller.prisma.lead.findFirst = async ({ where, select }) => {
    assert.deepEqual(where, { id: 'lead', submissionKey: base.submissionKey });
    assert.deepEqual(select, { processingStatus: true });
    return { processingStatus: 'DECISION_PENDING' };
  };
  assert.deepEqual(await f.controller.decisionStatus('lead', { submissionKey: base.submissionKey }), { complete: false, subscriberMode: false });
  f.controller.prisma.lead.findFirst = async () => ({ processingStatus: 'ACTIVE_SUBSCRIBER_NOT_SENT' });
  assert.deepEqual(await f.controller.decisionStatus('lead', { submissionKey: base.submissionKey }), { complete: true, subscriberMode: true });
  f.controller.prisma.lead.findFirst = async () => null;
  await assert.rejects(f.controller.decisionStatus('lead', { submissionKey: 'other' }), /Заявка не найдена/);
});

test('lead stores an immutable server-validated configuration and rejects a forged shown quote', async () => {
  const { quoteTariffConfiguration, configurationSnapshot, quoteFingerprint } = require('../apps/api/dist/tariff-configuration.service.js');
  const publishedTariff = {
    id: 'tariff-1', slug: 'giga-500', name: 'Гига 500', serviceType: 'INTERNET',
    standardPrice: '1200', promoPrice: '900', connectionFee: '0',
    attributes: { router_buyout_price: 6000 },
  };
  const f = fixture(targetCheck());
  f.controller.prisma.tariff = { findFirst: async () => publishedTariff };
  f.controller.prisma.sitePublication = { findFirst: async () => ({
    id: 'publication-1', catalog: { cities: [{ slug: 'kazan', tariffs: [publishedTariff] }] },
  }) };
  const selection = { router: 'BUYOUT', tvbox: 'NONE', services: [] };
  const fingerprint = quoteFingerprint(configurationSnapshot(quoteTariffConfiguration(publishedTariff, selection)));
  await f.create({ ...base, tariffSlug: 'giga-500', addressCheckId: 'check', configuration: { selection, fingerprint } });
  const saved = f.saved().configurationSnapshot;
  assert.equal(saved.tariff.id, 'tariff-1');
  assert.equal(saved.tariff.name, 'Гига 500');
  assert.equal(saved.components[0].code, 'router');
  assert.deepEqual(saved.totals, { monthly: 900, oneTime: 6000, knownOneTime: 6000 });
  publishedTariff.name = 'Новое название';
  publishedTariff.standardPrice = '2000';
  assert.equal(saved.tariff.name, 'Гига 500');
  assert.equal(saved.totals.monthly, 900);
  await assert.rejects(f.create({ ...base, tariffSlug: 'giga-500', addressCheckId: 'check',
    configuration: { selection, fingerprint: '0'.repeat(64) } }), /Ключ отправки/);
  await assert.rejects(f.create({ ...base, submissionKey: '22222222-2222-4222-8222-222222222222',
    tariffSlug: 'giga-500', addressCheckId: 'check', configuration: { selection, fingerprint } }), /изменились|расчёт/);
  assert.equal(f.leadCreates(), 1);
});

test('lead accepts the last published tariff snapshot while its working row is archived', async () => {
  const { quoteTariffConfiguration, configurationSnapshot, quoteFingerprint } = require('../apps/api/dist/tariff-configuration.service.js');
  const publishedTariff = {
    id: 'tariff-1', slug: 'giga-500', name: 'Гига 500', serviceType: 'INTERNET',
    standardPrice: '1200', promoPrice: null, connectionFee: '0', attributes: {},
  };
  const f = fixture(targetCheck());
  f.controller.prisma.tariff = { findFirst: async ({ where }) => {
    assert.deepEqual(where, { id: 'tariff-1', cityId: 'city' });
    return { ...publishedTariff, status: 'ARCHIVED', availability: 'ARCHIVED' };
  } };
  f.controller.prisma.sitePublication = { findFirst: async () => ({
    catalog: { cities: [{ slug: 'kazan', tariffs: [publishedTariff] }] },
  }) };
  const selection = { router: 'NONE', tvbox: 'NONE', services: [] };
  const fingerprint = quoteFingerprint(configurationSnapshot(quoteTariffConfiguration(publishedTariff, selection)));
  await f.create({ ...base, tariffSlug: 'giga-500', addressCheckId: 'check', configuration: { selection, fingerprint } });
  assert.equal(f.saved().tariffId, 'tariff-1');
  assert.equal(f.saved().configurationSnapshot.tariff.name, 'Гига 500');
});

test('configuration snapshot has an additive nullable JSON migration for historical leads', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const migration = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '0041_lead_configuration_snapshot', 'migration.sql'), 'utf8');
  assert.match(schema, /configurationSnapshot\s+Json\?/);
  assert.match(migration, /ALTER TABLE "Lead" ADD COLUMN "configurationSnapshot" JSONB/);
  assert.doesNotMatch(migration, /NOT NULL|UPDATE "Lead"/);
});

test('lead rejects an unavailable equipment choice before creating a record', async () => {
  const publishedTariff = { id: 'tariff-1', slug: 'giga-500', name: 'Гига 500', serviceType: 'INTERNET',
    standardPrice: '1200', promoPrice: null, connectionFee: null, attributes: { router_buyout_price: 6000 } };
  const f = fixture(targetCheck());
  f.controller.prisma.tariff = { findFirst: async () => publishedTariff };
  f.controller.prisma.sitePublication = { findFirst: async () => ({
    catalog: { cities: [{ slug: 'kazan', tariffs: [publishedTariff] }] },
  }) };
  await assert.rejects(f.create({ ...base, tariffSlug: 'giga-500', addressCheckId: 'check',
    configuration: { selection: { tvbox: 'BUYOUT', services: [] }, fingerprint: '0'.repeat(64) } }), /нельзя выбрать/);
  assert.equal(f.leadCreates(), 0);
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
  assert.equal(f.decisionEvents()[0]?.outcome, 'DUPLICATE_SUPPRESSED');
  assert.equal(f.decisionEvents()[0]?.evidence.duplicate, true);
  assert.equal(f.contractChecks(), 0);
  assert.equal(f.deliveryEnqueues(), 0);
});

test('lead with the same normalized address within 24 hours is suppressed as duplicate', async () => {
  const f = fixture(targetCheck({ address: 'УЛ ЛЕНИНА Д 1' }), [{ id: 'existing-address', phone: '+79010000000', address: 'ул. Ленина, д. 1' }]);

  await f.create({ ...base, phone: '+79020000000', addressCheckId: 'check' });

  assert.equal(f.saved().processingStatus, 'DUPLICATE_SUPPRESSED');
  assert.equal(f.saved().duplicateOfId, 'existing-address');
  assert.equal(f.saved().duplicateReason, 'address_24h');
  assert.equal(f.decisionEvents()[0]?.outcome, 'DUPLICATE_SUPPRESSED');
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

test('lead from a Kazan page persists the checked address before background decisions', async () => {
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
  assert.equal(f.saved().addressCheckId, 'check');
  assert.equal(f.saved().processingStatus, 'DECISION_PENDING');
  assert.equal(f.decisionEnqueues(), 1);
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

test('public response does not guess the subscriber result before background checks', async () => {
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
  const created = await f.create({ ...base, addressCheckId: 'check' });

  assert.equal(f.saved().processingStatus, 'DECISION_PENDING');
  assert.equal(created.subscriberMode, false);
  assert.equal(Object.hasOwn(created, 'subscriberCookie'), false);
  assert.equal(f.decisionEnqueues(), 1);
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
  assert.equal(f.saved().phoneCheckStatus, 'PENDING');
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

test('saved tariff lead replays after its publication is replaced', async () => {
  const { quoteTariffConfiguration, configurationSnapshot, quoteFingerprint } = require('../apps/api/dist/tariff-configuration.service.js');
  const publishedTariff = {
    id: 'tariff-1', slug: 'giga-500', name: 'Гига 500', serviceType: 'INTERNET',
    standardPrice: '1200', promoPrice: '900', connectionFee: '0', attributes: {},
  };
  const f = fixture(targetCheck());
  let currentCatalog = { cities: [{ slug: 'kazan', tariffs: [publishedTariff] }] };
  f.controller.prisma.tariff = { findFirst: async () => publishedTariff };
  f.controller.prisma.sitePublication = { findFirst: async () => ({ catalog: currentCatalog }) };
  const selection = { router: 'NONE', tvbox: 'NONE', services: [] };
  const fingerprint = quoteFingerprint(configurationSnapshot(quoteTariffConfiguration(publishedTariff, selection)));
  const body = { ...base, tariffSlug: 'giga-500', addressCheckId: 'check', configuration: { selection, fingerprint } };

  const first = await f.create(body);
  currentCatalog = { cities: [{ slug: 'kazan', tariffs: [] }] };
  const replay = await f.create(body);

  assert.equal(replay.id, first.id);
  assert.equal(f.leadCreates(), 1);
  assert.equal(f.notificationEnqueues(), 1);
  assert.equal(f.deliveryEnqueues(), 1);
});

test('saved page and tariff lead replays after both working rows are archived', async () => {
  const f = fixture(targetCheck());
  f.controller.prisma.page = { findFirst: async () => ({ id: 'page-1', slug: 'offer' }) };
  f.controller.prisma.tariff = { findFirst: async () => ({ id: 'tariff-1', slug: 'giga-500', serviceType: 'INTERNET' }) };
  const body = { ...base, pageSlug: 'offer', tariffSlug: 'giga-500', addressCheckId: 'check' };
  const first = await f.create(body);
  f.controller.prisma.page.findFirst = async () => null;
  f.controller.prisma.tariff.findFirst = async () => null;

  const replay = await f.create(body);

  assert.equal(replay.id, first.id);
  assert.equal(f.leadCreates(), 1);
  assert.equal(f.notificationEnqueues(), 1);
  assert.equal(f.deliveryEnqueues(), 1);
});

test('saved submission key rejects changed site, city, address, page, tariff and fingerprint', async () => {
  const { quoteTariffConfiguration, configurationSnapshot, quoteFingerprint } = require('../apps/api/dist/tariff-configuration.service.js');
  const publishedTariff = {
    id: 'tariff-1', slug: 'giga-500', name: 'Гига 500', serviceType: 'INTERNET',
    standardPrice: '1200', promoPrice: '900', connectionFee: '0', attributes: {},
  };
  const f = fixture(targetCheck());
  f.controller.prisma.page = { findFirst: async () => ({ id: 'page-1', slug: 'offer' }) };
  f.controller.prisma.tariff = { findFirst: async () => publishedTariff };
  f.controller.prisma.sitePublication = { findFirst: async () => ({
    catalog: { cities: [{ slug: 'kazan', tariffs: [publishedTariff] }] },
  }) };
  const selection = { router: 'NONE', tvbox: 'NONE', services: [] };
  const fingerprint = quoteFingerprint(configurationSnapshot(quoteTariffConfiguration(publishedTariff, selection)));
  const body = { ...base, pageSlug: 'offer', tariffSlug: 'giga-500', addressCheckId: 'check',
    address: 'Улица, 1', objectType: 'apartment', configuration: { selection, fingerprint } };
  await f.create(body);

  for (const changed of [
    { siteSlug: 'other-site' },
    { citySlug: 'moskva' },
    { address: 'Улица, 2' },
    { addressCheckId: 'another-check' },
    { pageSlug: 'other-page' },
    { tariffSlug: 'other-tariff' },
    { configuration: { selection, fingerprint: '0'.repeat(64) } },
    { phone: '+79010000000' },
  ]) {
    await assert.rejects(f.create({ ...body, ...changed }), /Ключ отправки уже использован для другой заявки/);
  }
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

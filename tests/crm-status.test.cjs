const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CrmLeadsController } = require('../apps/api/dist/crm-leads.controller.js');

function setup(count = 1) {
  const history = [];
  const current = { id: 'lead', status: 'NEW', updatedAt: new Date('2026-01-01') };
  const tx = {
    lead: {
      findUnique: async () => current,
      updateMany: async ({ where }) => {
        assert.equal(where.status, 'NEW');
        assert.equal(where.updatedAt, current.updatedAt);
        return { count };
      },
      findUniqueOrThrow: async () => ({ ...current, status: 'IN_PROGRESS' }),
    },
    leadStatusHistory: { create: async ({ data }) => history.push(data) },
  };
  return { history, controller: new CrmLeadsController({ $transaction: async callback => callback(tx) }) };
}
test('status history records authenticated operator', async () => {
  const f = setup();
  await f.controller.updateStatus('lead', { status: 'IN_PROGRESS', comment: ' Звонок ' }, { user: { id: 'operator' } });
  assert.deepEqual(f.history[0], { leadId: 'lead', fromStatus: 'NEW', toStatus: 'IN_PROGRESS', comment: 'Звонок', actorId: 'operator' });
});
test('concurrent change returns conflict without inaccurate history', async () => {
  const f = setup(0);
  await assert.rejects(f.controller.updateStatus('lead', { status: 'IN_PROGRESS' }, {}), error => error.getStatus() === 409);
  assert.equal(f.history.length, 0);
});
test('same status does not produce duplicate transition', async () => {
  const f = setup();
  await f.controller.updateStatus('lead', { status: 'NEW' }, {});
  assert.equal(f.history.length, 0);
});
test('unsupported status is rejected', async () => {
  const f = setup();
  await assert.rejects(f.controller.updateStatus('lead', { status: 'BOGUS' }, {}), error => error.getStatus() === 400);
});

test('delivery retry cannot bypass provider or subscriber routing decisions', async () => {
  const blockedStatuses = [
    'MANUAL_CHECK',
    'MANUAL_CHECK_API',
    'ADDRESS_CLARIFICATION',
    'PROVIDER_NOT_AVAILABLE_NOT_SENT',
    'NO_PROVIDERS_NOT_SENT',
    'ACTIVE_SUBSCRIBER_NOT_SENT',
    'DUPLICATE_SUPPRESSED',
    'DELIVERED',
    'DECISION_PENDING',
    'DECISION_RUNNING',
    'PHONE_CHECK_RETRY',
    'PHONE_CHECK_FAILED',
    'PHONE_INVALID_NOT_SENT',
  ];
  for (const processingStatus of blockedStatuses) {
    let enqueued = 0;
    const controller = new CrmLeadsController({
      lead: {
        findUnique: async () => ({ id: 'lead', processingStatus }),
        update: async () => assert.fail(`updated blocked ${processingStatus}`),
      },
    }, { enqueueTracked: async () => { enqueued += 1; return { queued: true, processingStatus: 'PENDING' }; } });
    await assert.rejects(controller.retryDelivery('lead'), error => error.getStatus() === 400);
    assert.equal(enqueued, 0);
  }

  let saved;
  let enqueued = 0;
  const retryable = new CrmLeadsController({
    lead: {
      findUnique: async () => ({ id: 'lead', processingStatus: 'DELIVERY_ERROR_EMAIL_FAILED' }),
      update: async ({ data }) => { saved = data; },
    },
  }, { enqueueTracked: async () => { enqueued += 1; return { queued: true, processingStatus: 'PENDING' }; } });
  assert.equal((await retryable.retryDelivery('lead')).processingStatus, 'PENDING');
  assert.deepEqual(saved, { processingStatus: 'PENDING' });
  assert.equal(enqueued, 1);
});

test('manual delivery retry cannot bypass a failed persisted phone check', async () => {
  const controller = new CrmLeadsController({ lead: { findUnique: async () => ({
    id: 'lead', processingStatus: 'DELIVERY_QUEUE_ERROR', phone: '79000000000',
    phoneCheckStatus: 'REJECTED', phoneCheckQc: 1, phoneCheckNormalized: '79000000000', deliveryAttempts: [],
  }) } }, { enqueueTracked: async () => assert.fail('phone check bypassed') });
  await assert.rejects(controller.retryDelivery('lead'), /Телефон не прошёл проверку/);
});

test('delivery retry recovers an orphan pending lead with no attempts', async () => {
  let requested;
  const controller = new CrmLeadsController({
    lead: {
      findUnique: async () => ({ id: 'lead', processingStatus: 'PENDING', deliveryAttempts: [] }),
      update: async () => assert.fail('orphan PENDING does not need a status reset'),
    },
  }, {
    enqueueTracked: async (...args) => {
      requested = args;
      return { queued: true, processingStatus: 'PENDING' };
    },
  });

  const result = await controller.retryDelivery('lead');

  assert.deepEqual(requested, ['lead', 1, 0, 1]);
  assert.equal(result.processingStatus, 'PENDING');
});

test('delivery retry starts after the last persisted API attempt without losing a fresh retry budget', async () => {
  let saved;
  let requested;
  const controller = new CrmLeadsController({
    lead: {
      findUnique: async () => ({
        id: 'lead',
        processingStatus: 'DELIVERY_ERROR_EMAIL_FAILED',
        deliveryAttempts: [{ attemptNumber: 3, channel: 'API' }],
      }),
      update: async ({ data }) => { saved = data; },
    },
  }, {
    enqueueTracked: async (...args) => {
      requested = args;
      return { queued: true, processingStatus: 'PENDING' };
    },
  });

  const result = await controller.retryDelivery('lead');

  assert.deepEqual(saved, { processingStatus: 'PENDING' });
  assert.deepEqual(requested, ['lead', 4, 0, 1]);
  assert.equal(result.processingStatus, 'PENDING');
});

test('uncertain email outcome requires explicit operator acknowledgement before another delivery', async () => {
  let saved;
  let requested;
  const controller = new CrmLeadsController({
    lead: {
      findUnique: async () => ({
        id: 'lead', processingStatus: 'DELIVERY_EMAIL_OUTCOME_UNKNOWN',
        updatedAt: new Date('2026-01-01'),
        deliveryAttempts: [{ attemptNumber: 3, channel: 'API' }],
      }),
      updateMany: async ({ data }) => { saved = data; return { count: 1 }; },
    },
  }, {
    enqueueTracked: async (...args) => { requested = args; return { queued: true, processingStatus: 'PENDING' }; },
  });

  await assert.rejects(controller.retryDelivery('lead'), error => error.getStatus() === 400);
  assert.equal(requested, undefined);
  assert.equal((await controller.retryDelivery('lead', { confirmUnknownOutcome: true })).processingStatus, 'PENDING');
  assert.equal(saved.processingStatus, 'PENDING');
  assert.ok(saved.updatedAt instanceof Date);
  assert.deepEqual(requested, ['lead', 4, 0, 1]);
});

test('uncertain Tarifnik outcome requires explicit acknowledgement and a fresh attempt', async () => {
  let saved;
  let requested;
  const controller = new CrmLeadsController({
    lead: {
      findUnique: async () => ({
        id: 'lead', processingStatus: 'DELIVERY_API_OUTCOME_UNKNOWN',
        updatedAt: new Date('2026-01-01'), deliveryAttempts: [{ attemptNumber: 1, channel: 'API', status: 'OUTCOME_UNKNOWN' }],
      }),
      updateMany: async ({ data }) => { saved = data; return { count: 1 }; },
    },
  }, {
    enqueueTracked: async (...args) => { requested = args; return { queued: true, processingStatus: 'PENDING' }; },
  });

  await assert.rejects(controller.retryDelivery('lead'), (error) => error.getStatus() === 400);
  assert.equal(requested, undefined);
  await controller.retryDelivery('lead', { confirmUnknownOutcome: true });
  assert.equal(saved.processingStatus, 'PENDING');
  assert.deepEqual(requested, ['lead', 2, 0, 1]);
});

test('legacy pending lead after terminal API attempt needs the same explicit acknowledgement', async () => {
  let enqueued = 0;
  const controller = new CrmLeadsController({
    lead: {
      findUnique: async () => ({
        id: 'lead', processingStatus: 'PENDING', updatedAt: new Date('2026-01-01'),
        deliveryAttempts: [{ attemptNumber: 2, channel: 'API', status: 'FAILED', nextAttemptAt: null }],
      }),
      updateMany: async () => ({ count: 1 }),
    },
  }, { enqueueTracked: async () => { enqueued += 1; return { queued: true, processingStatus: 'PENDING' }; } });

  await assert.rejects(controller.retryDelivery('lead'), error => error.getStatus() === 400);
  await controller.retryDelivery('lead', { confirmUnknownOutcome: true });
  assert.equal(enqueued, 1);
});

test('notification retry is delegated to the durable outbox service', async () => {
  let requested;
  const controller = new CrmLeadsController({}, {}, {}, {
    retryForLead: async (leadId) => {
      requested = leadId;
      return { id: 'notification', status: 'QUEUED' };
    },
  });

  const result = await controller.retryNotification('lead');

  assert.equal(requested, 'lead');
  assert.deepEqual(result, { id: 'notification', status: 'QUEUED' });
});

test('manual phone retry requires an exhausted technical check and records operator evidence before queuing', async () => {
  assert.ok(Reflect.getMetadata('__guards__', CrmLeadsController)?.some((guard) => guard.name === 'AdminTokenGuard'));
  const lead = { id: 'lead', phoneCheckStatus: 'FAILED', phoneCheckQc: null, phoneCheckAttempt: 3,
    phoneCheckErrorCode: 'HTTP_503', processingStatus: 'PHONE_CHECK_FAILED', updatedAt: new Date('2026-01-01') };
  const events = [];
  let queued;
  const prisma = {
    $transaction: async (callback) => callback(prisma),
    lead: {
      findUnique: async () => lead,
      updateMany: async ({ where, data }) => {
        assert.equal(where.processingStatus, 'PHONE_CHECK_FAILED');
        Object.assign(lead, data);
        return { count: 1 };
      },
    },
    leadDecisionEvent: { create: async ({ data }) => events.push(data) },
  };
  const controller = new CrmLeadsController(prisma, {}, {}, {}, {
    enqueueTracked: async (...args) => { queued = args; return { queued: true }; },
  });
  const result = await controller.retryPhoneCheck('lead', { user: { id: 'operator-1' } });
  assert.deepEqual(queued, ['lead', 4]);
  assert.equal(result.processingStatus, 'DECISION_PENDING');
  assert.equal(lead.phoneCheckStatus, 'PENDING');
  assert.equal(events[0].type, 'MANUAL_PHONE_RETRY');
  assert.equal(events[0].actorId, 'operator-1');
  assert.equal(events[0].attemptNumber, 4);
  assert.equal(events[0].evidence.previousErrorCode, 'HTTP_503');
});

test('manual phone retry cannot bypass a final qc or an unrelated processing state', async () => {
  for (const override of [
    { phoneCheckStatus: 'REJECTED', phoneCheckQc: 1, processingStatus: 'PHONE_INVALID_NOT_SENT' },
    { phoneCheckStatus: 'FAILED', phoneCheckQc: null, processingStatus: 'MANUAL_CHECK' },
  ]) {
    const prisma = { $transaction: async (callback) => callback(prisma),
      lead: { findUnique: async () => ({ id: 'lead', ...override }) } };
    const controller = new CrmLeadsController(prisma, {}, {}, {}, {
      enqueueTracked: async () => assert.fail('blocked retry queued'),
    });
    await assert.rejects(controller.retryPhoneCheck('lead', { user: { id: 'operator' } }), (error) => error.getStatus() === 400);
  }
});

test('explicit comment reanalysis preserves the original reason and prior evidence in an audit event', async () => {
  const lead = { id: 'lead', comment: 'Списали деньги', reasonCode: 'new_connection', reasonLabel: 'Новое подключение',
    commentAnalysisVersion: null, commentAnalysisOutcome: null, commentAnalysisEvidence: null,
    processingStatus: 'MANUAL_CHECK', updatedAt: new Date('2026-01-01') };
  const events = [];
  const prisma = {
    $transaction: async (callback) => callback(prisma),
    lead: {
      findUnique: async () => lead,
      updateMany: async ({ data }) => { Object.assign(lead, data); return { count: 1 }; },
    },
    leadDecisionEvent: { create: async ({ data }) => events.push(data) },
  };
  const controller = new CrmLeadsController(prisma, {}, {}, {}, {});
  const result = await controller.reanalyzeComment('lead', { user: { id: 'operator-1' } });
  assert.equal(result.version, 1);
  assert.equal(lead.commentAnalysisOutcome, 'MANUAL_REVIEW');
  assert.equal(lead.processingStatus, 'MANUAL_CHECK');
  assert.equal(lead.reasonCode, 'new_connection');
  assert.equal(lead.reasonLabel, 'Новое подключение');
  assert.equal(events[0].type, 'COMMENT_REANALYSIS');
  assert.equal(events[0].actorId, 'operator-1');
  assert.equal(events[0].evidence.before.version, null);
  assert.equal(events[0].evidence.after.version, 1);
  await assert.rejects(controller.reanalyzeComment('lead', { user: { id: 'operator-1' } }), (error) => error.getStatus() === 400);
});

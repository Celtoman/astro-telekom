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
  ];
  for (const processingStatus of blockedStatuses) {
    let enqueued = 0;
    const controller = new CrmLeadsController({
      lead: {
        findUnique: async () => ({ id: 'lead', processingStatus }),
        update: async () => assert.fail(`updated blocked ${processingStatus}`),
      },
    }, { enqueue: async () => { enqueued += 1; } });
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
  }, { enqueue: async () => { enqueued += 1; } });
  assert.equal((await retryable.retryDelivery('lead')).processingStatus, 'PENDING');
  assert.deepEqual(saved, { processingStatus: 'PENDING' });
  assert.equal(enqueued, 1);
});

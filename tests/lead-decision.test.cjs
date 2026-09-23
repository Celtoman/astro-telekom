const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { LeadDecisionService } = require('../apps/api/dist/lead-decision.service.js');

function fixture(phoneResult = { kind: 'FINAL', qc: 0, normalizedPhone: '79001234567' }, overrides = {}) {
  const lead = {
    id: 'lead-1', phone: '79001234567', processingStatus: 'DECISION_PENDING', reasonRoute: 'SALES',
    phoneCheckStatus: 'PENDING', phoneCheckQc: null, phoneCheckAttempt: null, phoneCheckNextAttemptAt: null,
    decisionLeaseUntil: null, commentAnalysisOutcome: null,
    city: { subscriberProfileKey: 'kazan' },
    addressCheck: { response: { integration: 'tarifnik', suggestion: { value: 'Казань, 1', unrestricted_value: 'Казань, 1', data: { city: 'Казань', house: '1' } }, providers: { 8: 'Дом.ру' }, targetProviderId: '8', hasAnyProvider: true, hasTargetProvider: true } },
    ...overrides,
  };
  const calls = { phone: 0, contract: 0, delivery: 0, queued: [], updates: [] };
  const prisma = {
    lead: {
      findUnique: async () => ({ ...lead }),
      findFirst: async () => null,
      findMany: async () => [],
      updateMany: async ({ data }) => { Object.assign(lead, data); return { count: 1 }; },
      update: async ({ data }) => { Object.assign(lead, data); calls.updates.push(data); return { ...lead }; },
    },
  };
  const dadata = { cleanPhone: async () => { calls.phone += 1; return typeof phoneResult === 'function' ? phoneResult(calls.phone) : phoneResult; } };
  const contract = { check: async () => { calls.contract += 1; return { status: 'NOT_FOUND', active: false }; } };
  const delivery = { enqueueTracked: async () => { calls.delivery += 1; return { queued: true }; } };
  const service = new LeadDecisionService(prisma, dadata, contract, delivery);
  service.enqueue = async (...args) => { calls.queued.push(args); };
  return { lead, calls, prisma, service };
}

test('qc=0 is saved before subscriber check and only then delivery is enqueued', async () => {
  const f = fixture();
  const result = await f.service.process('lead-1', 1);
  assert.equal(result.status, 'PENDING');
  assert.equal(f.calls.phone, 1);
  assert.equal(f.calls.contract, 1);
  assert.equal(f.calls.delivery, 1);
  assert.equal(f.lead.phoneCheckStatus, 'PASSED');
  assert.equal(f.lead.phoneCheckQc, 0);
  assert.equal(f.lead.phoneCheckNormalized, '79001234567');
  assert.equal(f.lead.processingStatus, 'PENDING');
  assert.equal(f.calls.updates.findIndex((item) => item.phoneCheckQc === 0) < f.calls.updates.findIndex((item) => item.contractResult), true);
});

test('every defined nonzero qc is final and never checks subscriber or delivery', async () => {
  for (const qc of [1, 2, 3, 7]) {
    const f = fixture({ kind: 'FINAL', qc, normalizedPhone: null });
    await f.service.process('lead-1', 1);
    assert.equal(f.lead.processingStatus, 'PHONE_INVALID_NOT_SENT');
    assert.equal(f.lead.phoneCheckStatus, 'REJECTED');
    assert.equal(f.lead.phoneCheckQc, qc);
    assert.equal(f.calls.contract, 0);
    assert.equal(f.calls.delivery, 0);
  }
});

test('technical errors retry at +5m and +30m, then stop without external delivery', async () => {
  const f = fixture({ kind: 'TECHNICAL_ERROR', errorCode: 'HTTP_503' });
  await f.service.process('lead-1', 1);
  assert.equal(f.lead.processingStatus, 'PHONE_CHECK_RETRY');
  assert.equal(f.calls.queued[0][1], 2);
  assert.equal(f.calls.queued[0][2], 5 * 60_000);
  f.lead.phoneCheckNextAttemptAt = new Date(0);
  await f.service.process('lead-1', 2);
  assert.equal(f.calls.queued[1][1], 3);
  assert.equal(f.calls.queued[1][2], 30 * 60_000);
  f.lead.phoneCheckNextAttemptAt = new Date(0);
  await f.service.process('lead-1', 3);
  assert.equal(f.lead.processingStatus, 'PHONE_CHECK_FAILED');
  assert.equal(f.lead.phoneCheckQc, null);
  assert.equal(f.calls.queued.length, 2);
  assert.equal(f.calls.contract, 0);
  assert.equal(f.calls.delivery, 0);
});

test('non-sales and manual reasons short-circuit before DaData Phone', async () => {
  for (const reasonRoute of ['NON_SALES', 'MANUAL']) {
    const f = fixture(undefined, { reasonRoute });
    await f.service.process('lead-1', 1);
    assert.equal(f.calls.phone, 0);
    assert.equal(f.calls.contract, 0);
    assert.equal(f.calls.delivery, 0);
  }
});

test('a final phone result from the prior 24 hours is reused without an API call', async () => {
  const f = fixture();
  f.prisma.lead.findFirst = async ({ where }) => {
    assert.equal(where.phone, '79001234567');
    assert.ok(where.phoneCheckCheckedAt.gte instanceof Date);
    return { phoneCheckQc: 0, phoneCheckNormalized: '79001234567', phoneCheckCheckedAt: new Date() };
  };
  await f.service.process('lead-1', 1);
  assert.equal(f.calls.phone, 0);
  assert.equal(f.lead.phoneCheckSource, 'CACHE');
  assert.equal(f.calls.delivery, 1);
});

test('a technical phone error is never reused as a cached final answer', async () => {
  const f = fixture({ kind: 'TECHNICAL_ERROR', errorCode: 'TRANSPORT' });
  f.prisma.lead.findFirst = async ({ where }) => {
    assert.deepEqual(where.phoneCheckStatus.in, ['PASSED', 'REJECTED']);
    return null;
  };
  await f.service.process('lead-1', 1);
  assert.equal(f.calls.phone, 1);
  assert.equal(f.lead.phoneCheckQc, null);
  assert.equal(f.lead.phoneCheckStatus, 'RETRYING');
  assert.equal(f.calls.contract, 0);
});

test('subscriber and provider failures stop delivery after a passed phone check', async () => {
  for (const response of [{ status: 'ACTIVE', active: true }, { status: 'ERROR', active: null }]) {
    const f = fixture();
    f.service.contract.check = async () => { f.calls.contract += 1; return response; };
    await f.service.process('lead-1', 1);
    assert.equal(f.lead.phoneCheckStatus, 'PASSED');
    assert.equal(f.lead.processingStatus, response.status === 'ACTIVE' ? 'ACTIVE_SUBSCRIBER_NOT_SENT' : 'MANUAL_CHECK_API');
    assert.equal(f.calls.delivery, 0);
  }
});

test('a duplicate worker job cannot repeat an already decided lead', async () => {
  const f = fixture();
  await f.service.process('lead-1', 1);
  await f.service.process('lead-1', 1);
  assert.equal(f.calls.phone, 1);
  assert.equal(f.calls.contract, 1);
  assert.equal(f.calls.delivery, 1);
});

test('a lease claim lost to another worker does not call any external service', async () => {
  const f = fixture();
  f.prisma.lead.updateMany = async () => ({ count: 0 });
  assert.deepEqual(await f.service.process('lead-1', 1), { skipped: true, reason: 'already_claimed' });
  assert.equal(f.calls.phone, 0);
  assert.equal(f.calls.contract, 0);
});

test('qc=0 with a different normalized number is not an automatic pass', async () => {
  const f = fixture({ kind: 'FINAL', qc: 0, normalizedPhone: '79007654321' });
  await f.service.process('lead-1', 1);
  assert.equal(f.lead.processingStatus, 'PHONE_INVALID_NOT_SENT');
  assert.equal(f.lead.phoneCheckErrorCode, 'NORMALIZED_MISMATCH');
  assert.equal(f.calls.contract, 0);
  assert.equal(f.calls.delivery, 0);
});

test('reconciler re-enqueues saved pending and due retry states after restart', async () => {
  const f = fixture();
  f.prisma.lead.findMany = async ({ where, take }) => {
    assert.equal(take, 100);
    assert.ok(where.OR.some((item) => item.processingStatus === 'DECISION_PENDING'));
    assert.ok(where.OR.some((item) => item.processingStatus === 'PHONE_CHECK_RETRY'));
    return [
      { id: 'fresh', processingStatus: 'DECISION_PENDING', phoneCheckAttempt: null },
      { id: 'retry', processingStatus: 'PHONE_CHECK_RETRY', phoneCheckAttempt: 1 },
      { id: 'stalled', processingStatus: 'DECISION_RUNNING', phoneCheckAttempt: 2 },
    ];
  };
  assert.deepEqual(await f.service.reconcilePending(), { scanned: 3, queued: 3 });
  assert.deepEqual(f.calls.queued, [['fresh', 1, 0], ['retry', 2, 0], ['stalled', 2, 0]]);
});

test('worker-only decision route and recurring recovery are wired without browser credentials', () => {
  const root = join(__dirname, '..');
  const module = readFileSync(join(root, 'apps', 'api', 'src', 'module.ts'), 'utf8');
  const controller = readFileSync(join(root, 'apps', 'api', 'src', 'lead-decision.controller.ts'), 'utf8');
  const worker = readFileSync(join(root, 'services', 'worker', 'src', 'index.mjs'), 'utf8');
  assert.match(module, /LeadDecisionService/);
  assert.match(module, /LeadDecisionController/);
  assert.match(controller, /@Controller\('internal\/lead-decisions'\)/);
  assert.match(controller, /@UseGuards\(AdminTokenGuard\)/);
  assert.match(controller, /reconcilePending/);
  assert.match(worker, /new Worker\(\s*'lead-decisions'/);
  assert.match(worker, /internal\/lead-decisions\/reconcile/);
  assert.match(worker, /lead-decision-reconcile-every-minute/);
});

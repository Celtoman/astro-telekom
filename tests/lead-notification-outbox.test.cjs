const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { LeadNotificationOutboxService } = require('../apps/api/dist/lead-notification-outbox.service.js');
const { LeadNotificationError } = require('../apps/api/dist/notifications.service.js');

function notification(overrides = {}) {
  return {
    id: 'notification-1',
    leadId: 'lead-1',
    status: 'PENDING',
    revision: 1,
    attempts: 0,
    maxAttempts: 3,
    lead: {
      id: 'lead-1',
      phone: '+79000000000',
      name: 'Иван',
      address: 'Улица, 1',
      city: { name: 'Казань' },
      tariff: { name: 'Тестовый' },
    },
    ...overrides,
  };
}

function fixture(record = notification(), notifyLead = async () => ({ transport: 'resend', providerMessageId: 'email-1' })) {
  const updates = [];
  const records = [record];
  const prisma = {
    leadNotification: {
      findUnique: async () => records[0],
      findMany: async () => records,
      updateMany: async ({ where, data }) => {
        const allowed = typeof where.status === 'string'
          ? record.status === where.status
          : !where.status?.in || where.status.in.includes(record.status);
        const revisionMatches = where.revision === undefined || where.revision === record.revision;
        const attemptsMatch = where.attempts === undefined || where.attempts === record.attempts;
        const leaseMatches = !where.startedAt?.lte || (record.startedAt && record.startedAt <= where.startedAt.lte);
        if (!allowed || !revisionMatches || !attemptsMatch || !leaseMatches) return { count: 0 };
        updates.push({ where, data });
        const revision = typeof data.revision === 'object' ? record.revision + (data.revision.increment || 0) : data.revision;
        Object.assign(record, data, revision === undefined ? {} : { revision });
        return { count: 1 };
      },
      update: async ({ data }) => { updates.push({ data }); Object.assign(records[0], data, { revision: records[0].revision + (data.revision?.increment || 0) }); return records[0]; },
    },
  };
  const service = new LeadNotificationOutboxService(prisma, { notifyLead });
  service.logger = { warn() {}, error() {} };
  return { service, updates, record: records[0] };
}

test('notification queue uses a deterministic revisioned job and restores PENDING after enqueue failure', async () => {
  const f = fixture();
  let queued;
  f.service.queue = {
    add: async (name, data, options) => { queued = { name, data, options }; },
  };

  assert.equal(await f.service.enqueueTracked('notification-1'), true);
  assert.equal(queued.name, 'notify');
  assert.deepEqual(queued.data, { notificationId: 'notification-1', revision: 1, attemptNumber: 1, maxAttempts: 3 });
  assert.equal(queued.options.jobId, 'lead-notification-notification-1-revision-1-attempt-1');
  assert.doesNotMatch(queued.options.jobId, /:/);
  assert.equal(queued.options.removeOnFail, true);

  const failed = fixture();
  failed.service.queue = { add: async () => { throw new Error('Redis unavailable'); } };
  assert.equal(await failed.service.enqueueTracked('notification-1'), false);
  assert.equal(failed.updates.at(-1).data.status, 'PENDING');
  assert.equal(failed.updates.at(-1).data.errorCode, 'queue_error');
});

test('notification processing records provider evidence and skips an already successful record', async () => {
  let sent;
  const f = fixture(notification({ status: 'QUEUED' }), async (lead) => {
    sent = lead;
    return { transport: 'resend', providerMessageId: 'email-1' };
  });

  const result = await f.service.process('notification-1', 1, 3, 1);

  assert.deepEqual(result, { notified: true, transport: 'resend', providerMessageId: 'email-1' });
  assert.equal(f.updates.at(-1).data.status, 'SUCCEEDED');
  assert.equal(f.updates.at(-1).data.providerMessageId, 'email-1');
  assert.equal(sent.notificationRevision, 1);

  const done = fixture(notification({ status: 'SUCCEEDED' }), async () => assert.fail('must not resend'));
  assert.deepEqual(await done.service.process('notification-1', 2, 3, 1), { skipped: true, reason: 'already_succeeded' });
});

test('notification processing cannot claim a record already owned by another worker', async () => {
  const f = fixture(notification({ status: 'RUNNING' }), async () => assert.fail('must not send concurrently'));

  const result = await f.service.process('notification-1', 1, 3, 1);

  assert.deepEqual(result, { skipped: true, reason: 'not_claimed' });
});

test('notification processing rejects a job with a stale attempt budget', async () => {
  const f = fixture(notification({ status: 'QUEUED', maxAttempts: 3 }), async () => assert.fail('must not send with stale metadata'));

  const result = await f.service.process('notification-1', 1, 4, 1);

  assert.deepEqual(result, { skipped: true, reason: 'stale_attempt_metadata' });
  assert.equal(f.updates.length, 0);
});

test('a late provider result cannot overwrite a newer running attempt', async () => {
  const record = notification({ status: 'QUEUED' });
  const f = fixture(record, async () => {
    record.status = 'RUNNING';
    record.attempts = 2;
    return { transport: 'resend', providerMessageId: 'late-email' };
  });

  const result = await f.service.process('notification-1', 1, 3, 1);

  assert.deepEqual(result, { skipped: true, reason: 'stale_result' });
  assert.equal(record.attempts, 2);
  assert.equal(record.providerMessageId, undefined);
});

test('notification processing retries only transient failures and ends permanently without leaking PII', async () => {
  const retryable = fixture(notification({ status: 'QUEUED' }), async () => {
    throw new LeadNotificationError('provider unavailable', 'resend', 'http_error', 503);
  });
  const retryResult = await retryable.service.process('notification-1', 1, 3, 1);
  assert.deepEqual(retryResult, { notified: false, status: 'QUEUED' });
  const retryUpdate = retryable.updates.find(({ data }) => data.status === 'RETRYING');
  assert.equal(retryUpdate.data.errorCode, 'http_error');
  assert.equal(retryUpdate.data.httpStatus, 503);

  const permanent = fixture(notification({ status: 'QUEUED' }), async () => {
    throw new LeadNotificationError('invalid recipient +79000000000', 'resend', 'http_error', 422);
  });
  const result = await permanent.service.process('notification-1', 1, 3, 1);
  assert.deepEqual(result, { notified: false, status: 'FAILED' });
  assert.equal(permanent.updates.at(-1).data.status, 'FAILED');
  assert.doesNotMatch(JSON.stringify(permanent.updates), /\+79000000000/);
});

test('an unknown implementation error is recorded safely without automatic retry', async () => {
  const f = fixture(notification({ status: 'QUEUED' }), async () => {
    throw new TypeError('unexpected bug containing +79000000000');
  });

  const result = await f.service.process('notification-1', 1, 3, 1);

  assert.deepEqual(result, { notified: false, status: 'FAILED' });
  const failure = f.updates.at(-1).data;
  assert.equal(failure.errorCode, 'internal_error');
  assert.doesNotMatch(JSON.stringify(failure), /\+79000000000/);
});

test('startup recovery reschedules every unfinished notification', async () => {
  const f = fixture(notification({ status: 'RETRYING' }));
  const enqueued = [];
  f.service.enqueueTracked = async (...args) => { enqueued.push(args); return true; };

  await f.service.onModuleInit();

  assert.deepEqual(enqueued, [['notification-1', 0, true]]);
});

test('recovery preserves the persisted attempt budget and does not steal a fresh RUNNING lease', async () => {
  const retrying = fixture(notification({ status: 'RETRYING', attempts: 2 }));
  let queued;
  retrying.service.queue = { add: async (name, data, options) => { queued = { name, data, options }; } };
  await retrying.service.recoverUnfinished();
  assert.equal(queued.data.attemptNumber, 3);
  assert.equal(queued.options.jobId, 'lead-notification-notification-1-revision-1-attempt-3');

  const running = fixture(notification({ status: 'RUNNING', startedAt: new Date() }), async () => assert.fail('must not resend'));
  running.service.queue = { add: async () => assert.fail('fresh RUNNING must not be enqueued') };
  await running.service.recoverUnfinished();
  assert.equal(running.record.status, 'RUNNING');
});

test('manual retry starts a new revision so a retained BullMQ job cannot suppress it', async () => {
  const f = fixture(notification({ status: 'FAILED', attempts: 3 }));
  let queued;
  f.service.queue = { add: async (name, data, options) => { queued = { name, data, options }; } };

  const result = await f.service.retryForLead('lead-1');

  assert.equal(result.status, 'QUEUED');
  assert.equal(f.record.revision, 2);
  assert.equal(f.record.attempts, 0);
  assert.equal(queued.options.jobId, 'lead-notification-notification-1-revision-2-attempt-1');
});

test('manual retry uses compare-and-swap when another operator already changed the record', async () => {
  const f = fixture(notification({ status: 'FAILED', attempts: 3 }));
  f.service.prisma.leadNotification.updateMany = async () => ({ count: 0 });

  await assert.rejects(f.service.retryForLead('lead-1'), (error) => error.getStatus() === 409);
});

test('worker forwards notification attempt metadata to the protected internal route', () => {
  const source = readFileSync(join(__dirname, '..', 'services', 'worker', 'src', 'index.mjs'), 'utf8');
  const controller = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'lead-notification.controller.ts'), 'utf8');
  const moduleSource = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'module.ts'), 'utf8');
  assert.match(source, /internal\/lead-notifications/);
  assert.match(source, /attemptNumber:\s*job\.data\.attemptNumber/);
  assert.match(source, /maxAttempts:\s*job\.data\.maxAttempts/);
  assert.match(source, /revision:\s*job\.data\.revision/);
  assert.match(source, /AbortSignal\.timeout\(30_000\)/);
  assert.match(controller, /@Controller\('internal\/lead-notifications'\)/);
  assert.match(controller, /@UseGuards\(AdminTokenGuard\)/);
  assert.match(moduleSource, /LeadNotificationController/);
  assert.match(moduleSource, /LeadNotificationOutboxService/);
});

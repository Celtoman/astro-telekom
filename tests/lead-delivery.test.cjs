const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { LeadDeliveryService } = require('../apps/api/dist/lead-delivery.service.js');

const suggestion = {
  value: 'г Казань, ул Тестовая, д 1',
  unrestricted_value: '420000, Республика Татарстан, г Казань, ул Тестовая, д 1',
  data: { city: 'Казань', house: '1', fias_id: 'test-house-fias' },
};

function lead(overrides = {}) {
  return {
    id: 'lead-1',
    processingStatus: 'PENDING',
    deliveryKey: 'delivery-key',
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
    phone: '+7 (900) 000-00-00',
    name: 'Иван',
    address: suggestion.value,
    objectType: 'house',
    source: 'website',
    pageUrl: 'https://partner.example.test/kazan/',
    utm: { utm_source: 'test' },
    city: { name: 'Казань', slug: 'kazan' },
    page: null,
    tariff: null,
    site: { id: 'site-1' },
    contractResult: { status: 'NOT_FOUND', active: false },
    addressCheck: {
      response: {
        integration: 'tarifnik',
        suggestion,
        providers: { 8: 'Дом.ру' },
        targetProviderId: '8',
        hasAnyProvider: true,
        hasTargetProvider: true,
      },
    },
    ...overrides,
  };
}

function fixture(record) {
  const attempts = [];
  const attemptUpdates = [];
  const updates = [];
  const prisma = {
    lead: {
      findUnique: async () => record,
      update: async ({ data }) => { updates.push(data); Object.assign(record, data); return record; },
      updateMany: async ({ where, data }) => {
        if (record.id !== where.id || record.processingStatus !== where.processingStatus) return { count: 0 };
        updates.push(data);
        Object.assign(record, data);
        return { count: 1 };
      },
    },
    leadDeliveryAttempt: {
      create: async ({ data }) => {
        if (attempts.some((attempt) => attempt.leadId === data.leadId && attempt.attemptNumber === data.attemptNumber && attempt.channel === data.channel)) {
          throw new Error('Unique constraint failed on (leadId, attemptNumber, channel)');
        }
        attempts.push(data);
        return data;
      },
      count: async ({ where }) => attempts.filter((attempt) => attempt.leadId === where.leadId && attempt.channel === where.channel).length,
      update: async ({ where, data }) => { attemptUpdates.push({ where, data }); return data; },
    },
    $transaction: async (operations) => {
      if (typeof operations !== 'function') return Promise.all(operations);
      const beforeLead = { ...record };
      const beforeAttemptCount = attempts.length;
      try {
        return await operations(prisma);
      } catch (error) {
        Object.assign(record, beforeLead);
        attempts.length = beforeAttemptCount;
        throw error;
      }
    },
  };
  const notifications = { notifyDeliveryFallback: async () => {} };
  const service = new LeadDeliveryService(prisma, notifications);
  service.logger = { warn() {}, error() {} };
  return { service, prisma, attempts, attemptUpdates, updates };
}

test('BullMQ delivery job uses a deterministic custom id without forbidden colons', async () => {
  const f = fixture(lead());
  let queued;
  f.service.queue = {
    add: async (name, data, options) => { queued = { name, data, options }; },
  };

  await f.service.enqueue('lead-1', 1, 0, 1);

  assert.equal(queued.name, 'deliver');
  assert.deepEqual(queued.data, { leadId: 'lead-1', attemptNumber: 1, retryNumber: 1 });
  assert.equal(queued.options.jobId, 'lead-delivery-lead-1-attempt-1');
  assert.doesNotMatch(queued.options.jobId, /:/);
});

test('lead delivery worker forwards both the global attempt and retry-cycle numbers', () => {
  const workerSource = readFileSync(join(__dirname, '..', 'services', 'worker', 'src', 'index.mjs'), 'utf8');

  assert.match(workerSource, /JSON\.stringify\(\{\s*attemptNumber:\s*job\.data\.attemptNumber,\s*retryNumber:\s*job\.data\.retryNumber\s*\}\)/);
});

test('queue enqueue failure is persisted and changes the lead to an actionable status', async () => {
  const f = fixture(lead());
  assert.equal(typeof f.service.enqueueTracked, 'function', 'LeadDeliveryService.enqueueTracked must exist');
  f.service.enqueue = async () => { throw new Error('Redis unavailable'); };

  const result = await f.service.enqueueTracked('lead-1', 1, 0, 1);

  assert.deepEqual(result, { queued: false, processingStatus: 'DELIVERY_QUEUE_ERROR' });
  assert.equal(f.attempts[0].channel, 'QUEUE');
  assert.equal(f.attempts[0].status, 'FAILED');
  assert.match(f.attempts[0].error, /Redis unavailable/);
  assert.equal(f.updates.at(-1).processingStatus, 'DELIVERY_QUEUE_ERROR');
});

test('in-process fallback preserves the retry number', async () => {
  const f = fixture(lead());
  const processed = [];
  f.service.process = async (...args) => { processed.push(args); };

  await f.service.enqueue('lead-1', 4, 0, 2);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(processed, [['lead-1', 4, 2]]);
});

test('delivery refuses a non-sales reason even if a stale job sees PENDING', async () => {
  const f = fixture(lead({ reasonRoute: 'NON_SALES' }));
  const result = await f.service.process('lead-1', 1, 1);
  assert.deepEqual(result, { skipped: true, reason: 'non_sales_reason' });
  assert.equal(f.updates.at(-1).processingStatus, 'NON_SALES_NOT_SENT');
  assert.equal(f.attempts.length, 0);
});

async function withDeliveryEnvironment(callback) {
  const names = ['REDIS_URL', 'TARIFNIK_API_URL', 'TARIFNIK_API_KEY', 'TARIFNIK_UTM_CAMPAIGN', 'TARIFNIK_TARGET_PROVIDER_ID'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    delete process.env.REDIS_URL;
    process.env.TARIFNIK_API_URL = 'https://dealers-api.tarifnik.test/api/v3.0/appeal/create';
    process.env.TARIFNIK_API_KEY = 'test-token';
    process.env.TARIFNIK_UTM_CAMPAIGN = 'test';
    process.env.TARIFNIK_TARGET_PROVIDER_ID = '8';
    await callback();
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('Tarifnik delivery sends only the official appeal/create payload and validates success', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead());
    global.fetch = async (url, options) => {
      assert.equal(String(url), process.env.TARIFNIK_API_URL);
      assert.equal(options.headers.authorization, 'Bearer test-token');
      assert.equal(options.headers['idempotency-key'], undefined);
      assert.deepEqual(JSON.parse(options.body), {
        utm_campaign: 'test',
        phone: '79000000000',
        belong_type: 'house',
        suggestion,
        name: 'Иван',
      });
      return new Response(JSON.stringify({ result: 'created', appeal_id: 'appeal-uuid' }), { status: 200 });
    };

    const result = await f.service.process('lead-1', 3);

    assert.deepEqual(result, { delivered: true, externalId: 'appeal-uuid' });
    assert.equal(f.attempts[0].status, 'SUCCEEDED');
    assert.equal(f.updates.at(-1).processingStatus, 'DELIVERED');
    assert.equal(f.updates.at(-1).externalStatus, 'created');
  });
});

test('Tarifnik delivery refuses a pending lead without verified target coverage', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead({ addressCheck: null }));
    let fetchCalls = 0;
    global.fetch = async () => { fetchCalls += 1; throw new Error('must not send'); };

    const result = await f.service.process('lead-1', 3);

    assert.deepEqual(result, { skipped: true, reason: 'coverage_not_verified' });
    assert.equal(fetchCalls, 0);
    assert.equal(f.updates.at(-1).processingStatus, 'MANUAL_CHECK_API');
  });
});

test('Tarifnik delivery refuses a pending lead without a verified negative subscriber result', async () => {
  await withDeliveryEnvironment(async () => {
    for (const contractResult of [null, { status: 'ERROR', active: null }, { status: 'ACTIVE', active: true }]) {
      const f = fixture(lead({ contractResult }));
      let fetchCalls = 0;
      global.fetch = async () => { fetchCalls += 1; throw new Error('must not send'); };

      const result = await f.service.process('lead-1', 3);

      assert.deepEqual(result, { skipped: true, reason: 'subscriber_not_verified' });
      assert.equal(fetchCalls, 0);
      assert.equal(f.updates.at(-1).processingStatus, 'MANUAL_CHECK_API');
    }
  });
});

test('Tarifnik delivery rejects an ambiguous HTTP 200 response instead of marking the lead delivered', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead());
    global.fetch = async () => new Response(JSON.stringify({ result: 'ok', id: 'wrong-id' }), { status: 200 });

    const result = await f.service.process('lead-1', 3);

    assert.deepEqual(result, { delivered: false, fallback: true });
    assert.equal(f.attempts[0].status, 'FAILED');
    assert.match(f.attempts[0].error, /unexpected response/i);
    assert.notEqual(f.updates.at(-1).processingStatus, 'DELIVERED');
  });
});

test('Tarifnik delivery sends permanent and ambiguous failures straight to manual fallback', async () => {
  await withDeliveryEnvironment(async () => {
    const failures = [
      () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
      () => new Response(JSON.stringify({ message: 'Validation failed', errors: { phone: ['invalid'] } }), { status: 422 }),
      () => new Response('<html>unexpected</html>', { status: 200 }),
      () => new Response(JSON.stringify({ result: 'unknown', appeal_id: 'ambiguous' }), { status: 200 }),
    ];

    for (const response of failures) {
      const f = fixture(lead());
      const enqueued = [];
      f.service.enqueueTracked = async (...args) => { enqueued.push(args); return { queued: true, processingStatus: 'PENDING' }; };
      global.fetch = async () => response();

      const result = await f.service.process('lead-1', 1);

      assert.deepEqual(result, { delivered: false, fallback: true });
      assert.equal(f.attempts[0].status, 'FAILED');
      assert.equal(f.attempts[0].nextAttemptAt, null);
      assert.deepEqual(enqueued, []);
      assert.notEqual(f.updates.at(-1)?.processingStatus, 'DELIVERED');
    }
  });
});

test('Tarifnik delivery retries only transient HTTP and network failures with bounded delay', async () => {
  await withDeliveryEnvironment(async () => {
    const failures = [
      () => new Response('{}', { status: 408 }),
      () => new Response('{}', { status: 425 }),
      () => new Response('{}', { status: 500 }),
      () => { throw new DOMException('Timed out', 'TimeoutError'); },
    ];

    for (const response of failures) {
      const f = fixture(lead());
      const enqueued = [];
      f.service.enqueue = async (...args) => { enqueued.push(args); };
      global.fetch = async () => response();

      const result = await f.service.process('lead-1', 1);

      assert.equal(result.delivered, false);
      assert.equal(typeof result.retryAt, 'string');
      assert.equal(f.attempts[0].status, 'FAILED');
      assert.deepEqual(enqueued, [['lead-1', 2, 300_000, 2]]);
      assert.notEqual(f.updates.at(-1)?.processingStatus, 'DELIVERED');
    }
  });
});

test('Tarifnik delivery respects a bounded Retry-After delay for rate limiting', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead());
    const enqueued = [];
    f.service.enqueueTracked = async (...args) => { enqueued.push(args); return { queued: true, processingStatus: 'PENDING' }; };
    global.fetch = async () => new Response('{}', { status: 429, headers: { 'retry-after': '120' } });

    const result = await f.service.process('lead-1', 1);

    assert.equal(typeof result.retryAt, 'string');
    assert.deepEqual(enqueued, [['lead-1', 2, 120_000, 2]]);
  });
});

test('a manual delivery cycle uses a fresh global attempt number and receives its own retry budget', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead());
    const enqueued = [];
    f.service.enqueueTracked = async (...args) => { enqueued.push(args); return { queued: true, processingStatus: 'PENDING' }; };
    global.fetch = async () => new Response('{}', { status: 500 });

    const result = await f.service.process('lead-1', 4, 1);

    assert.equal(typeof result.retryAt, 'string');
    assert.deepEqual(enqueued, [['lead-1', 5, 300_000, 2]]);
    assert.equal(f.attempts[0].attemptNumber, 4);
  });
});

test('a second manual delivery cycle records a distinct successful email fallback and finishes the lead', async () => {
  await withDeliveryEnvironment(async () => {
    const currentLead = lead();
    const f = fixture(currentLead);
    let fallbackCalls = 0;
    f.service.notifications.notifyDeliveryFallback = async () => { fallbackCalls += 1; };
    global.fetch = async () => new Response('{}', { status: 403 });

    assert.deepEqual(await f.service.process('lead-1', 1), { delivered: false, fallback: true });
    currentLead.processingStatus = 'PENDING';
    assert.deepEqual(await f.service.process('lead-1', 2), { delivered: false, fallback: true });

    assert.equal(fallbackCalls, 2);
    assert.deepEqual(f.attempts.filter((attempt) => attempt.channel === 'EMAIL').map((attempt) => [attempt.attemptNumber, attempt.status]), [
      [1, 'SUCCEEDED'],
      [2, 'SUCCEEDED'],
    ]);
    assert.equal(f.updates.at(-1).processingStatus, 'DELIVERY_ERROR_EMAIL_SENT');
  });
});

test('a second manual delivery cycle records a distinct failed email fallback and remains retryable', async () => {
  await withDeliveryEnvironment(async () => {
    const currentLead = lead();
    const f = fixture(currentLead);
    let fallbackCalls = 0;
    f.service.notifications.notifyDeliveryFallback = async () => {
      fallbackCalls += 1;
      if (fallbackCalls === 2) throw new Error('Email transport failed');
    };
    global.fetch = async () => new Response('{}', { status: 403 });

    assert.deepEqual(await f.service.process('lead-1', 1), { delivered: false, fallback: true });
    currentLead.processingStatus = 'PENDING';
    assert.deepEqual(await f.service.process('lead-1', 2), { delivered: false, fallback: false });

    assert.equal(fallbackCalls, 2);
    assert.deepEqual(f.attempts.filter((attempt) => attempt.channel === 'EMAIL').map((attempt) => [attempt.attemptNumber, attempt.status]), [
      [1, 'SUCCEEDED'],
      [2, 'FAILED'],
    ]);
    assert.equal(f.updates.at(-1).processingStatus, 'DELIVERY_ERROR_EMAIL_FAILED');
  });
});

test('a failed email outcome write is not reported as a failed email transport', async () => {
  await withDeliveryEnvironment(async () => {
    const currentLead = lead();
    const f = fixture(currentLead);
    const createAttempt = f.prisma.leadDeliveryAttempt.create;
    let fallbackCalls = 0;
    f.service.notifications.notifyDeliveryFallback = async () => { fallbackCalls += 1; };
    f.prisma.leadDeliveryAttempt.create = async (args) => {
      if (args.data.channel === 'EMAIL' && args.data.status === 'SUCCEEDED') {
        throw new Error('Database unavailable after email send');
      }
      return createAttempt(args);
    };
    global.fetch = async () => new Response('{}', { status: 403 });

    await assert.rejects(f.service.process('lead-1', 1), /Database unavailable after email send/);

    assert.equal(fallbackCalls, 1);
    assert.equal(f.attempts.filter((attempt) => attempt.channel === 'EMAIL').length, 0);
    assert.equal(currentLead.processingStatus, 'DELIVERY_EMAIL_OUTCOME_UNKNOWN');
    assert.deepEqual(await f.service.process('lead-1', 1), { skipped: true, reason: 'DELIVERY_EMAIL_OUTCOME_UNKNOWN' });
    assert.equal(fallbackCalls, 1, 'a replay must not send a second fallback email');
  });
});

test('email fallback is not sent when the durable uncertain-outcome marker cannot be written', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead());
    let fallbackCalls = 0;
    f.service.notifications.notifyDeliveryFallback = async () => { fallbackCalls += 1; };
    f.prisma.lead.updateMany = async () => { throw new Error('Database unavailable before email send'); };
    global.fetch = async () => new Response('{}', { status: 403 });

    await assert.rejects(f.service.process('lead-1', 1), /Database unavailable before email send/);
    assert.equal(fallbackCalls, 0);
  });
});

test('failed retry scheduling clears the misleading next-at timestamp', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead());
    f.service.enqueueTracked = async () => ({ queued: false, processingStatus: 'DELIVERY_QUEUE_ERROR' });
    global.fetch = async () => new Response('{}', { status: 500 });

    const result = await f.service.process('lead-1', 1, 1);

    assert.deepEqual(result, { delivered: false, queueError: true });
    assert.deepEqual(f.attemptUpdates, [{
      where: { leadId_attemptNumber_channel: { leadId: 'lead-1', attemptNumber: 1, channel: 'API' } },
      data: { nextAttemptAt: null },
    }]);
  });
});

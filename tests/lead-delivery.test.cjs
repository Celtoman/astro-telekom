const { test } = require('node:test');
const assert = require('node:assert/strict');
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
  const updates = [];
  const prisma = {
    lead: {
      findUnique: async () => record,
      update: async ({ data }) => { updates.push(data); return { ...record, ...data }; },
    },
    leadDeliveryAttempt: {
      create: async ({ data }) => { attempts.push(data); return data; },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const notifications = { notifyDeliveryFallback: async () => {} };
  const service = new LeadDeliveryService(prisma, notifications);
  service.logger = { warn() {}, error() {} };
  return { service, attempts, updates };
}

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
      f.service.enqueue = async (...args) => { enqueued.push(args); };
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
      assert.deepEqual(enqueued, [['lead-1', 2, 300_000]]);
      assert.notEqual(f.updates.at(-1)?.processingStatus, 'DELIVERED');
    }
  });
});

test('Tarifnik delivery respects a bounded Retry-After delay for rate limiting', async () => {
  await withDeliveryEnvironment(async () => {
    const f = fixture(lead());
    const enqueued = [];
    f.service.enqueue = async (...args) => { enqueued.push(args); };
    global.fetch = async () => new Response('{}', { status: 429, headers: { 'retry-after': '120' } });

    const result = await f.service.process('lead-1', 1);

    assert.equal(typeof result.retryAt, 'string');
    assert.deepEqual(enqueued, [['lead-1', 2, 120_000]]);
  });
});

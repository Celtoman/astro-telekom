const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NotificationsService } = require('../apps/api/dist/notifications.service.js');

function preserveNotificationEnvironment(t) {
  const previous = {
    recipient: process.env.LEADS_EMAIL,
    resend: process.env.RESEND_API_KEY,
    webhook: process.env.LEADS_EMAIL_WEBHOOK_URL,
    fetch: global.fetch,
  };
  t.after(() => {
    global.fetch = previous.fetch;
    for (const [key, value] of [
      ['LEADS_EMAIL', previous.recipient],
      ['RESEND_API_KEY', previous.resend],
      ['LEADS_EMAIL_WEBHOOK_URL', previous.webhook],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('ordinary Resend notification rejects an unsuccessful HTTP response', async (t) => {
  preserveNotificationEnvironment(t);

  process.env.LEADS_EMAIL = 'operator@example.test';
  process.env.RESEND_API_KEY = 'resend-test-key';
  delete process.env.LEADS_EMAIL_WEBHOOK_URL;
  const notifications = new NotificationsService({});
  for (const status of [422, 503]) {
    global.fetch = async () => new Response('{"message":"transport rejected the request"}', { status });
    await assert.rejects(
      notifications.notifyLead({ id: 'lead-1', notificationRevision: 7, phone: '+79000000000', city: 'Казань' }),
      (error) => {
        assert.match(error.message, new RegExp(`Lead notification via Resend responded ${status}`));
        assert.doesNotMatch(error.message, /transport rejected the request/);
        return true;
      },
    );
  }
});

test('ordinary Resend notification rejects malformed success payloads and blank email ids', async (t) => {
  preserveNotificationEnvironment(t);

  process.env.LEADS_EMAIL = 'operator@example.test';
  process.env.RESEND_API_KEY = 'resend-test-key';
  delete process.env.LEADS_EMAIL_WEBHOOK_URL;
  const notifications = new NotificationsService({});
  for (const body of ['{}', '{not-json', '{"id":"   "}']) {
    global.fetch = async () => new Response(body, { status: 200 });
    await assert.rejects(
      notifications.notifyLead({ id: 'lead-1', notificationRevision: 7, phone: '+79000000000', city: 'Казань' }),
      /Lead notification via Resend returned an invalid response/,
    );
  }
});

test('ordinary webhook notification rejects an unsuccessful HTTP response', async (t) => {
  preserveNotificationEnvironment(t);

  process.env.LEADS_EMAIL = 'operator@example.test';
  delete process.env.RESEND_API_KEY;
  process.env.LEADS_EMAIL_WEBHOOK_URL = 'https://mail.example.test/new-lead';
  const notifications = new NotificationsService({});
  for (const status of [422, 503]) {
    global.fetch = async () => new Response(null, { status });
    await assert.rejects(
      notifications.notifyLead({ id: 'lead-1', notificationRevision: 7, phone: '+79000000000', city: 'Казань' }),
      new RegExp(`Lead notification webhook responded ${status}`),
    );
  }
});

test('ordinary Resend notification accepts a successful response with an email id', async (t) => {
  preserveNotificationEnvironment(t);
  process.env.LEADS_EMAIL = 'operator@example.test';
  process.env.RESEND_API_KEY = 'resend-test-key';
  delete process.env.LEADS_EMAIL_WEBHOOK_URL;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response('{"id":"email-123"}', { status: 200 });
  };

  const notifications = new NotificationsService({});

  const result = await notifications.notifyLead({ id: 'lead-1', notificationRevision: 7, phone: '+79000000000', city: 'Казань' });

  assert.deepEqual(result, { transport: 'resend', providerMessageId: 'email-123' });
  assert.equal(request.options.headers['idempotency-key'], 'lead-notification-lead-1-revision-7');
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('ordinary webhook notification accepts a successful empty response', async (t) => {
  preserveNotificationEnvironment(t);
  process.env.LEADS_EMAIL = 'operator@example.test';
  delete process.env.RESEND_API_KEY;
  process.env.LEADS_EMAIL_WEBHOOK_URL = 'https://mail.example.test/new-lead';
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };

  const notifications = new NotificationsService({});

  const result = await notifications.notifyLead({ id: 'lead-1', notificationRevision: 7, phone: '+79000000000', city: 'Казань' });

  assert.deepEqual(result, { transport: 'webhook' });
  assert.equal(request.options.headers['idempotency-key'], 'lead-notification-lead-1-revision-7');
});

test('ordinary notification classifies transient and permanent failures for bounded retry', async (t) => {
  preserveNotificationEnvironment(t);
  process.env.LEADS_EMAIL = 'operator@example.test';
  process.env.RESEND_API_KEY = 'resend-test-key';
  delete process.env.LEADS_EMAIL_WEBHOOK_URL;
  const notifications = new NotificationsService({});

  for (const [response, expectedRetryable] of [
    [() => new Response('{}', { status: 422 }), false],
    [() => new Response('{}', { status: 429 }), true],
    [() => new Response('{}', { status: 503 }), true],
    [() => { throw new TypeError('network down'); }, true],
    [() => ({ ok: true, status: 200, text: async () => { throw new TypeError('body stream reset'); } }), true],
  ]) {
    global.fetch = async () => response();
    await assert.rejects(
      notifications.notifyLead({ id: 'lead-1', notificationRevision: 7, phone: '+79000000000', city: 'Казань' }),
      (error) => error.retryable === expectedRetryable,
    );
  }
});

test('ordinary notification fails permanently when no transport is configured', async (t) => {
  preserveNotificationEnvironment(t);
  delete process.env.LEADS_EMAIL;
  delete process.env.RESEND_API_KEY;
  delete process.env.LEADS_EMAIL_WEBHOOK_URL;

  await assert.rejects(
    new NotificationsService({}).notifyLead({ id: 'lead-1', notificationRevision: 7, phone: '+79000000000', city: 'Казань' }),
    (error) => error.code === 'not_configured' && error.transport === 'none' && error.retryable === false,
  );
});

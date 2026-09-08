const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LeadAccessService } = require('../apps/api/dist/lead-access.service.js');
const { NotificationsService } = require('../apps/api/dist/notifications.service.js');

function fixture() {
  const tokens = [];
  const leads = new Map([
    ['lead-1', {
      id: 'lead-1',
      createdAt: new Date('2026-09-08T07:00:00.000Z'),
      phone: '+79000000000',
      name: 'Иван',
      address: 'ул. Ленина, 1',
      processingStatus: 'DELIVERY_ERROR_EMAIL_SENT',
      city: { name: 'Казань', slug: 'kazan' },
      tariff: { name: 'Гига 500' },
    }],
    ['lead-2', {
      id: 'lead-2',
      createdAt: new Date('2026-09-08T07:05:00.000Z'),
      phone: '+79010000000',
      name: 'Анна',
      address: 'ул. Баумана, 2',
      processingStatus: 'DELIVERY_ERROR_EMAIL_SENT',
      city: { name: 'Казань', slug: 'kazan' },
      tariff: null,
    }],
  ]);

  const active = (token, where) => token.leadId === where.leadId
    && token.tokenHash === where.tokenHash
    && token.usedAt === null
    && token.revokedAt === null
    && token.expiresAt > where.expiresAt.gt;

  const tx = {
    leadAccessToken: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const token of tokens) {
          const matchesIssueRevocation = where.leadId === token.leadId
            && where.usedAt === null
            && where.revokedAt === null;
          const matchesConsume = where.id === token.id
            && token.usedAt === null
            && token.revokedAt === null
            && token.expiresAt > where.expiresAt.gt;
          if (matchesIssueRevocation || matchesConsume) {
            Object.assign(token, data);
            count += 1;
          }
        }
        return { count };
      },
      create: async ({ data }) => {
        const token = { ...data, id: `token-${tokens.length + 1}`, usedAt: null, revokedAt: null };
        tokens.push(token);
        return token;
      },
      findFirst: async ({ where }) => tokens.find((token) => active(token, where)) || null,
    },
    lead: {
      findUnique: async ({ where }) => leads.get(where.id) || null,
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  return { service: new LeadAccessService(prisma), tokens, leads };
}

test('fallback access token is stored as a hash and can be consumed only once', async () => {
  const f = fixture();

  const issued = await f.service.issue('lead-1');
  const lead = await f.service.consume('lead-1', issued.token);

  assert.notEqual(f.tokens[0].tokenHash, issued.token);
  assert.equal(f.tokens[0].tokenHash.length, 64);
  assert.equal(lead.id, 'lead-1');
  await assert.rejects(f.service.consume('lead-1', issued.token), /Ссылка недействительна или истекла/);
});

test('expired fallback access token is rejected', async () => {
  const f = fixture();
  const issued = await f.service.issue('lead-1');
  f.tokens[0].expiresAt = new Date(Date.now() - 1);

  await assert.rejects(f.service.consume('lead-1', issued.token), /Ссылка недействительна или истекла/);
});

test('altered fallback access token is rejected', async () => {
  const f = fixture();
  const issued = await f.service.issue('lead-1');

  await assert.rejects(f.service.consume('lead-1', `${issued.token}altered`), /Ссылка недействительна или истекла/);
});

test('revoked fallback access token is rejected', async () => {
  const f = fixture();
  const issued = await f.service.issue('lead-1');
  assert.equal(await f.service.revoke('lead-1'), 1);

  await assert.rejects(f.service.consume('lead-1', issued.token), /Ссылка недействительна или истекла/);
});

test('fallback access token cannot open another lead', async () => {
  const f = fixture();
  const issued = await f.service.issue('lead-1');

  await assert.rejects(f.service.consume('lead-2', issued.token), /Ссылка недействительна или истекла/);
  assert.equal((await f.service.consume('lead-1', issued.token)).id, 'lead-1');
});

test('fallback email contains the one-time admin URL without an HMAC query signature', async () => {
  const previous = {
    adminUrl: process.env.ADMIN_URL,
    recipient: process.env.LEADS_EMAIL,
    webhook: process.env.LEADS_EMAIL_WEBHOOK_URL,
    resend: process.env.RESEND_API_KEY,
    fetch: global.fetch,
  };
  process.env.ADMIN_URL = 'https://admin.example.test/';
  process.env.LEADS_EMAIL = 'operator@example.test';
  process.env.LEADS_EMAIL_WEBHOOK_URL = 'https://mail.example.test/fallback';
  delete process.env.RESEND_API_KEY;
  let payload;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true };
  };

  try {
    const access = { issue: async (leadId) => {
      assert.equal(leadId, 'lead-1');
      return { token: 'raw-token', expiresAt: new Date(Date.now() + 86_400_000) };
    } };
    const notifications = new NotificationsService(access);

    await notifications.notifyDeliveryFallback({
      id: 'lead-1',
      phone: '+79000000000',
      city: 'Казань',
    });

    assert.match(payload.text, /https:\/\/admin\.example\.test\/lead-access\/\?lead=lead-1#token=raw-token/);
    assert.doesNotMatch(payload.text, /signature=/);
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [
      ['ADMIN_URL', previous.adminUrl],
      ['LEADS_EMAIL', previous.recipient],
      ['LEADS_EMAIL_WEBHOOK_URL', previous.webhook],
      ['RESEND_API_KEY', previous.resend],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

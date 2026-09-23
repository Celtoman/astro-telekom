const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DadataService } = require('../apps/api/dist/dadata.service.js');

async function withPhoneEnvironment(callback) {
  const names = ['DADATA_TOKEN', 'DADATA_SECRET', 'DADATA_PHONE_CLEAN_API_URL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.DADATA_TOKEN = 'test-token';
    process.env.DADATA_SECRET = 'test-secret';
    process.env.DADATA_PHONE_CLEAN_API_URL = 'https://cleaner.dadata.test/clean/phone';
    await callback();
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('phone clean sends one normalized number with server-side credentials and returns minimal qc evidence', async () => {
  await withPhoneEnvironment(async () => {
    global.fetch = async (url, options) => {
      assert.equal(String(url), process.env.DADATA_PHONE_CLEAN_API_URL);
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.authorization, 'Token test-token');
      assert.equal(options.headers['x-secret'], 'test-secret');
      assert.deepEqual(JSON.parse(options.body), ['79001234567']);
      return new Response(JSON.stringify([{ source: '79001234567', phone: '+7 900 123-45-67', qc: 0, provider: 'not-stored' }]), { status: 200 });
    };
    const result = await new DadataService().cleanPhone('79001234567');
    assert.deepEqual(result, { kind: 'FINAL', qc: 0, normalizedPhone: '79001234567' });
    assert.equal(JSON.stringify(result).includes('provider'), false);
  });
});

test('each defined nonzero qc is final and does not become a technical retry', async () => {
  await withPhoneEnvironment(async () => {
    const service = new DadataService();
    for (const qc of [1, 2, 3, 7]) {
      global.fetch = async () => new Response(JSON.stringify([{ qc, phone: null }]), { status: 200 });
      assert.deepEqual(await service.cleanPhone('79001234567'), { kind: 'FINAL', qc, normalizedPhone: null });
    }
  });
});

test('timeout, HTTP errors and malformed responses are technical failures, never qc=0', async () => {
  await withPhoneEnvironment(async () => {
    const service = new DadataService();
    service.logger = { warn() {} };
    for (const response of [new Response('unavailable', { status: 503 }), new Response('{bad', { status: 200 }), new Response('[]', { status: 200 })]) {
      global.fetch = async () => response;
      assert.equal((await service.cleanPhone('79001234567')).kind, 'TECHNICAL_ERROR');
    }
    global.fetch = async () => { throw new Error('timeout'); };
    assert.equal((await service.cleanPhone('79001234567')).kind, 'TECHNICAL_ERROR');
  });
});

test('phone clean uses the official endpoint by default and does not call it without credentials', async () => {
  await withPhoneEnvironment(async () => {
    delete process.env.DADATA_PHONE_CLEAN_API_URL;
    let endpoint;
    global.fetch = async (url) => { endpoint = String(url); return new Response(JSON.stringify([{ qc: 0, phone: '+7 900 123-45-67' }]), { status: 200 }); };
    assert.equal((await new DadataService().cleanPhone('79001234567')).kind, 'FINAL');
    assert.equal(endpoint, 'https://cleaner.dadata.ru/api/v1/clean/phone');
    delete process.env.DADATA_SECRET;
    endpoint = undefined;
    assert.equal((await new DadataService().cleanPhone('79001234567')).kind, 'TECHNICAL_ERROR');
    assert.equal(endpoint, undefined);
  });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CoverageService } = require('../apps/api/dist/coverage.service.js');
const { AddressChecksController } = require('../apps/api/dist/address-checks.controller.js');

test('empty or invalid address never invokes coverage', async () => {
  const controller = new AddressChecksController({ check: () => assert.fail('coverage invoked') }, {});
  for (const address of ['', '  ', 123, null]) {
    await assert.rejects(controller.check({ address }), /Адрес обязателен/);
  }
});

test('unpublished site never invokes the external API', async () => {
  const controller = new AddressChecksController({ check: () => assert.fail('coverage invoked') }, {
    site: { findUnique: async () => ({ status: 'DRAFT' }) },
  });
  await assert.rejects(controller.check({ address: 'Улица, 1' }), /Сайт недоступен/);
});

test('coverage distinguishes negative, unknown, malformed and network failure responses', async (t) => {
  const oldUrl = process.env.DOMRU_COVERAGE_API_URL;
  const oldKey = process.env.DOMRU_COVERAGE_API_KEY;
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    for (const [key, value] of [['DOMRU_COVERAGE_API_URL', oldUrl], ['DOMRU_COVERAGE_API_KEY', oldKey]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.DOMRU_COVERAGE_API_URL = 'https://coverage.invalid';
  process.env.DOMRU_COVERAGE_API_KEY = 'test';
  const service = new CoverageService();
  service.logger = { error() {} };
  for (const [payload, expected] of [[{ available: false }, 'UNAVAILABLE'], [{ available: true }, 'AVAILABLE'], [{}, 'MANUAL_CHECK'], [null, 'ERROR']]) {
    global.fetch = async (_, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => payload };
    };
    const result = await service.check({ address: 'Улица, 1', citySlug: 'kazan' });
    assert.equal(result.status, expected);
    if (expected === 'ERROR' || expected === 'MANUAL_CHECK') assert.equal(result.available, null);
  }
  global.fetch = async () => { throw new Error('network failure'); };
  const result = await service.check({ address: 'Улица, 1', citySlug: 'kazan' });
  assert.equal(result.status, 'ERROR');
  assert.equal(result.available, null);
});

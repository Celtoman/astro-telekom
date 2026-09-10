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

test('Tarifnik coverage sends the selected DaData suggestion and maps the provider dictionary', async (t) => {
  const names = ['TARIFNIK_ADDRESS_CHECK_API_URL', 'TARIFNIK_API_KEY', 'TARIFNIK_TARGET_PROVIDER_ID'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  process.env.TARIFNIK_ADDRESS_CHECK_API_URL = 'https://dealers-api.tarifnik.test/api/v3.0/address/check';
  process.env.TARIFNIK_API_KEY = 'test-token';
  process.env.TARIFNIK_TARGET_PROVIDER_ID = '8';
  const suggestion = {
    value: 'г Казань, ул Тестовая, д 1',
    unrestricted_value: '420000, Республика Татарстан, г Казань, ул Тестовая, д 1',
    data: { city: 'Казань', house: '1', fias_id: 'test-house-fias' },
  };
  global.fetch = async (url, options) => {
    assert.equal(String(url), process.env.TARIFNIK_ADDRESS_CHECK_API_URL);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body), { suggestion });
    return new Response(JSON.stringify({ 8: 'Дом.ру', 17: 'Альтернативный провайдер' }), { status: 200 });
  };
  const service = new CoverageService();
  service.logger = { error() {} };
  const result = await service.check({ suggestion, citySlug: 'kazan', objectType: 'apartment' });

  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.available, true);
  assert.deepEqual(result.alternatives, [{ id: '17', name: 'Альтернативный провайдер', url: 'https://tarifnik.ru/' }]);
  assert.deepEqual(result.providerResponse, {
    integration: 'tarifnik',
    suggestion,
    providers: { 8: 'Дом.ру', 17: 'Альтернативный провайдер' },
    targetProviderId: '8',
    hasAnyProvider: true,
    hasTargetProvider: true,
  });
});

test('Tarifnik coverage distinguishes no providers, alternatives only and integration errors', async (t) => {
  const names = ['TARIFNIK_ADDRESS_CHECK_API_URL', 'TARIFNIK_API_KEY', 'TARIFNIK_TARGET_PROVIDER_ID'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  process.env.TARIFNIK_ADDRESS_CHECK_API_URL = 'https://dealers-api.tarifnik.test/api/v3.0/address/check';
  process.env.TARIFNIK_API_KEY = 'test-token';
  process.env.TARIFNIK_TARGET_PROVIDER_ID = '8';
  const suggestion = { value: 'Адрес', unrestricted_value: 'Адрес', data: { city: 'Казань' } };
  const service = new CoverageService();
  service.logger = { error() {} };

  global.fetch = async () => new Response(JSON.stringify({ message: 'Провайдеры не найдены' }), { status: 404 });
  const empty = await service.check({ suggestion, citySlug: 'kazan' });
  assert.equal(empty.status, 'UNAVAILABLE');
  assert.deepEqual(empty.providerResponse.providers, {});
  assert.equal(empty.providerResponse.hasAnyProvider, false);

  global.fetch = async () => new Response(JSON.stringify({ 17: 'Альтернативный провайдер' }), { status: 200 });
  const alternatives = await service.check({ suggestion, citySlug: 'kazan' });
  assert.equal(alternatives.status, 'UNAVAILABLE');
  assert.equal(alternatives.providerResponse.hasAnyProvider, true);
  assert.equal(alternatives.providerResponse.hasTargetProvider, false);
  assert.equal(alternatives.alternatives.length, 1);

  for (const response of [
    new Response('{}', { status: 403 }),
    new Response('[]', { status: 200 }),
    new Response('{"8":42}', { status: 200 }),
  ]) {
    global.fetch = async () => response;
    const failed = await service.check({ suggestion, citySlug: 'kazan' });
    assert.equal(failed.status, 'ERROR');
    assert.equal(failed.available, null);
  }
});

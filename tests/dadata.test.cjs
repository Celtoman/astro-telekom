const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DadataService } = require('../apps/api/dist/dadata.service.js');
const { AddressSuggestionsController } = require('../apps/api/dist/address-suggestions.controller.js');

const rawSuggestion = {
  value: 'г Казань, ул Тестовая, д 1',
  unrestricted_value: '420000, Республика Татарстан, г Казань, ул Тестовая, д 1',
  data: { city: 'Казань', house: '1' },
};

async function withEnvironment(callback) {
  const names = ['DADATA_TOKEN', 'DADATA_SECRET', 'DADATA_SUGGEST_API_URL', 'DADATA_CLEAN_API_URL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.DADATA_TOKEN = 'test-token';
    process.env.DADATA_SECRET = 'test-secret';
    process.env.DADATA_SUGGEST_API_URL = 'https://suggestions.dadata.test/suggest/address';
    process.env.DADATA_CLEAN_API_URL = 'https://cleaner.dadata.test/clean/address';
    await callback();
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('DaData suggestions stay server-side and allow addresses from any city', async () => {
  await withEnvironment(async () => {
    global.fetch = async (url, options) => {
      assert.equal(String(url), process.env.DADATA_SUGGEST_API_URL);
      assert.equal(options.headers.authorization, 'Token test-token');
      assert.equal(options.headers['x-secret'], undefined);
      assert.deepEqual(JSON.parse(options.body), {
        query: 'Бондаренко 28',
        count: 10,
      });
      return new Response(JSON.stringify({ suggestions: [rawSuggestion, { value: '', data: {} }] }), { status: 200 });
    };
    const service = new DadataService();
    service.logger = { error() {} };
    assert.deepEqual(await service.suggest('Бондаренко 28'), [rawSuggestion]);
  });
});

test('DaData suggestion failure is not disguised as an empty successful result', async () => {
  await withEnvironment(async () => {
    global.fetch = async () => new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': '3' },
    });
    const service = new DadataService();
    service.logger = { error() {} };
    await assert.rejects(
      service.suggest('Казань Бондаренко'),
      (error) => error?.getStatus?.() === 503 && /временно недоступны/i.test(error.message),
    );
  });
});

test('DaData clean converts the normalized response to the exact Tarifnik suggestion envelope', async () => {
  await withEnvironment(async () => {
    const cleaned = { source: rawSuggestion.value, result: rawSuggestion.value, city: 'Казань', house: '1', qc: 0 };
    global.fetch = async (url, options) => {
      assert.equal(String(url), process.env.DADATA_CLEAN_API_URL);
      assert.equal(options.headers.authorization, 'Token test-token');
      assert.equal(options.headers['x-secret'], 'test-secret');
      assert.deepEqual(JSON.parse(options.body), [rawSuggestion.value]);
      return new Response(JSON.stringify([cleaned]), { status: 200 });
    };
    const service = new DadataService();
    service.logger = { error() {} };
    assert.deepEqual(await service.clean(rawSuggestion), {
      value: rawSuggestion.value,
      unrestricted_value: rawSuggestion.value,
      data: cleaned,
    });
  });
});

test('address suggestions validate page context but do not pass its city as a DaData restriction', async () => {
  let calls = 0;
  const dadata = { suggest: async (...args) => {
    calls += 1;
    assert.deepEqual(args, ['Бондаренко']);
    return [rawSuggestion];
  } };
  const unpublished = new AddressSuggestionsController(dadata, {
    site: { findUnique: async () => ({ id: 'site', status: 'DRAFT' }) },
  });
  await assert.rejects(unpublished.suggest({ query: 'Бондаренко', citySlug: 'kazan' }), /Сайт недоступен/);
  assert.equal(calls, 0);

  const published = new AddressSuggestionsController(dadata, {
    site: { findUnique: async () => ({ id: 'site', status: 'PUBLISHED' }) },
    city: { findFirst: async () => ({ id: 'city', name: 'Казань' }) },
  });
  assert.deepEqual(await published.suggest({ query: 'Бондаренко', citySlug: 'kazan' }), { suggestions: [rawSuggestion] });
  assert.equal(calls, 1);
});

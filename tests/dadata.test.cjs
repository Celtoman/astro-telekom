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
  const names = ['DADATA_TOKEN', 'DADATA_SECRET', 'DADATA_SUGGEST_API_URL', 'DADATA_CLEAN_API_URL', 'DADATA_IPLOCATE_API_URL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.DADATA_TOKEN = 'test-token';
    process.env.DADATA_SECRET = 'test-secret';
    process.env.DADATA_SUGGEST_API_URL = 'https://suggestions.dadata.test/suggest/address';
    process.env.DADATA_CLEAN_API_URL = 'https://cleaner.dadata.test/clean/address';
    process.env.DADATA_IPLOCATE_API_URL = 'https://suggestions.dadata.test/iplocate/address';
    await callback();
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('DaData suggestions use only a soft city boost and return at most five global results', async () => {
  await withEnvironment(async () => {
    global.fetch = async (url, options) => {
      assert.equal(String(url), process.env.DADATA_SUGGEST_API_URL);
      assert.equal(options.headers.authorization, 'Token test-token');
      assert.equal(options.headers['x-secret'], undefined);
      assert.deepEqual(JSON.parse(options.body), {
        query: 'Бондаренко 28',
        count: 5,
        locations_boost: [{ kladr_id: '1600000100000' }],
      });
      assert.equal('locations' in JSON.parse(options.body), false);
      return new Response(JSON.stringify({ suggestions: Array.from({ length: 7 }, () => rawSuggestion) }), { status: 200 });
    };
    const service = new DadataService();
    service.logger = { error() {} };
    const suggestions = await service.suggest('Бондаренко 28', { kladrId: '1600000100000' });
    assert.equal(suggestions.length, 5);
  });
});

test('DaData IPLocate returns a city KLADR hint without using the clean secret', async () => {
  await withEnvironment(async () => {
    global.fetch = async (url, options) => {
      assert.equal(String(url), process.env.DADATA_IPLOCATE_API_URL);
      assert.equal(options.headers.authorization, 'Token test-token');
      assert.equal(options.headers['x-secret'], undefined);
      assert.deepEqual(JSON.parse(options.body), { ip: '203.0.113.15' });
      return new Response(JSON.stringify({
        location: {
          value: 'г Набережные Челны',
          data: { city: 'Набережные Челны', city_kladr_id: '1600000200000' },
        },
      }), { status: 200 });
    };
    const service = new DadataService();
    service.logger = { warn() {} };
    assert.deepEqual(await service.locate('203.0.113.15'), {
      city: 'Набережные Челны',
      kladrId: '1600000200000',
    });
  });
});

test('DaData IPLocate failure is an optional null result', async () => {
  await withEnvironment(async () => {
    global.fetch = async () => new Response('unavailable', { status: 503 });
    const service = new DadataService();
    service.logger = { warn() {} };
    assert.equal(await service.locate('203.0.113.15'), null);
  });
});

test('DaData IPLocate uses the official endpoint when no override is configured', async () => {
  await withEnvironment(async () => {
    delete process.env.DADATA_IPLOCATE_API_URL;
    let calls = 0;
    global.fetch = async (url) => {
      calls += 1;
      assert.equal(String(url), 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/iplocate/address');
      return new Response(JSON.stringify({ location: null }), { status: 200 });
    };
    const service = new DadataService();
    service.logger = { warn() {} };
    assert.equal(await service.locate('203.0.113.15'), null);
    assert.equal(calls, 1);
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

test('address suggestions resolve IP once and persist only the soft KLADR hint in a cookie', async () => {
  let calls = 0;
  const cookies = [];
  const dadata = {
    locate: async (ip) => {
      assert.equal(ip, '203.0.113.15');
      return { city: 'Набережные Челны', kladrId: '1600000200000' };
    },
    suggest: async (...args) => {
      calls += 1;
      assert.deepEqual(args, ['Челны Тукая 49', { kladrId: '1600000200000' }]);
      return [rawSuggestion];
    },
  };
  const unpublished = new AddressSuggestionsController(dadata, {
    site: { findUnique: async () => ({ id: 'site', status: 'DRAFT' }) },
  });
  await assert.rejects(
    unpublished.suggest({ query: 'Челны Тукая 49', citySlug: 'kazan' }, { ip: '203.0.113.15', cookies: {} }, { setCookie() {} }),
    /Сайт недоступен/,
  );
  assert.equal(calls, 0);

  const published = new AddressSuggestionsController(dadata, {
    site: { findUnique: async () => ({ id: 'site', status: 'PUBLISHED' }) },
    city: { findFirst: async () => ({ id: 'city', name: 'Казань', region: { name: 'Республика Татарстан' } }) },
  });
  const request = { ip: '203.0.113.15', protocol: 'https', cookies: {} };
  const reply = { setCookie: (...args) => cookies.push(args) };
  assert.deepEqual(await published.suggest({ query: 'Челны Тукая 49', citySlug: 'kazan' }, request, reply), { suggestions: [rawSuggestion] });
  assert.deepEqual(cookies, [[
    'address_city_kladr',
    '1600000200000',
    { httpOnly: true, maxAge: 86_400, path: '/', sameSite: 'lax', secure: true },
  ]]);
  assert.equal(calls, 1);
});

test('address suggestions reuse the location cookie and fall back to page context after a null result', async () => {
  let locateCalls = 0;
  const boosts = [];
  const dadata = {
    locate: async () => {
      locateCalls += 1;
      return null;
    },
    suggest: async (_query, boost) => {
      boosts.push(boost);
      return [rawSuggestion];
    },
  };
  const published = new AddressSuggestionsController(dadata, {
    site: { findUnique: async () => ({ id: 'site', status: 'PUBLISHED' }) },
    city: { findFirst: async () => ({ id: 'city', name: 'Казань', region: { name: 'Республика Татарстан' } }) },
  });
  const cookies = [];
  await published.suggest(
    { query: 'Бондаренко', citySlug: 'kazan' },
    { ip: '203.0.113.15', protocol: 'http', cookies: {} },
    { setCookie: (...args) => cookies.push(args) },
  );
  await published.suggest(
    { query: 'Бондаренко 28', citySlug: 'kazan' },
    { ip: '203.0.113.15', protocol: 'http', cookies: { address_city_kladr: 'none' } },
    { setCookie: () => assert.fail('cached null hint must not be rewritten') },
  );
  assert.equal(locateCalls, 1);
  assert.deepEqual(boosts, [
    { city: 'Казань', region: 'Республика Татарстан' },
    { city: 'Казань', region: 'Республика Татарстан' },
  ]);
  assert.equal(cookies[0][1], 'none');
});

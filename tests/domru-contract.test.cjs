const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DomruContractService } = require('../apps/api/dist/domru-contract.service.js');

const contractVariables = [
  'DOMRU_CONTRACT_API_URL',
  'DOMRU_CONTRACT_CITY',
  'DOMRU_CONTRACT_ORIGIN',
  'DOMRU_CONTRACT_PROVIDER_ID',
  'DOMRU_CONTRACT_REFERER',
];

async function withEnvironment(values, callback) {
  const previous = Object.fromEntries(contractVariables.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    for (const name of contractVariables) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    await callback();
  } finally {
    global.fetch = originalFetch;
    for (const name of contractVariables) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

const kazanProfile = {
  DOMRU_CONTRACT_API_URL: 'https://web-api.dom.ru/api-profile/v1/unauth/contract-asterisked',
};

const kazanLocation = { city: 'Казань', region: 'Татарстан' };
const chelnyLocation = { city: 'Набережные Челны', region: 'Татарстан' };

test('Dom.ru contract check uses the city profile from the working bot without an API key', async () => {
  await withEnvironment(kazanProfile, async () => {
    let request;
    global.fetch = async (input, options) => {
      request = { input: String(input), options };
      return new Response(JSON.stringify({ contacts: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const service = new DomruContractService();
    service.logger = { error() {} };
    const result = await service.check('8 (927) 000-00-00', kazanLocation);

    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.active, false);
    const url = new URL(request.input);
    assert.equal(url.searchParams.get('contact'), '79270000000');
    assert.equal(url.searchParams.get('isActive'), '1');
    assert.equal(url.searchParams.has('city'), false);
    assert.equal(request.options.headers.origin, 'https://kazan.dom.ru');
    assert.equal(request.options.headers.providerid, '5');
    assert.equal(request.options.headers.referer, 'https://kazan.dom.ru/');
    assert.equal(request.options.headers.authorization, undefined);
    assert.match(request.options.headers['user-agent'], /Mozilla\/5\.0/u);
    assert.ok(request.options.signal instanceof AbortSignal);
  });
});

test('Dom.ru contract check selects the Naberezhnye Chelny profile from normalized address data', async () => {
  await withEnvironment(kazanProfile, async () => {
    let request;
    global.fetch = async (input, options) => {
      request = { input: String(input), options };
      return new Response(JSON.stringify({ contacts: [{ contact: 'masked' }] }), { status: 200 });
    };
    const service = new DomruContractService();
    service.logger = { error() {} };

    const result = await service.check('79274985704', chelnyLocation);

    assert.equal(result.status, 'ACTIVE');
    assert.equal(request.options.headers.origin, 'https://chelny.dom.ru');
    assert.equal(request.options.headers.providerid, '35');
    assert.equal(request.options.headers.referer, 'https://chelny.dom.ru/');
  });
});

test('Dom.ru contract check classifies a non-empty contacts array as an active subscriber', async () => {
  await withEnvironment(kazanProfile, async () => {
    global.fetch = async () => new Response(JSON.stringify({ contacts: [{ contact: 'masked' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const service = new DomruContractService();
    service.logger = { error() {} };
    const result = await service.check('79270000000', kazanLocation);
    assert.equal(result.status, 'ACTIVE');
    assert.equal(result.active, true);
  });
});

test('Dom.ru contract check rejects HTML and ambiguous JSON instead of reporting no subscriber', async () => {
  await withEnvironment(kazanProfile, async () => {
    const service = new DomruContractService();
    service.logger = { error() {} };
    for (const body of ['<!DOCTYPE html><html></html>', '{}', '{"contacts":"unknown"}', 'not-json']) {
      global.fetch = async () => new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      const result = await service.check('79270000000', kazanLocation);
      assert.equal(result.status, 'ERROR');
      assert.equal(result.active, null);
    }
  });
});

test('Dom.ru contract check refuses a missing endpoint or unknown location without calling fetch', async () => {
  for (const [configuration, location] of [
    [{}, kazanLocation],
    [kazanProfile, { city: 'Неизвестный город', region: 'Неизвестный регион' }],
  ]) {
    await withEnvironment(configuration, async () => {
      global.fetch = async () => assert.fail('fetch must not be called');
      const result = await new DomruContractService().check('79270000000', location);
      assert.equal(result.status, 'NOT_CONFIGURED');
      assert.equal(result.active, null);
    });
  }
});

test('Dom.ru contract check rejects an invalid phone without calling the external API', async () => {
  await withEnvironment(kazanProfile, async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error('fetch must not be called');
    };
    const service = new DomruContractService();
    service.logger = { error() {} };
    for (const phone of ['123', '78001234567']) {
      const result = await service.check(phone, kazanLocation);
      assert.equal(result.status, 'ERROR');
      assert.equal(result.active, null);
    }
    assert.equal(fetchCalls, 0);
  });
});

test('Dom.ru contract check converts HTTP and network failures to an explicit error', async () => {
  await withEnvironment(kazanProfile, async () => {
    const service = new DomruContractService();
    service.logger = { error() {} };
    global.fetch = async () => new Response('blocked', { status: 403 });
    assert.equal((await service.check('79270000000', kazanLocation)).status, 'ERROR');
    global.fetch = async () => { throw new Error('network failure'); };
    assert.equal((await service.check('79270000000', kazanLocation)).status, 'ERROR');
  });
});

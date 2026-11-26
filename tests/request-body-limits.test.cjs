const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Controller, Module, Post, UseGuards } = require('../apps/api/node_modules/@nestjs/common');
const { NestFactory } = require('../apps/api/node_modules/@nestjs/core');
const { FastifyAdapter } = require('../apps/api/node_modules/@nestjs/platform-fastify');
const fastifyCookie = require('../apps/api/node_modules/@fastify/cookie');
const { AdminTokenGuard } = require('../apps/api/dist/admin-token.guard.js');
const { AuthService } = require('../apps/api/dist/auth.service.js');
const { PUBLIC_BODY_LIMIT, configureRequestBodyLimits } = require('../apps/api/dist/request-body-limits.js');

test('Fastify bounds public JSON and authenticates large administrative bodies before parsing', async () => {
  let sessions = 0;
  class ControllerFixture {
    publicForm() { return { accepted: true }; }
    lead() { return { accepted: true }; }
    import() { return { accepted: true }; }
  }
  Controller()(ControllerFixture);
  const prototype = ControllerFixture.prototype;
  for (const [handler, route] of Object.entries({
    publicForm: 'address-checks', lead: 'leads', import: 'admin/tariffs/import/validate',
  })) {
    Post(route)(prototype, handler, Object.getOwnPropertyDescriptor(prototype, handler));
  }
  UseGuards(AdminTokenGuard)(prototype, 'import', Object.getOwnPropertyDescriptor(prototype, 'import'));

  class Fixture {}
  Module({
    controllers: [ControllerFixture],
    providers: [AdminTokenGuard, {
      provide: AuthService,
      useValue: { getUserByToken: async token => {
        sessions++;
        return token === 'fixture-session' ? { id: 'admin', email: 'admin@example.test' } : null;
      } },
    }],
  })(Fixture);
  const adapter = new FastifyAdapter({ bodyLimit: PUBLIC_BODY_LIMIT });
  const app = await NestFactory.create(Fixture, adapter, { logger: false });
  try {
    await app.register(fastifyCookie);
    configureRequestBodyLimits(adapter, app.get(AdminTokenGuard));
    app.setGlobalPrefix('api/v1');
    await app.init();
    const write = (url, payload, headers = {}) => adapter.getInstance().inject({
      url: '/api/v1/' + url,
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      payload,
    });
    const body = bytes => JSON.stringify({ fixture: 'a'.repeat(bytes) });
    assert.equal((await write('address-checks', body(512))).statusCode, 201);
    assert.equal((await write('address-checks', body(16 * 1024))).statusCode, 413);
    assert.equal((await write('leads', body(128 * 1024))).statusCode, 201);
    assert.equal((await write('leads', body(256 * 1024))).statusCode, 413);
    const path = 'admin/tariffs/import/validate';
    assert.equal((await write(path, 'malformed json')).statusCode, 401);
    assert.equal((await write(path, body(128 * 1024), { cookie: 'admin_session=fixture-session' })).statusCode, 201);
    assert.equal(sessions, 1, 'Nest guard reuses the session checked before parsing');
    assert.equal((await write(path, 'malformed json', { authorization: 'Bearer fixture-session' })).statusCode, 400);

    await app.listen(0, '127.0.0.1');
    async function* chunks() {
      yield '{"fixture":"';
      yield 'a'.repeat(8 * 1024);
      yield 'a'.repeat(8 * 1024);
      yield '"}';
    }
    const streamed = await fetch(`${await app.getUrl()}/api/v1/address-checks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: chunks(),
      duplex: 'half',
    });
    assert.equal(streamed.status, 413);
    await streamed.text();
  } finally {
    await app.close();
  }
});

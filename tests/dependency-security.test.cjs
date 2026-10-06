const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { connect } = require('node:net');
const apiRequire = createRequire(resolve(__dirname, '../apps/api/package.json'));
const rootRequire = createRequire(resolve(__dirname, '../package.json'));

function rawRequest(port, target) {
  return new Promise((resolveResponse, reject) => {
    const socket = connect(port, '127.0.0.1');
    let response = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('HTTP probe timed out')));
    socket.on('connect', () => socket.end(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
    socket.on('data', chunk => { response += chunk; });
    socket.on('error', reject);
    socket.on('end', () => resolveResponse(response));
  });
}

test('Fastify adapter preserves path middleware for origin and absolute HTTP request targets', async () => {
  const { NestFactory } = apiRequire('@nestjs/core');
  const { FastifyAdapter } = apiRequire('@nestjs/platform-fastify');
  const { Controller, Get, Module, RequestMethod } = apiRequire('@nestjs/common');
  class ProtectedController { get() { return 'protected-handler-must-not-run'; } }
  Get()(ProtectedController.prototype, 'get', Object.getOwnPropertyDescriptor(ProtectedController.prototype, 'get'));
  Controller('protected')(ProtectedController);
  class ProbeModule {
    configure(consumer) {
      consumer.apply((_req, res) => { res.statusCode = 403; res.end('middleware-blocked'); })
        .forRoutes({ path: 'protected', method: RequestMethod.GET });
    }
  }
  Module({ controllers: [ProtectedController] })(ProbeModule);
  const app = await NestFactory.create(ProbeModule, new FastifyAdapter(), { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const port = app.getHttpServer().address().port;
    for (const target of ['/protected', `http://127.0.0.1:${port}/protected`]) {
      const response = await rawRequest(port, target);
      assert.match(response, /^HTTP\/1\.1 403/, target);
      assert.match(response, /middleware-blocked/);
      assert.doesNotMatch(response, /protected-handler-must-not-run/);
    }
  } finally { await app.close(); }
});

test('Prisma config merge preserves supported plain config and handles recursive graphs without stack exhaustion', () => {
  const prismaRequire = createRequire(rootRequire.resolve('prisma/config'));
  const configRequire = createRequire(prismaRequire.resolve('@prisma/config'));
  const { deepmerge } = configRequire('deepmerge-ts');
  const base = { migrations: { path: 'prisma/migrations' }, datasource: { url: 'postgresql://fixture:fixture@localhost/fixture' } };
  assert.deepEqual(deepmerge(base, { schema: 'prisma/schema.prisma' }), { ...base, schema: 'prisma/schema.prisma' });
  const left = {}, right = {}; left.self = left; right.self = right;
  try { deepmerge(left, right); }
  catch (error) { assert.ok(!(error instanceof RangeError), 'recursive input must not exhaust the Node stack'); }
  const { defineConfig } = prismaRequire('prisma/config');
  const config = defineConfig({ ...base, schema: 'prisma/schema.prisma' });
  assert.equal(config.schema, 'prisma/schema.prisma');
  assert.equal(config.migrations.path, 'prisma/migrations');
  assert.equal(config.datasource.url, base.datasource.url);
});

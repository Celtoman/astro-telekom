const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { Module, ValidationPipe } = require('../apps/api/node_modules/@nestjs/common');
const { NestFactory } = require('../apps/api/node_modules/@nestjs/core');
const { FastifyAdapter } = require('../apps/api/node_modules/@nestjs/platform-fastify');
const { CodeReleaseController } = require('../apps/api/dist/code-release.controller.js');
const { CodeReleaseService } = require('../apps/api/dist/code-release.service.js');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const { AdminTokenGuard } = require('../apps/api/dist/admin-token.guard.js');
const { AuthService } = require('../apps/api/dist/auth.service.js');

test('machine-only CODE bridge binds the serving snapshot and live nonce, preserves uncertain results and validates HTTP input', async () => {
  const keys = ['REBUILD_PROVIDER', 'STATIC_PUBLICATION_URL', 'ADMIN_API_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = 's'.repeat(32); let posts = 0; let wrongSite = false; let wrongSnapshot = false; let unavailable = false;
  let resultStatus = 200; let received;
  const identity = { publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7, catalogDigest: 'a'.repeat(64) };
  const renderer = { rendererId: 'b'.repeat(64), instanceId: '12345678-1234-1234-1234-123456789abc' };
  const controller = createServer((request, response) => {
    assert.equal(request.headers['x-admin-token'], token);
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (unavailable) { send(503, {}); return; }
    if (request.url === '/active') { send(200, { ...identity, ...(wrongSite ? { siteSlug: 'foreign-site' } : {}) }); return; }
    if (request.url === '/renderer') { send(200, renderer); return; }
    if (request.url === '/release-code') {
      let body = ''; request.on('data', data => body += data); request.on('end', () => {
        posts++; received = JSON.parse(body); send(resultStatus, { status: resultStatus === 200 ? 'SUCCEEDED' : 'UNCERTAIN', publicationId: 'pub-a' });
      }); return;
    }
    send(404, {});
  });
  let application;
  try {
    await new Promise(done => controller.listen(0, '127.0.0.1', done));
    process.env.REBUILD_PROVIDER = 'static'; process.env.ADMIN_API_TOKEN = token;
    process.env.STATIC_PUBLICATION_URL = `http://127.0.0.1:${controller.address().port}`;
    class Fixture {}
    Module({ controllers: [CodeReleaseController], providers: [CodeReleaseService, AdminTokenGuard,
      { provide: AuthService, useValue: { getUserByToken: async () => ({ id: 'admin' }) } },
      { provide: PublicationWorkflowService, useValue: { getExactBuildSnapshot: async (slug, publicationId) => {
        assert.equal(slug, 'domru-site'); assert.equal(publicationId, 'pub-a');
        return { ...identity, ...(wrongSnapshot ? { catalogDigest: 'c'.repeat(64) } : {}) };
      } } }] })(Fixture);
    application = await NestFactory.create(Fixture, new FastifyAdapter(), { logger: false });
    application.setGlobalPrefix('api/v1'); application.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await application.listen(0, '127.0.0.1');
    const url = `${await application.getUrl()}/api/v1/internal/site-publications/domru-site/release-code`;
    const input = { deploymentId: 'deployment-1', expectedCommit: 'd'.repeat(40) };
    const request = (body = input, headers = { 'x-admin-token': token }) => fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await request(input, {})).status, 401);
    assert.equal((await request(input, { authorization: 'Bearer valid-admin-session' })).status, 401);
    assert.equal((await request({ ...input, command: 'arbitrary' })).status, 400);
    assert.equal((await request({ ...input, expectedCommit: 'master' })).status, 400);
    assert.equal(posts, 0);
    const released = await request(); assert.equal(released.status, 200); assert.equal((await released.json()).publicationId, 'pub-a');
    assert.deepEqual(received, { ...input, ...renderer }); assert.equal(posts, 1);
    resultStatus = 202; assert.equal((await request()).status, 202); assert.equal(posts, 2);
    wrongSite = true; assert.equal((await request()).status, 409); wrongSite = false;
    wrongSnapshot = true; assert.equal((await request()).status, 409); wrongSnapshot = false;
    unavailable = true; assert.equal((await request()).status, 503);
    assert.equal(posts, 2, 'Invalid/unavailable serving must not initiate CODE');
  } finally {
    await application?.close(); controller.closeAllConnections(); await new Promise(done => controller.close(done));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

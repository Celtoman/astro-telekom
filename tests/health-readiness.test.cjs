const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { HealthController } = require('../apps/api/dist/health.controller.js');
const { HealthService } = require('../apps/api/dist/health.service.js');

const repositoryRoot = join(__dirname, '..');

test('liveness is process-only while health and readiness require dependencies', async () => {
  const calls = [];
  const controller = new HealthController({
    readiness: async () => {
      calls.push('readiness');
      return { status: 'ok', service: 'api', checks: { database: 'up', redis: 'up' } };
    },
  });

  assert.deepEqual(controller.getLiveness(), { status: 'ok', service: 'api' });
  assert.deepEqual(await controller.getHealth(), { status: 'ok', service: 'api', checks: { database: 'up', redis: 'up' } });
  assert.deepEqual(await controller.getReadiness(), { status: 'ok', service: 'api', checks: { database: 'up', redis: 'up' } });
  assert.deepEqual(calls, ['readiness', 'readiness']);

  const unavailable = new HealthController({
    readiness: async () => ({ status: 'error', service: 'api', checks: { database: 'down', redis: 'up' } }),
  });
  await assert.rejects(unavailable.getReadiness(), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.deepEqual(error.getResponse(), { status: 'error', service: 'api', checks: { database: 'down', redis: 'up' } });
    return true;
  });
});

test('readiness returns only sanitized dependency states', async () => {
  const service = new HealthService({ $queryRaw: async () => [{ ready: 1 }] });
  service.pingRedis = async () => 'PONG';
  assert.deepEqual(await service.readiness(), {
    status: 'ok',
    service: 'api',
    checks: { database: 'up', redis: 'up' },
  });

  service.pingRedis = async () => { throw new Error('redis://secret-host:6379 refused'); };
  assert.deepEqual(await service.readiness(), {
    status: 'error',
    service: 'api',
    checks: { database: 'up', redis: 'down' },
  });
});

test('production Compose applies migrations before starting API and probes readiness', () => {
  const compose = readFileSync(join(repositoryRoot, 'docker-compose.prod.yml'), 'utf8');
  assert.match(compose, /^  migrate:\r?$/m);
  assert.match(compose, /migrate:\s+condition: service_completed_successfully/);
  assert.match(compose, /fetch\('http:\/\/localhost:3000\/api\/v1\/health\/ready'\)/);
  assert.match(compose, /node_modules\/prisma\/build\/index\.js["']?,\s*["']migrate["']?,\s*["']deploy/);
});

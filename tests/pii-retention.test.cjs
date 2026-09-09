const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PiiRetentionService } = require('../apps/api/dist/pii-retention.service.js');

async function withRetentionEnvironment(values, callback) {
  const names = ['PII_RETENTION_DAYS', 'PII_RETENTION_BATCH_SIZE'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    await callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('PII purge refuses to run without an explicit valid retention policy', async () => {
  const service = new PiiRetentionService({});
  await withRetentionEnvironment({}, async () => {
    await assert.rejects(service.purge(new Date('2026-09-09T00:00:00.000Z')), (error) => error.getStatus() === 503);
  });
  await withRetentionEnvironment({ PII_RETENTION_DAYS: '0' }, async () => {
    await assert.rejects(service.purge(new Date('2026-09-09T00:00:00.000Z')), (error) => error.getStatus() === 503);
  });
});

test('PII purge deletes one bounded transaction and preserves relational integrity', async () => {
  const calls = [];
  const tx = {
    lead: {
      findMany: async (args) => { calls.push(['findMany', args]); return [{ id: 'old-1' }, { id: 'old-2' }]; },
      updateMany: async (args) => { calls.push(['updateMany', args]); return { count: 1 }; },
      deleteMany: async (args) => { calls.push(['deleteMany', args]); return { count: 2 }; },
    },
    leadAccessToken: {
      deleteMany: async (args) => { calls.push(['deleteTokens', args]); return { count: 3 }; },
    },
    addressCheck: {
      deleteMany: async (args) => { calls.push(['deleteChecks', args]); return { count: 2 }; },
    },
  };
  const prisma = {
    $transaction: async (callback, options) => {
      calls.push(['transaction', options]);
      return callback(tx);
    },
  };

  await withRetentionEnvironment({ PII_RETENTION_DAYS: '30', PII_RETENTION_BATCH_SIZE: '2' }, async () => {
    const result = await new PiiRetentionService(prisma).purge(new Date('2026-09-09T00:00:00.000Z'));
    assert.equal(result.cutoff, '2026-08-10T00:00:00.000Z');
    assert.equal(result.complete, false);
    assert.deepEqual(result.deleted, { leads: 2, addressChecks: 2, accessTokens: 3 });
    assert.equal(result.detachedDuplicates, 1);
    assert.deepEqual(calls[0], ['transaction', { isolationLevel: 'Serializable', timeout: 60_000 }]);
    assert.deepEqual(calls[1][1].take, 2);
    assert.deepEqual(calls[2][1].data, { duplicateOfId: null, duplicateReason: null });
    assert.deepEqual(calls[3][1].where, { expiresAt: { lt: new Date('2026-09-09T00:00:00.000Z') } });
  });
});

test('PII retention is worker-only, scheduled daily and part of release readiness', () => {
  const controller = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'pii-retention.controller.ts'), 'utf8');
  const moduleSource = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'module.ts'), 'utf8');
  const worker = readFileSync(join(__dirname, '..', 'services', 'worker', 'src', 'index.mjs'), 'utf8');
  const readiness = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'release-readiness.service.ts'), 'utf8');
  assert.match(controller, /@Controller\('internal\/pii-retention'\)/);
  assert.match(controller, /@UseGuards\(AdminTokenGuard\)/);
  assert.match(controller, /@HttpCode\(200\)/);
  assert.match(moduleSource, /PiiRetentionController/);
  assert.match(worker, /upsertJobScheduler\(\s*'pii-retention-daily'/);
  assert.match(worker, /Number\.isSafeInteger\(piiRetentionDays\)/);
  assert.match(worker, /\/internal\/pii-retention/);
  assert.match(readiness, /PII_RETENTION_DAYS/);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { TariffPurgeService } = require('../apps/api/dist/tariff-purge.service.js');

function fixture() {
  const tariff = {
    id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1',
    city: { name: 'Казань', slug: 'kazan', siteId: 'site-1' },
    name: 'Архивный', slug: 'archive', status: 'ARCHIVED', availability: 'ARCHIVED',
    archivedAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    archivedByImportRunId: null,
  };
  const counts = { leads: 0n, redirects: 0n, publications: 0n, validations: 0n, imports: 0n };
  const calls = { deleted: [], revisions: [], locked: 0 };
  const transaction = {
    site: { findUnique: async () => ({ id: 'site-1' }) },
    tariff: {
      findMany: async (query) => query.include ? [tariff] : [tariff],
      count: async () => 1,
      deleteMany: async (query) => { calls.deleted.push(query); return { count: 1 }; },
    },
    $queryRaw: async (strings) => {
      if (strings.join('?').includes('FOR UPDATE')) { calls.locked += 1; return [{ id: 'site-1' }]; }
      return [{ ...counts }];
    },
  };
  const prisma = { $transaction: async (callback) => callback(transaction) };
  const publications = {
    recordWorkingRevision: async (_tx, input) => {
      calls.revisions.push(input);
      return { siteRevision: 9 };
    },
  };
  return { service: new TariffPurgeService(prisma, publications), counts, calls, tariff };
}

test('purge preview explains dependent history and never offers a linked tariff', async () => {
  const { service, counts } = fixture();
  counts.leads = 2n;
  counts.redirects = 1n;
  counts.publications = 1n;
  counts.validations = 1n;
  counts.imports = 1n;
  const preview = await service.preview('site-1');
  assert.equal(preview.total, 1);
  assert.equal(preview.items[0].path, '/kazan/archive');
  assert.equal(preview.items[0].blockers.length, 5);
  assert.match(preview.items[0].blockers.join(' '), /заявками: 2/);
  assert.match(preview.fingerprint, /^[a-f0-9]{64}$/);
});

test('purge requires exact confirmation and rechecks dependencies before deletion', async () => {
  const { service, counts, calls } = fixture();
  const preview = await service.preview('site-1');
  const input = { siteId: 'site-1', offset: 0, ids: ['tariff-1'], fingerprint: preview.fingerprint, confirm: true };
  await assert.rejects(() => service.purge({ ...input, confirm: false }), /Подтвердите/);
  counts.leads = 1n;
  await assert.rejects(() => service.purge(input), /Предпросмотр очистки устарел/);
  assert.equal(calls.deleted.length, 0);
});

test('purge deletes only the confirmed archived batch and writes a purge revision', async () => {
  const { service, calls } = fixture();
  const preview = await service.preview('site-1');
  const input = { siteId: 'site-1', offset: 0, ids: ['tariff-1'], fingerprint: preview.fingerprint, confirm: true };
  await assert.rejects(() => service.purge({ ...input, ids: ['another-id'] }), /Предпросмотр очистки устарел/);
  const result = await service.purge(input, 'admin-1');
  assert.deepEqual(result, { removed: 1, workingRevision: 9 });
  assert.equal(calls.deleted.length, 1);
  assert.equal(calls.deleted[0].where.status, 'ARCHIVED');
  assert.equal(calls.deleted[0].where.availability, 'ARCHIVED');
  assert.ok(calls.locked >= 2);
  assert.equal(calls.revisions.length, 1);
  assert.equal(calls.revisions[0].action, 'PURGE');
  assert.equal(calls.revisions[0].entityId, 'tariff-1');
});

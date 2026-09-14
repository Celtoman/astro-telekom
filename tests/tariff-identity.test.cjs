const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');

const publicationStub = {
  recordWorkingRevision: async () => ({ siteRevision: 1 }),
  captureWorkingPublication: async (_transaction, input) => ({ id: `publication-${input.siteRevision}`, siteRevision: input.siteRevision, status: 'PENDING' }),
};

test('manual tariff edit keeps the deterministic identity key aligned with import business key', async () => {
  let saved;
  const updatedAt = new Date('2026-09-10T00:00:00Z');
  const tx = {
    city: { findUnique: async () => ({ id: 'city', slug: 'kazan', siteId: 'site', site: { providerId: 'provider' } }) },
    tariff: {
      findUnique: async () => ({ id: 'tariff', providerId: 'provider', cityId: 'city', name: 'Старый тариф', slug: 'stable-slug', serviceType: 'INTERNET', status: 'DRAFT', updatedAt }),
      update: async ({ data }) => { saved = data; return { id: 'tariff', provider: { id: 'provider', name: 'Дом.ру' }, city: { id: 'city', name: 'Казань', slug: 'kazan', siteId: 'site' }, cityId: 'city', slug: 'stable-slug', ...data }; },
    },
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const controller = new AdminTariffsController(prisma, undefined, publicationStub);
  await controller.update('tariff', { expectedUpdatedAt: updatedAt.toISOString(), name: 'Новый тариф', serviceType: 'INTERNET_TV' });
  assert.equal(saved.identityKey, 'city:stable-slug:internet_tv');
});

test('legacy API import updates by slug and records one working snapshot without rebuilding', async () => {
  const calls = { create: 0, update: 0 };
  const revisions = [];
  let tariffs = [{ id: 'legacy', providerId: 'provider', cityId: 'city', name: 'Старое имя', slug: 'internet-300', serviceType: 'INTERNET' }];
  const transaction = {
    city: { findUnique: async () => ({ siteId: 'site', site: { providerId: 'provider' } }) },
    tariff: {
      findMany: async () => tariffs,
      findFirst: async ({ where }) => {
        assert.equal(where.OR[0].identityKey, 'city:internet-300:internet');
        assert.equal(where.OR[1].slug, 'internet-300');
        return tariffs[0];
      },
      update: async ({ data }) => {
        calls.update += 1;
        assert.equal(data.identityKey, 'city:internet-300:internet');
        tariffs = [{ ...tariffs[0], ...data }];
        return tariffs[0];
      },
      create: async () => { calls.create += 1; },
    },
  };
  const prisma = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return callback(transaction);
    },
  };
  const controller = new AdminTariffsController(
    prisma,
    undefined,
    { recordWorkingRevision: async (_transaction, input) => { revisions.push(input); return { siteRevision: 7 }; } },
  );
  const result = await controller.import(
    { providerId: 'provider', cityId: 'city', items: [{ name: 'Интернет 300', slug: 'internet-300', serviceType: 'INTERNET', identityKey: 'attacker:key' }] },
    { user: { id: 'user-1' } },
  );
  assert.equal(result.imported, 1);
  assert.equal(result.workingRevision, 7);
  assert.equal(calls.update, 1);
  assert.equal(calls.create, 0);
  assert.equal(revisions.length, 1);
  assert.deepEqual({
    siteId: revisions[0].siteId,
    entityType: revisions[0].entityType,
    action: revisions[0].action,
    changedFields: revisions[0].changedFields,
    actorId: revisions[0].actorId,
    source: revisions[0].source,
  }, {
    siteId: 'site',
    entityType: 'SITE',
    action: 'IMPORT',
    changedFields: ['tariffs'],
    actorId: 'user-1',
    source: 'tariff-import:legacy-api',
  });
  assert.equal(revisions[0].previousSnapshot.tariffs[0].name, 'Старое имя');
  assert.equal(revisions[0].snapshot.tariffs[0].name, 'Интернет 300');
});

test('legacy API import rejects empty input and a city from another provider before tariff writes', async () => {
  let tariffWrites = 0;
  const transaction = {
    city: { findUnique: async () => ({ siteId: 'site', site: { providerId: 'other-provider' } }) },
    tariff: {
      findMany: async () => { tariffWrites += 1; return []; },
      findFirst: async () => { tariffWrites += 1; return null; },
      update: async () => { tariffWrites += 1; },
      create: async () => { tariffWrites += 1; },
    },
  };
  const controller = new AdminTariffsController(
    { $transaction: async (callback) => callback(transaction) },
    undefined,
    { recordWorkingRevision: async () => { throw new Error('revision must not be created'); } },
  );

  assert.throws(
    () => controller.import({ providerId: 'provider', cityId: 'city', items: [] }),
    /хотя бы один тариф/i,
  );
  await assert.rejects(
    controller.import({ providerId: 'provider', cityId: 'city', items: [{ name: 'Интернет 300', slug: 'internet-300', serviceType: 'INTERNET' }] }),
    /другому провайдеру/i,
  );
  assert.equal(tariffWrites, 0);
});

test('manual create ignores a caller-supplied identity key and derives the canonical key', async () => {
  let saved;
  const revisions = [];
  const prisma = {
    city: { findUnique: async () => ({ siteId: 'site' }) },
    tariff: {
      create: async ({ data }) => {
        saved = data;
        return { id: 'tariff', ...data };
      },
    },
  };
  prisma.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback(prisma);
  };
  const controller = new AdminTariffsController(
    prisma,
    undefined,
    { recordWorkingRevision: async (_transaction, input) => { revisions.push(input); return { siteRevision: 3 }; } },
  );

  const result = await controller.create({
    providerId: 'provider', cityId: 'city', name: 'Интернет 500', slug: 'internet-500',
    serviceType: 'INTERNET', identityKey: 'attacker:key',
  }, { user: { id: 'user-1' } });

  assert.equal(saved.identityKey, 'city:internet-500:internet');
  assert.equal(result.workingRevision, 3);
  assert.equal(revisions[0].siteId, 'site');
  assert.equal(revisions[0].entityType, 'TARIFF');
  assert.equal(revisions[0].action, 'CREATE');
  assert.equal(revisions[0].actorId, 'user-1');
  assert.deepEqual(revisions[0].snapshot, { id: 'tariff', ...saved });
});

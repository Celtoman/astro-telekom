const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');

test('manual tariff rename refreshes the deterministic identity key', async () => {
  let saved;
  const prisma = { tariff: {
    findUnique: async () => ({ id: 'tariff', cityId: 'city', name: 'Старый тариф', serviceType: 'INTERNET' }),
    update: async ({ data }) => { saved = data; return { id: 'tariff', ...data }; },
  } };
  const controller = new AdminTariffsController(prisma, { enqueue: async () => {} });
  await controller.update('tariff', { name: 'Новый тариф', serviceType: 'INTERNET_TV' });
  assert.equal(saved.identityKey, 'city:новый-тариф:internet_tv');
});

test('import updates legacy tariff found by its slug instead of creating a duplicate', async () => {
  const calls = { create: 0, update: 0 };
  const prisma = {
    $transaction: async (callback) => callback({ tariff: {
      findFirst: async ({ where }) => { assert.equal(where.OR[1].slug, 'internet-300'); return { id: 'legacy' }; },
      update: async ({ data }) => { calls.update += 1; return { id: 'legacy', ...data }; },
      create: async () => { calls.create += 1; },
    } }),
  };
  const controller = new AdminTariffsController(prisma, { enqueue: async () => {} });
  const result = await controller.import({ providerId: 'provider', cityId: 'city', items: [{ name: 'Интернет 300', slug: 'internet-300', serviceType: 'INTERNET' }] });
  assert.equal(result.imported, 1);
  assert.equal(calls.update, 1);
  assert.equal(calls.create, 0);
});

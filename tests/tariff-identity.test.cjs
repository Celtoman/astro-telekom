const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');

test('manual tariff edit keeps the deterministic identity key aligned with import business key', async () => {
  let saved;
  let rebuild;
  const updatedAt = new Date('2026-09-10T00:00:00Z');
  const tx = {
    city: { findUnique: async () => ({ id: 'city', slug: 'kazan', siteId: 'site', site: { providerId: 'provider' } }) },
    tariff: {
      findUnique: async () => ({ id: 'tariff', providerId: 'provider', cityId: 'city', name: 'Старый тариф', slug: 'stable-slug', serviceType: 'INTERNET', status: 'DRAFT', updatedAt }),
      update: async ({ data }) => { saved = data; return { id: 'tariff', provider: { id: 'provider', name: 'Дом.ру' }, city: { id: 'city', name: 'Казань', slug: 'kazan', siteId: 'site' }, cityId: 'city', slug: 'stable-slug', ...data }; },
    },
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const controller = new AdminTariffsController(prisma, { enqueue: async (data) => { rebuild = data; } });
  await controller.update('tariff', { expectedUpdatedAt: updatedAt.toISOString(), name: 'Новый тариф', serviceType: 'INTERNET_TV' });
  assert.equal(saved.identityKey, 'city:stable-slug:internet_tv');
  assert.equal(rebuild.siteId, 'site');
});

test('import updates legacy tariff found by its slug instead of creating a duplicate', async () => {
  const calls = { create: 0, update: 0 };
  const prisma = {
    city: { findUnique: async () => ({ siteId: 'site' }) },
    $transaction: async (callback) => callback({ tariff: {
      findFirst: async ({ where }) => { assert.equal(where.OR[0].identityKey, 'city:internet-300:internet'); assert.equal(where.OR[1].slug, 'internet-300'); return { id: 'legacy' }; },
      update: async ({ data }) => { calls.update += 1; assert.equal(data.identityKey, 'city:internet-300:internet'); return { id: 'legacy', ...data }; },
      create: async () => { calls.create += 1; },
    } }),
  };
  const controller = new AdminTariffsController(prisma, { enqueue: async () => {} });
  const result = await controller.import({ providerId: 'provider', cityId: 'city', items: [{ name: 'Интернет 300', slug: 'internet-300', serviceType: 'INTERNET', identityKey: 'attacker:key' }] });
  assert.equal(result.imported, 1);
  assert.equal(calls.update, 1);
  assert.equal(calls.create, 0);
});

test('manual create ignores a caller-supplied identity key and derives the canonical key', async () => {
  let saved;
  const prisma = {
    city: { findUnique: async () => ({ siteId: 'site' }) },
    tariff: {
      create: async ({ data }) => {
        saved = data;
        return { id: 'tariff', ...data };
      },
    },
  };
  const controller = new AdminTariffsController(prisma, { enqueue: async () => {} });

  await controller.create({
    providerId: 'provider', cityId: 'city', name: 'Интернет 500', slug: 'internet-500',
    serviceType: 'INTERNET', identityKey: 'attacker:key',
  });

  assert.equal(saved.identityKey, 'city:internet-500:internet');
});

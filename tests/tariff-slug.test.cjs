const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');

function fixture({ pageConflict = false, tariffConflict = false, redirectConflict = false, status = 'PUBLISHED', cityStatus = 'PUBLISHED' } = {}) {
  const createdRedirects = [];
  const flattenedRedirects = [];
  let updatedTariff = null;
  const existing = { id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Гига 500', slug: 'old-slug', serviceType: 'INTERNET', status, updatedAt: new Date('2026-09-10T00:00:00Z') };
  const tx = {
    tariff: {
      findUnique: async () => existing,
      findFirst: async () => tariffConflict ? { id: 'tariff-conflict' } : null,
      update: async ({ data }) => {
        updatedTariff = { ...existing, ...data };
        return { ...updatedTariff, provider: { id: 'provider-1', name: 'Дом.ру' }, city: { id: 'city-1', name: 'Казань', slug: 'kazan', siteId: 'site-1' } };
      },
    },
    city: { findUnique: async () => ({ id: 'city-1', slug: 'kazan', siteId: 'site-1', status: cityStatus, site: { providerId: 'provider-1' } }) },
    page: { findFirst: async () => pageConflict ? { id: 'page-conflict' } : null },
    redirect: {
      findUnique: async ({ where }) => redirectConflict && where.siteId_sourcePath.sourcePath === '/kazan/old-slug' ? { id: 'redirect-conflict', targetPath: '/kazan/other' } : null,
      create: async ({ data }) => { createdRedirects.push(data); return data; },
      updateMany: async (query) => { flattenedRedirects.push(query); return { count: 1 }; },
      update: async () => ({}),
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (callback) => callback(tx),
  };
  const rebuilds = [];
  const controller = new AdminTariffsController(prisma, { enqueue: async (data) => { rebuilds.push(data); } });
  return { controller, createdRedirects, flattenedRedirects, rebuilds, getUpdatedTariff: () => updatedTariff };
}

test('manual published tariff slug change creates a managed redirect record atomically', async () => {
  const f = fixture();

  await f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', slug: 'new-slug', confirmSensitiveChanges: true });

  assert.equal(f.getUpdatedTariff().slug, 'new-slug');
  assert.deepEqual(f.createdRedirects, [{
    siteId: 'site-1', cityId: 'city-1', sourcePath: '/kazan/old-slug', targetPath: '/kazan/new-slug', status: 'PUBLISHED', managedTariffId: 'tariff-1',
  }]);
  assert.deepEqual(f.flattenedRedirects, [{
    where: { siteId: 'site-1', targetPath: '/kazan/old-slug' },
    data: { targetPath: '/kazan/new-slug' },
  }]);
  assert.equal(f.rebuilds[0].siteId, 'site-1');
});

test('slug change is blocked when the old URL belongs to a published page', async () => {
  const f = fixture({ pageConflict: true });

  await assert.rejects(f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', slug: 'new-slug', confirmSensitiveChanges: true }), /URL.*занят/i);
  assert.equal(f.getUpdatedTariff(), null);
});

test('slug change is blocked when the target URL belongs to another published tariff', async () => {
  const f = fixture({ tariffConflict: true });

  await assert.rejects(f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', slug: 'new-slug', confirmSensitiveChanges: true }), /занят опубликованным тарифом/i);
  assert.equal(f.getUpdatedTariff(), null);
  assert.equal(f.createdRedirects.length, 0);
});

test('slug change is blocked when an incompatible redirect already exists', async () => {
  const f = fixture({ redirectConflict: true });

  await assert.rejects(f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', slug: 'new-slug', confirmSensitiveChanges: true }), /редирект/i);
  assert.equal(f.getUpdatedTariff(), null);
});

test('publishing a tariff synchronizes only redirects managed for that tariff', async () => {
  const f = fixture({ status: 'DRAFT' });

  await f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', status: 'PUBLISHED', confirmSensitiveChanges: true });

  assert.deepEqual(f.flattenedRedirects, [{
    where: { siteId: 'site-1', managedTariffId: 'tariff-1' },
    data: { status: 'PUBLISHED' },
  }]);
});

test('returning a tariff to draft changes only the managed redirect and preserves manual rules', async () => {
  const f = fixture({ status: 'PUBLISHED' });

  await f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', status: 'DRAFT', confirmSensitiveChanges: true });

  assert.deepEqual(f.flattenedRedirects, [
    { where: { siteId: 'site-1', managedTariffId: 'tariff-1' }, data: { status: 'DRAFT' } },
  ]);
});

test('renaming a tariff flattens manual incoming redirects instead of creating a chain', async () => {
  const f = fixture();

  await f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', slug: 'new-slug', confirmSensitiveChanges: true });

  assert.deepEqual(f.flattenedRedirects[0], {
    where: { siteId: 'site-1', targetPath: '/kazan/old-slug' },
    data: { targetPath: '/kazan/new-slug' },
  });
});

test('tariff redirect stays draft while its city is not published', async () => {
  const f = fixture({ cityStatus: 'DRAFT' });

  await f.controller.update('tariff-1', { expectedUpdatedAt: '2026-09-10T00:00:00.000Z', slug: 'new-slug', confirmSensitiveChanges: true });

  assert.equal(f.createdRedirects[0].status, 'DRAFT');
  assert.equal(f.flattenedRedirects.length, 1);
});

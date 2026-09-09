const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');

function fixture({ pageConflict = false, tariffConflict = false, redirectConflict = false } = {}) {
  const createdRedirects = [];
  const flattenedRedirects = [];
  let updatedTariff = null;
  const existing = { id: 'tariff-1', providerId: 'provider-1', cityId: 'city-1', name: 'Гига 500', slug: 'old-slug', serviceType: 'INTERNET', status: 'PUBLISHED' };
  const tx = {
    tariff: {
      findUnique: async () => existing,
      findFirst: async () => tariffConflict ? { id: 'tariff-conflict' } : null,
      update: async ({ data }) => { updatedTariff = { ...existing, ...data }; return updatedTariff; },
    },
    city: { findUnique: async () => ({ id: 'city-1', slug: 'kazan', siteId: 'site-1' }) },
    page: { findFirst: async () => pageConflict ? { id: 'page-conflict' } : null },
    redirect: {
      findUnique: async ({ where }) => redirectConflict && where.siteId_sourcePath.sourcePath === '/kazan/old-slug/' ? { id: 'redirect-conflict', targetPath: '/kazan/other/' } : null,
      create: async ({ data }) => { createdRedirects.push(data); return data; },
      updateMany: async (query) => { flattenedRedirects.push(query); return { count: 1 }; },
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

test('manual published tariff slug change creates a 301 redirect atomically', async () => {
  const f = fixture();

  await f.controller.update('tariff-1', { slug: 'new-slug' });

  assert.equal(f.getUpdatedTariff().slug, 'new-slug');
  assert.deepEqual(f.createdRedirects, [{
    siteId: 'site-1', cityId: 'city-1', sourcePath: '/kazan/old-slug/', targetPath: '/kazan/new-slug/', status: 'PUBLISHED',
  }]);
  assert.deepEqual(f.flattenedRedirects, [{
    where: { siteId: 'site-1', targetPath: '/kazan/old-slug/' },
    data: { targetPath: '/kazan/new-slug/' },
  }]);
  assert.equal(f.rebuilds[0].siteId, 'site-1');
});

test('slug change is blocked when the old URL belongs to a published page', async () => {
  const f = fixture({ pageConflict: true });

  await assert.rejects(f.controller.update('tariff-1', { slug: 'new-slug' }), /URL.*занят/i);
  assert.equal(f.getUpdatedTariff(), null);
});

test('slug change is blocked when the target URL belongs to another published tariff', async () => {
  const f = fixture({ tariffConflict: true });

  await assert.rejects(f.controller.update('tariff-1', { slug: 'new-slug' }), /занят опубликованным тарифом/i);
  assert.equal(f.getUpdatedTariff(), null);
  assert.equal(f.createdRedirects.length, 0);
});

test('slug change is blocked when an incompatible redirect already exists', async () => {
  const f = fixture({ redirectConflict: true });

  await assert.rejects(f.controller.update('tariff-1', { slug: 'new-slug' }), /редирект/i);
  assert.equal(f.getUpdatedTariff(), null);
});

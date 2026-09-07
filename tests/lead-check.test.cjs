const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');

function fixture(check) {
  let saved;
  const prisma = {
    site: { findFirst: async () => ({ id: 'site' }) },
    city: { findFirst: async () => ({ id: 'city', name: 'Казань' }) },
    addressCheck: { findFirst: async ({ where }) => {
      assert.equal(where.siteId, 'site');
      assert.equal(where.cityId, 'city');
      return check;
    } },
    lead: { create: async ({ data }) => { saved = data; return { ...data, id: 'lead', status: 'NEW' }; } },
  };
  return { controller: new PublicLeadsController(prisma, { notifyLead: async () => {} }), saved: () => saved };
}
const base = { citySlug: 'kazan', phone: '+79000000000' };

test('lead rejects a site that is not publicly published', async () => {
  const prisma = {
    site: { findFirst: async ({ where }) => { assert.equal(where.status, 'PUBLISHED'); return null; } },
  };
  const controller = new PublicLeadsController(prisma, { notifyLead: async () => {} });
  await assert.rejects(controller.create(base), /Сайт не найден/);
});

test('lead rejects an unavailable requested page or tariff', async () => {
  const f = fixture(null);
  f.controller.prisma.page = { findFirst: async () => null };
  await assert.rejects(f.controller.create({ ...base, pageSlug: 'draft-page' }), /Страница не найдена/);
  f.controller.prisma.page = undefined;
  f.controller.prisma.tariff = { findFirst: async () => null };
  await assert.rejects(f.controller.create({ ...base, tariffSlug: 'draft-tariff' }), /Тариф не найден/);
});

test('lead uses persisted status and object details despite forged client status', async () => {
  const f = fixture({ id: 'check', status: 'UNAVAILABLE', address: 'Улица, 1', objectType: 'apartment' });
  await f.controller.create({ ...base, addressCheckId: 'check', checkStatus: 'AVAILABLE' });
  assert.deepEqual(f.saved().apiResult, { status: 'UNAVAILABLE' });
  assert.equal(f.saved().address, 'Улица, 1');
  assert.equal(f.saved().objectType, 'apartment');
});
test('manual lead cannot manufacture a coverage result', async () => {
  const f = fixture(null);
  await f.controller.create({ ...base, checkStatus: 'AVAILABLE' });
  assert.equal(f.saved().apiResult, undefined);
});
test('unknown check is rejected before saving', async () => {
  const f = fixture(null);
  await assert.rejects(f.controller.create({ ...base, addressCheckId: 'foreign' }), /не найдена/);
  assert.equal(f.saved(), undefined);
});
test('a check cannot be attached to a different address', async () => {
  const f = fixture({ id: 'check', address: 'Улица, 1' });
  await assert.rejects(f.controller.create({ ...base, addressCheckId: 'check', address: 'Улица, 2' }), /Адрес изменился/);
  assert.equal(f.saved(), undefined);
});

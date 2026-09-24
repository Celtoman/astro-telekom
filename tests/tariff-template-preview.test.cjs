const { test } = require('node:test');
const assert = require('node:assert/strict');

const { AdminTariffTemplateController } = require('../apps/api/dist/admin-tariff-template.controller.js');

const publishedTariff = {
  id: 'tariff-1', slug: 'giga-300', name: 'Гига 300', serviceType: 'INTERNET',
  standardPrice: '1000', promoPrice: null, connectionFee: '0', speed: 300,
  status: 'PUBLISHED', availability: 'ACTIVE', externalId: 'P-300', attributes: {},
};
const workingTariff = { ...publishedTariff, standardPrice: '900', promoText: 'Цена {TARIFF_PRICE} ₽', updatedAt: '2026-09-24T10:00:00.000Z' };
const draftTariff = { ...publishedTariff, id: 'tariff-2', slug: 'draft-500', name: 'Черновик 500', standardPrice: '1500', status: 'DRAFT', externalId: 'D-500' };
const publishedOnly = { ...publishedTariff, id: 'tariff-3', slug: 'old-100', name: 'Старый 100' };

function fixture() {
  const reads = [];
  const prisma = {
    site: { findUnique: async () => { reads.push('site'); return { id: 'site-1', slug: 'domru-site', domain: 'example.test', workingRevision: 8, publishedRevision: 7 }; } },
    sitePublication: { findFirst: async () => { reads.push('publication'); return {
      siteRevision: 7, publishedAt: new Date('2026-09-24T09:00:00.000Z'), providerDeploymentId: 'deployment-1',
      catalog: { cities: [{ slug: 'kazan', name: 'Казань', nameIn: 'Казани', tariffs: [publishedTariff, publishedOnly] }] },
    }; } },
    city: {
      findMany: async () => { reads.push('cities'); return [{ slug: 'kazan', name: 'Казань', status: 'PUBLISHED' }, { slug: 'draft-city', name: 'Черновой город', status: 'DRAFT' }]; },
      findFirst: async ({ where }) => { reads.push('city'); return where.slug === 'kazan' ? { id: 'city-1', slug: 'kazan', name: 'Казань', nameIn: 'Казани', tariffs: [workingTariff, draftTariff] } : null; },
    },
    tariff: {
      findMany: async () => { reads.push('tariffs'); return [workingTariff, draftTariff]; },
      findFirst: async ({ where }) => { reads.push('tariff'); return [workingTariff, draftTariff].find((item) => item.slug === where.slug) ?? null; },
    },
  };
  return { controller: new AdminTariffTemplateController(prisma), reads };
}

test('tariff template routes require admin authentication and expose only read/quote operations', () => {
  assert.equal(Reflect.getMetadata('path', AdminTariffTemplateController), 'admin/sites/:siteId/tariff-template');
  assert.ok(Reflect.getMetadata('__guards__', AdminTariffTemplateController)?.some((guard) => guard.name === 'AdminTokenGuard'));
  for (const method of ['cities', 'tariffs', 'preview', 'codeStatus']) assert.equal(Reflect.getMetadata('method', AdminTariffTemplateController.prototype[method]), 0);
  assert.equal(Reflect.getMetadata('method', AdminTariffTemplateController.prototype.quote), 1);
});

test('city and tariff selectors include drafts and published-only entries, then search external ID', async () => {
  const { controller, reads } = fixture();
  const cities = await controller.cities('site-1');
  assert.deepEqual(cities.cities.map((item) => [item.slug, item.working, item.published]), [['kazan', true, true], ['draft-city', true, false]]);
  const tariffs = await controller.tariffs('site-1', 'kazan');
  assert.deepEqual(new Set(tariffs.tariffs.map((item) => item.slug)), new Set(['giga-300', 'draft-500', 'old-100']));
  assert.equal(tariffs.tariffs.find((item) => item.slug === 'draft-500').published, false);
  assert.equal(tariffs.tariffs.find((item) => item.slug === 'old-100').working, false);
  assert.deepEqual((await controller.tariffs('site-1', 'kazan', 'D-500')).tariffs.map((item) => item.slug), ['draft-500']);
  assert.ok(!reads.some((item) => /create|update|delete/i.test(item)));
});

test('preview compares working and last successful published tariff without publishing', async () => {
  const { controller, reads } = fixture();
  const preview = await controller.preview('site-1', 'kazan', 'giga-300');
  assert.equal(preview.workingRevision, 8);
  assert.equal(preview.publishedRevision, 7);
  assert.equal(preview.tariff.working.standardPrice, '900');
  assert.equal(preview.tariff.working.promoText, 'Цена 900 ₽');
  assert.equal(preview.tariff.published.standardPrice, '1000');
  assert.equal((await controller.preview('site-1', 'kazan', 'draft-500')).tariff.published, null);
  assert.equal((await controller.preview('site-1', 'kazan', 'old-100')).tariff.working, null);
  await assert.rejects(controller.preview('site-1', 'kazan', '../unsafe'), (error) => error.getStatus() === 400);
  assert.ok(!reads.some((item) => /create|update|delete/i.test(item)));
});

test('protected quote uses the selected snapshot and writes no lead or publication', async () => {
  const { controller, reads } = fixture();
  const params = { citySlug: 'kazan', tariffSlug: 'giga-300', selection: { router: 'NONE', tvbox: 'NONE', services: [] } };
  const working = await controller.quote('site-1', { ...params, version: 'working' });
  const published = await controller.quote('site-1', { ...params, version: 'published' });
  assert.equal(working.totals.monthly, 900);
  assert.equal(published.totals.monthly, 1000);
  await assert.rejects(controller.quote('site-1', { ...params, version: 'missing' }), (error) => error.getStatus() === 400);
  await assert.rejects(controller.quote('site-1', { ...params, tariffSlug: 'draft-500', version: 'published' }), (error) => error.getStatus() === 404);
  assert.ok(!reads.some((item) => /create|update|delete/i.test(item)));
});

test('code status separates latest deployment from last successful SHA and never returns the API token', async () => {
  const { controller } = fixture();
  const originalFetch = global.fetch;
  const original = Object.fromEntries(['COOLIFY_API_URL', 'COOLIFY_API_TOKEN', 'COOLIFY_RESOURCE_UUID'].map((key) => [key, process.env[key]]));
  process.env.COOLIFY_API_URL = 'https://coolify.example.test/api/v1';
  process.env.COOLIFY_API_TOKEN = 'private-test-token';
  process.env.COOLIFY_RESOURCE_UUID = 'resource-1';
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer private-test-token');
    return new Response(JSON.stringify(String(url).includes('/deployments/applications/')
      ? { deployments: [
        { deployment_uuid: 'pending-1', status: 'in_progress' },
        { deployment_uuid: 'finished-1', status: 'finished', commit: '0123456789abcdef', updated_at: '2026-09-24T12:00:00Z' },
      ] }
      : { status: 'running:healthy' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await controller.codeStatus('site-1');
    assert.equal(result.available, true);
    assert.equal(result.latestDeployment.status, 'in_progress');
    assert.equal(result.lastSuccessful.commit, '0123456789abcdef');
    assert.equal(result.applicationStatus, 'running:healthy');
    assert.doesNotMatch(JSON.stringify(result), /private-test-token/);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

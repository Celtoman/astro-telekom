const { test } = require('node:test');
const assert = require('node:assert/strict');

const { AdminTariffTemplateController } = require('../apps/api/dist/admin-tariff-template.controller.js');
const { selectTariffPreviewScenarios } = require('../apps/api/dist/tariff-preview-scenarios.js');
const { tariffPreviewDiagnostics } = require('../apps/api/dist/tariff-preview-diagnostics.js');

const publishedTariff = {
  id: 'tariff-1', slug: 'giga-300', name: 'Гига 300', serviceType: 'INTERNET',
  standardPrice: '1000', promoPrice: null, connectionFee: '0', speed: 300,
  status: 'PUBLISHED', availability: 'ACTIVE', externalId: 'P-300', attributes: {},
};
const workingTariff = { ...publishedTariff, standardPrice: '900', promoText: 'Цена {TARIFF_PRICE} ₽', updatedAt: '2026-09-24T10:00:00.000Z' };
const draftTariff = { ...publishedTariff, id: 'tariff-2', slug: 'draft-500', name: 'Черновик 500', standardPrice: '1500', status: 'DRAFT', externalId: 'D-500' };
const publishedOnly = { ...publishedTariff, id: 'tariff-3', slug: 'old-100', name: 'Старый 100' };

function fixture(workingOverride = null) {
  const reads = [];
  const citySelections = [];
  const prisma = {
    site: { findUnique: async () => { reads.push('site'); return { id: 'site-1', slug: 'domru-site', domain: 'example.test', workingRevision: 8, publishedRevision: 7 }; } },
    sitePublication: { findFirst: async () => { reads.push('publication'); return {
      siteRevision: 7, publishedAt: new Date('2026-09-24T09:00:00.000Z'), providerDeploymentId: 'deployment-1',
      catalog: { cities: [{ slug: 'kazan', name: 'Казань', nameIn: 'Казани', tariffs: [publishedTariff, publishedOnly] }] },
    }; } },
    city: {
      findMany: async () => { reads.push('cities'); return [{ slug: 'kazan', name: 'Казань', status: 'PUBLISHED' }, { slug: 'draft-city', name: 'Черновой город', status: 'DRAFT' }]; },
      findFirst: async ({ where, select }) => {
        reads.push('city');
        citySelections.push(select);
        return where.slug === 'kazan' ? { id: 'city-1', slug: 'kazan', name: 'Казань', namePrepositional: 'Казани', tariffs: [workingOverride ?? workingTariff, draftTariff] } : null;
      },
    },
    tariff: {
      findMany: async () => { reads.push('tariffs'); return [workingTariff, draftTariff].map((tariff) => ({ ...tariff, city: { slug: 'kazan', status: 'PUBLISHED' } })); },
      findFirst: async ({ where }) => { reads.push('tariff'); return [workingTariff, draftTariff].find((item) => item.slug === where.slug) ?? null; },
    },
    sitePublicationValidation: { findFirst: async () => { reads.push('validation'); return {
      id: 'validation-1', appVersion: '0.1.0', validatedAt: new Date('2026-09-24T09:00:00.000Z'), outcome: 'PASSED_WITH_WARNINGS',
      report: { issues: [
        { severity: 'WARNING', code: 'SEO_LENGTH', path: '/kazan/giga-300', message: 'Title длинный', template: 'CITY_TARIFF_DETAIL', block: 'hero', field: 'seo.title' },
        { severity: 'WARNING', code: 'OTHER', path: '/other/path', message: 'Другая страница' },
      ] },
    }; } },
  };
  return { controller: new AdminTariffTemplateController(prisma), reads, citySelections };
}

test('tariff template routes require admin authentication and expose only read/quote operations', () => {
  assert.equal(Reflect.getMetadata('path', AdminTariffTemplateController), 'admin/sites/:siteId/tariff-template');
  assert.ok(Reflect.getMetadata('__guards__', AdminTariffTemplateController)?.some((guard) => guard.name === 'AdminTokenGuard'));
  for (const method of ['cities', 'tariffs', 'scenarios', 'preview', 'diagnostics', 'codeStatus']) assert.equal(Reflect.getMetadata('method', AdminTariffTemplateController.prototype[method]), 0);
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
  const { controller, reads, citySelections } = fixture();
  const preview = await controller.preview('site-1', 'kazan', 'giga-300');
  assert.equal(preview.workingRevision, 8);
  assert.equal(preview.publishedRevision, 7);
  assert.equal(preview.tariff.working.standardPrice, '900');
  assert.equal(preview.tariff.working.promoText, 'Цена 900 ₽');
  assert.equal(preview.city.nameIn, 'Казани');
  assert.equal(citySelections[0].nameIn, undefined, 'City.nameIn is absent from Prisma schema');
  assert.equal(citySelections[0].namePrepositional, true);
  assert.equal(preview.tariff.published.standardPrice, '1000');
  assert.equal((await controller.preview('site-1', 'kazan', 'draft-500')).tariff.published, null);
  assert.equal((await controller.preview('site-1', 'kazan', 'old-100')).tariff.working, null);
  await assert.rejects(controller.preview('site-1', 'kazan', '../unsafe'), (error) => error.getStatus() === 400);
  assert.ok(!reads.some((item) => /create|update|delete/i.test(item)));
});

test('representative scenarios select real tariffs deterministically and warn when coverage is missing', () => {
  const tariff = (slug, serviceType = 'INTERNET', attributes = {}) => ({
    slug, name: slug, serviceType, standardPrice: '700', promoPrice: null, connectionFee: '0',
    status: 'PUBLISHED', availability: 'ACTIVE', attributes,
  });
  const entries = [
    tariff('internet-basic'),
    tariff('combo', 'INTERNET_TV', { tv_channels_total: 100 }),
    tariff('gaming', 'INTERNET', { srv_gaming_status: 'INCLUDED', game_code: 'lesta' }),
    tariff('equipment', 'INTERNET', { router_buyout_price: 1000 }),
    tariff('extras', 'INTERNET', { srv_video_status: 'OPTIONAL', srv_video_price: 100, cctv_buyout_price: 200, cctv_connection_price: 0 }),
  ].map((row) => ({ citySlug: 'kazan', version: 'working', cityStatus: 'PUBLISHED', tariff: row }));
  const selected = selectTariffPreviewScenarios(entries);
  assert.deepEqual(selected.scenarios.map((item) => item.id), ['internet', 'combo', 'gaming', 'equipment', 'extras', 'minimal']);
  assert.ok(selected.scenarios.every((item) => item.match && entries.some((entry) => entry.tariff.slug === item.match.tariffSlug)));
  assert.equal(selected.scenarios.find((item) => item.id === 'minimal').match.tariffSlug, 'internet-basic');
  assert.deepEqual(selectTariffPreviewScenarios([...entries].reverse()), selected);
  const uncovered = selectTariffPreviewScenarios([
    entries[0], { ...entries[0], tariff: { ...entries[0].tariff, slug: 'bad', standardPrice: '0' } },
  ]);
  assert.equal(uncovered.invalidTariffCount, 1);
  assert.equal(uncovered.scenarios.find((item) => item.id === 'combo').match, null);
  assert.equal(uncovered.scenarios.find((item) => item.id === 'combo').warning, 'Сценарий не покрыт данными');
});

test('scenario and diagnostic APIs preserve versions, filter report by URL and write nothing', async () => {
  const { controller, reads } = fixture();
  const working = await controller.scenarios('site-1', 'working');
  const published = await controller.scenarios('site-1', 'published');
  assert.equal(working.scenarios.find((item) => item.id === 'internet').match.version, 'working');
  assert.equal(published.scenarios.find((item) => item.id === 'internet').match.version, 'published');
  assert.equal(working.scenarios.find((item) => item.id === 'combo').match, null);
  await assert.rejects(controller.scenarios('site-1', 'invalid'), (error) => error.getStatus() === 400);
  const result = await controller.diagnostics('site-1', 'kazan', 'giga-300', 'working');
  assert.equal(result.path, '/kazan/giga-300');
  assert.equal(result.siteRevision, 8);
  assert.deepEqual(result.current, []);
  assert.deepEqual(result.publicationReport.issues.map((item) => item.code), ['SEO_LENGTH']);
  assert.equal(result.publicationReport.staleCode, false);
  assert.ok(!reads.some((item) => /create|update|delete/i.test(item)));
});

test('current tariff diagnostics identify renderer and calculator block and field', () => {
  const row = { ...publishedTariff, standardPrice: '0', attributes: { online_cinemas: 'unknown' } };
  const diagnostics = tariffPreviewDiagnostics(row, '/kazan/giga-300');
  assert.deepEqual(diagnostics.map((item) => [item.code, item.block, item.field]), [
    ['TARIFF_RENDER', 'cinemas', 'attributes.online_cinemas'],
    ['TARIFF_CALCULATION', 'hero', 'standardPrice'],
  ]);
});

test('unresolved working promo variable remains visible as a field diagnostic', async () => {
  const { controller } = fixture({ ...workingTariff, promoText: 'Цена {UNKNOWN_CODE} ₽' });
  const preview = await controller.preview('site-1', 'kazan', 'giga-300');
  assert.equal(preview.tariff.working.promoText, 'Цена {UNKNOWN_CODE} ₽');
  assert.deepEqual(
    [preview.variableDiagnostics.working.code, preview.variableDiagnostics.working.block, preview.variableDiagnostics.working.field],
    ['VARIABLE_RESOLUTION', 'hero', 'promoText'],
  );
  const diagnostics = await controller.diagnostics('site-1', 'kazan', 'giga-300', 'working');
  assert.ok(diagnostics.current.some((item) => item.code === 'VARIABLE_RESOLUTION' && item.path === '/kazan/giga-300'));
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

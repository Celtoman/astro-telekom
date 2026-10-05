const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { AddressChecksController } = require('../apps/api/dist/address-checks.controller.js');
const { AddressSuggestionsController } = require('../apps/api/dist/address-suggestions.controller.js');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');
const { LEAD_CONSENT_VERSION } = require('../apps/api/dist/lead-consent.js');

async function fixture(callback) {
  const previous = { fetch: global.fetch, provider: process.env.REBUILD_PROVIDER, token: process.env.ADMIN_API_TOKEN, url: process.env.STATIC_PUBLICATION_URL };
  process.env.REBUILD_PROVIDER = 'static'; process.env.ADMIN_API_TOKEN = 's'.repeat(32); process.env.STATIC_PUBLICATION_URL = 'http://web:8081';
  const city = { id: 'city-1', name: 'Сохранённая Казань', slug: 'kazan', region: { name: 'Сохранённый регион', slug: 'region' }, pages: [{ id: 'page-1', slug: 'internet' }], tariffs: [] };
  const catalog = { site: { slug: 'domru-site' }, cities: [city] };
  const publication = { id: 'pub-a', siteId: 'site-1', siteRevision: 7, status: 'RUNNING', catalog };
  global.fetch = async () => Response.json({ publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7, catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') });
  const prisma = { sitePublication: { findUnique: async () => publication },
    site: { findUnique: async () => ({ id: 'site-1', status: 'DRAFT' }), findFirst: async () => ({ id: 'site-1' }) },
    city: { findFirst: async () => ({ id: 'city-1', slug: 'kazan', name: 'Рабочая Казань', region: { name: 'Рабочий регион' } }) },
    page: { findFirst: async () => ({ id: 'working-page' }) } };
  try { await callback(prisma, publication); }
  finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [['REBUILD_PROVIDER', previous.provider], ['ADMIN_API_TOKEN', previous.token], ['STATIC_PUBLICATION_URL', previous.url]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('address check and suggest use served city/page identities despite unsaved publication status changes', async () => fixture(async prisma => {
  let stored; let boost;
  prisma.addressCheck = { create: async ({ data }) => { stored = data; return { id: 'check-1' }; } };
  const checks = new AddressChecksController({ check: async () => ({ status: 'UNAVAILABLE', available: false, alternatives: [], message: 'Нет подключения' }) }, prisma, {});
  await checks.check({ siteSlug: 'domru-site', citySlug: 'kazan', pageSlug: 'internet', address: 'Казань, дом 1' });
  assert.equal(stored.siteId, 'site-1'); assert.equal(stored.cityId, 'city-1'); assert.equal(stored.pageId, 'page-1');
  const suggestions = new AddressSuggestionsController({ suggest: async (_query, value) => { boost = value; return []; } }, prisma);
  await suggestions.suggest({ siteSlug: 'domru-site', citySlug: 'kazan', query: 'Казань' }, { cookies: { address_city_kladr: 'none' } }, {});
  assert.deepEqual(boost, { city: 'Сохранённая Казань', region: 'Сохранённый регион' });
}));

test('lead rejects a working tariff absent from the actually served snapshot before writing', async () => fixture(async prisma => {
  let tariffReads = 0;
  prisma.lead = { findUnique: async () => null };
  prisma.tariff = { findFirst: async () => { tariffReads++; return { id: 'working-tariff', serviceType: 'INTERNET' }; } };
  const leads = new PublicLeadsController(prisma, {}, {});
  await assert.rejects(leads.create({ siteSlug: 'domru-site', citySlug: 'kazan', tariffSlug: 'draft-tariff', reasonCode: 'billing',
    phone: '+7 999 123-45-67', submissionKey: '11111111-1111-4111-8111-111111111111', consentVersion: LEAD_CONSENT_VERSION }, {}), error => error.getStatus?.() === 400 && /Тариф не найден/.test(error.message));
  assert.equal(tariffReads, 0);
}));

test('lead preserves served tariff identity and quoted prices while the working row changes', async () => fixture(async (prisma, publication) => {
  const { quoteTariffConfiguration, configurationSnapshot, quoteFingerprint } = require('../apps/api/dist/tariff-configuration.service.js');
  const tariff = { id: 'tariff-1', slug: 'served-tariff', name: 'Сохранённый тариф', serviceType: 'INTERNET',
    standardPrice: '1200', promoPrice: '900', connectionFee: '0', attributes: {} };
  publication.catalog.cities[0].tariffs.push(tariff);
  global.fetch = async () => Response.json({ publicationId: publication.id, siteId: publication.siteId, siteSlug: 'domru-site',
    siteRevision: publication.siteRevision, catalogDigest: createHash('sha256').update(JSON.stringify(publication.catalog)).digest('hex') });
  const saved = [];
  prisma.lead = { findUnique: async () => null, findMany: async () => [] };
  prisma.tariff = { findFirst: async ({ where }) => {
    assert.deepEqual(where, { id: 'tariff-1', cityId: 'city-1' });
    return { ...tariff, cityId: 'city-1', slug: 'working-slug', serviceType: 'INTERNET_TV', standardPrice: '2000', status: 'ARCHIVED' };
  } };
  prisma.$transaction = async callback => callback({
    lead: { create: async ({ data }) => { saved.push(data); return { id: `lead-${saved.length}`, status: 'NEW' }; } },
    leadDecisionEvent: { create: async () => ({}) },
  });
  const leads = new PublicLeadsController(prisma, {}, { create: async () => ({ id: 'notification-1' }), enqueueTracked: async () => true });
  const body = { siteSlug: 'domru-site', citySlug: 'kazan', pageSlug: 'internet', tariffSlug: tariff.slug, reasonCode: 'billing',
    phone: '+7 999 123-45-67', submissionKey: '11111111-1111-4111-8111-111111111111', consentVersion: LEAD_CONSENT_VERSION };
  await leads.create(body, {});
  const selection = { router: 'NONE', tvbox: 'NONE', services: [] };
  await leads.create({ ...body, submissionKey: '22222222-2222-4222-8222-222222222222',
    configuration: { selection, fingerprint: quoteFingerprint(configurationSnapshot(quoteTariffConfiguration(tariff, selection))) } }, {});
  for (const data of saved) {
    assert.equal(data.tariffId, tariff.id); assert.equal(data.pageId, 'page-1'); assert.equal(data.serviceType, 'INTERNET');
  }
  assert.equal(saved[1].configurationSnapshot.tariff.name, tariff.name);
  assert.equal(saved[1].configurationSnapshot.totals.monthly, 900);
}));

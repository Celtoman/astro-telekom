const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');
const { CreateLeadDto } = require('../apps/api/dist/public.dto.js');
const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');
const body = { phone: '+7 (999) 123-45-67', reasonCode: 'callback_consultation', consentAccepted: true, consentVersion: 'lead-form-v1-2026-09-22', submissionKey: '11111111-1111-4111-8111-111111111111' };
function fixture() {
  let saved, notifications = 0, decisions = 0, creates = 0;
  const prisma = { site: { findFirst: async () => ({ id: 'site' }) }, city: { findFirst: async ({ where }) => where.slug === 'kazan' ? { id: 'city', slug: 'kazan' } : null }, lead: { findUnique: async () => saved ? { ...saved, site: { slug: 'domru-site' }, city: saved.cityId ? { slug: 'kazan' } : null, page: null, tariff: null, addressCheckId: null, configurationSnapshot: null, comment: saved.comment || null, serviceType: null } : null, findMany: async () => [] }, $transaction: async action => action({ lead: { create: async ({data}) => { creates++; saved = { ...data, id: 'callback', status: 'NEW' }; return saved; } }, leadDecisionEvent: { create: async () => ({}) } }) };
  const controller = new PublicLeadsController(prisma, { enqueueTracked: async () => { decisions++; } }, { create: async () => ({ id: 'outbox' }), enqueueTracked: async () => { notifications++; } });
  return { controller, saved: () => saved, counts: () => ({ notifications, decisions, creates }) };
}
test('callback without city persists manual consultation with consent and one operator notification', async () => {
  const f=fixture(); const result=await f.controller.create(body,{headers:{}});
  assert.equal(result.id,'callback'); assert.equal(f.saved().cityId,undefined);
  assert.equal(f.saved().processingStatus,'MANUAL_CHECK'); assert.equal(f.saved().phoneCheckStatus,'SKIPPED');
  assert.equal(f.saved().reasonCode,'callback_consultation'); assert.equal(f.saved().phone,'79991234567');
  assert.ok(f.saved().consentAcceptedAt instanceof Date);
  assert.deepEqual(f.counts(),{notifications:1,decisions:0,creates:1});
  assert.equal((await f.controller.create(body,{headers:{}})).id,result.id);
  assert.deepEqual(f.counts(),{notifications:1,decisions:0,creates:1});
  await assert.rejects(f.controller.create({...body,phone:'+7 (999) 987-65-43'},{headers:{}}),/Ключ отправки/);
});
test('callback retains explicit published city and refuses unavailable city or connection payload', async () => {
  const f=fixture(); await f.controller.create({...body,citySlug:'kazan',comment:'Нужна консультация'},{headers:{}}); assert.equal(f.saved().cityId,'city');
  await assert.rejects(fixture().controller.create({...body,citySlug:'missing'},{headers:{}}),/Город не найден/);
  for(const extra of [{consentAccepted:false},{consentAccepted:undefined},{address:'Адрес'},{addressCheckId:'check'},{configuration:{}},{pageSlug:'home'},{serviceType:'INTERNET'}]) await assert.rejects(fixture().controller.create({...body,...extra},{headers:{}}),/подтвердите согласие/);
  await assert.rejects(fixture().controller.create({...body,tariffSlug:'tariff'},{headers:{}}),/город/i);
});

test('callback preserves tariff interest and city without address, quote, phone checks or sales delivery', async () => {
  let saved, notices = 0;
  const tariff = { id: 'tariff-1', slug: 'internet-500', name: 'Интернет 500', serviceType: 'INTERNET' };
  const prisma = {
    site: { findFirst: async () => ({ id: 'site-1' }) }, city: { findFirst: async () => ({ id: 'city-1', slug: 'kazan' }) },
    tariff: { findFirst: async ({ where }) => where.slug === tariff.slug ? tariff : null },
    lead: { findUnique: async () => saved ? { ...saved, site: { slug: 'domru-site' }, city: { slug: 'kazan' }, tariff, page: null, addressCheckId: null, configurationSnapshot: null } : null, findMany: async () => [] },
    $transaction: async action => action({ lead: { create: async ({ data }) => { saved = { ...data, id: 'interest', status: 'NEW' }; return saved; } }, leadDecisionEvent: { create: async () => ({}) } }),
  };
  const controller = new PublicLeadsController(prisma, { enqueueTracked: async () => assert.fail('manual callback must not start sales delivery') }, { create: async () => ({ id: 'notification' }), enqueueTracked: async () => { notices++; } });
  const input = { ...body, citySlug: 'kazan', tariffSlug: tariff.slug };
  assert.equal((await controller.create(input, { headers: {} })).id, 'interest');
  assert.equal(saved.cityId, 'city-1'); assert.equal(saved.tariffId, tariff.id);
  assert.equal(saved.addressCheckId, undefined); assert.equal(saved.configurationSnapshot, undefined);
  assert.equal(saved.processingStatus, 'MANUAL_CHECK'); assert.equal(notices, 1);
  assert.equal((await controller.create(input, { headers: {} })).id, 'interest'); assert.equal(notices, 1);
  await assert.rejects(controller.create({ ...input, tariffSlug: 'another' }, { headers: {} }), /Ключ отправки/);
});
test('DTO permits missing city only for consultation; callback cannot weaken connection city gate', async () => {
  const pipe=createGlobalValidationPipe(); const metadata={type:'body',metatype:CreateLeadDto,data:undefined};
  assert.equal((await pipe.transform(body,metadata)).reasonCode,'callback_consultation');
  for(const reasonCode of ['new_connection','other',undefined]) await assert.rejects(pipe.transform({...body,reasonCode},metadata),error=>error.getStatus()===400);
  await assert.rejects(pipe.transform({...body,citySlug:null},metadata),error=>error.getStatus()===400);
  await assert.rejects(pipe.transform({...body,consentAccepted:false},metadata),error=>error.getStatus()===400);
  await assert.rejects(fixture().controller.create({...body,reasonCode:'new_connection'},{headers:{}}),/Телефон и город обязательны/);
  await assert.rejects(fixture().controller.create({...body,citySlug:'kazan',reasonCode:'new_connection'},{headers:{}}),/после положительной проверки адреса/);
});

test('operator notification retains the serving tariff and city names when working rows differ', async t => {
  const { createHash } = require('node:crypto');
  const { LeadNotificationOutboxService } = require('../apps/api/dist/lead-notification-outbox.service.js');
  const previous = Object.fromEntries(['REBUILD_PROVIDER','ADMIN_API_TOKEN','STATIC_PUBLICATION_URL','REDIS_URL'].map(key => [key, process.env[key]])), previousFetch = global.fetch;
  t.after(() => { global.fetch = previousFetch; for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  Object.assign(process.env, { REBUILD_PROVIDER: 'static', ADMIN_API_TOKEN: 'synthetic', STATIC_PUBLICATION_URL: 'http://synthetic.invalid' }); delete process.env.REDIS_URL;
  const tariff = { id: 'tariff1', slug: 'internet-500', name: 'Тариф на обслуживаемой странице', serviceType: 'INTERNET' };
  const city = { id: 'city1', slug: 'kazan', name: 'Казань', region: { name: 'Татарстан', slug: 'tatarstan' }, pages: [], tariffs: [tariff] };
  const catalog = { site: { slug: 'domru-site' }, cities: [city] }, publication = { id: 'pub1', siteId: 'site1', siteRevision: 1, status: 'SUCCEEDED', catalog };
  global.fetch = async () => Response.json({ publicationId: 'pub1', siteId: 'site1', siteSlug: 'domru-site', siteRevision: 1, catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') });
  const workingTariff = { ...tariff, name: 'Неопубликованное новое название', cityId: city.id };
  let saved, delivered;
  const prisma = { sitePublication: { findUnique: async () => publication }, tariff: { findFirst: async () => workingTariff }, lead: { findUnique: async () => null, findMany: async () => [] },
    $transaction: async fn => fn({ lead: { create: async ({ data }) => { saved = { ...data, id: 'lead1', status: 'NEW' }; return saved; } }, leadDecisionEvent: { create: async () => ({}) } }) };
  await new PublicLeadsController(prisma, { enqueueTracked: async () => assert.fail('manual route') }, { create: async () => ({ id: 'notice1' }), enqueueTracked: async () => {} }).create({ ...body, citySlug: city.slug, tariffSlug: tariff.slug }, { headers: {} });
  const outbox = new LeadNotificationOutboxService({ leadNotification: { findUnique: async () => ({ id: 'notice1', status: 'QUEUED', revision: 1, attempts: 0, maxAttempts: 3, lead: { ...saved, city: { ...city, name: 'Неопубликованный город' }, tariff: workingTariff } }), updateMany: async () => ({ count: 1 }) } }, { notifyLead: async value => { delivered = value; return { transport: 'webhook' }; } });
  await outbox.process('notice1', 1, 3, 1);
  assert.equal(delivered.tariff, tariff.name); assert.equal(delivered.city, city.name);
  assert.deepEqual(saved.attributionSnapshot.callbackInterest, { version: 1, tariffName: tariff.name, cityName: city.name });
  assert.equal(saved.configurationSnapshot, undefined);
});

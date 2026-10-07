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
  for(const extra of [{consentAccepted:false},{consentAccepted:undefined},{address:'Адрес'},{addressCheckId:'check'},{tariffSlug:'tariff'},{pageSlug:'home'},{serviceType:'INTERNET'}]) await assert.rejects(fixture().controller.create({...body,...extra},{headers:{}}),/подтвердите согласие/);
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

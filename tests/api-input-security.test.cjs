const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AddressChecksController } = require('../apps/api/dist/address-checks.controller.js');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');
const {
  createGlobalValidationPipe,
  rateLimitBucketForPath,
  rateLimitForPath,
  rateLimitKeyForRequest,
} = require('../apps/api/dist/security-options.js');
const { LoginDto, AddressCheckDto, AddressSuggestionsDto, CreateLeadDto, ConsumeLeadAccessDto } = require('../apps/api/dist/public.dto.js');

const metadata = (metatype) => ({ type: 'body', metatype, data: undefined });

test('global security options enforce strict DTOs and tighter public write limits', async () => {
  assert.equal(rateLimitForPath('/api/v1/auth/login'), 5);
  assert.equal(rateLimitForPath('/api/v1/address-checks'), 10);
  assert.equal(rateLimitForPath('/api/v1/address-suggestions'), 60);
  assert.equal(rateLimitForPath('/api/v1/leads'), 10);
  assert.equal(rateLimitForPath('/api/v1/admin/tariffs'), 300);

  const pipe = createGlobalValidationPipe();
  const login = await pipe.transform({ email: 'admin@example.test', password: 'short' }, metadata(LoginDto));
  assert.equal(login.email, 'admin@example.test');
  assert.equal(login.password, 'short');
  assert.deepEqual(Object.keys(login).sort(), ['email', 'password']);
  const access = await pipe.transform({ token: 'invalid-format' }, metadata(ConsumeLeadAccessDto));
  assert.equal(access.token, 'invalid-format');
  assert.deepEqual(Object.keys(access), ['token']);
  await assert.rejects(
    pipe.transform({ email: 'admin@example.test', password: 'long-enough-password', role: 'SUPERADMIN' }, metadata(LoginDto)),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    pipe.transform({ address: 'Казань, Баумана, 1', citySlug: 'kazan', website: 'spam.example' }, metadata(AddressCheckDto)),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    pipe.transform({ query: 'а'.repeat(301), citySlug: 'kazan' }, metadata(AddressSuggestionsDto)),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    pipe.transform({ citySlug: 'kazan', phone: '+7 900 000-00-00', viewedPages: Array.from({ length: 51 }, (_, index) => `/${index}`) }, metadata(CreateLeadDto)),
    (error) => error.getStatus() === 400,
  );
});

test('lead telemetry is allowlisted and bounded before the controller runs', async () => {
  const pipe = createGlobalValidationPipe();
  const base = { citySlug: 'kazan', phone: '+7 900 000-00-00' };

  const valid = await pipe.transform({
    ...base,
    utm: { utm_source: 'search', utm_campaign: 'kazan' },
    activity: [{ type: 'tariff_view', data: { tariff: 'internet-300', position: 2 } }],
  }, metadata(CreateLeadDto));
  assert.equal(valid.utm.utm_source, 'search');
  assert.equal(valid.activity[0].type, 'tariff_view');

  for (const telemetry of [
    { utm: { arbitrary_tracking_id: 'not-allowlisted' } },
    { activity: [{ type: 'tariff_view', extra: 'not-allowlisted' }] },
    { activity: [{ type: 'x'.repeat(121) }] },
    { activity: [{ type: 'tariff_view', data: { nested: { too: { deep: true } } } }] },
    { activity: [{ type: 'tariff_view', data: { value: 'x'.repeat(4_100) } }] },
    { viewedPages: Array.from({ length: 10 }, (_, index) => `/${index}/${'x'.repeat(2_000)}`) },
    { activity: Array.from({ length: 100 }, (_, index) => ({ type: `event_${index}`, data: { value: 'x'.repeat(700) } })) },
  ]) {
    await assert.rejects(
      pipe.transform({ ...base, ...telemetry }, metadata(CreateLeadDto)),
      (error) => error.getStatus() === 400,
    );
  }
});

test('rate-limit counters are isolated by route purpose while query strings share a bucket', () => {
  assert.equal(rateLimitBucketForPath('/api/v1/address-suggestions?query=test'), 'address-suggestions');
  assert.equal(rateLimitBucketForPath('/api/v1/address-checks'), 'address-checks');
  assert.equal(rateLimitBucketForPath('/api/v1/leads'), 'leads');
  assert.equal(rateLimitBucketForPath('/api/v1/lead-access/token'), 'lead-access');
  assert.equal(rateLimitBucketForPath('/api/v1/admin/tariffs'), 'default');

  const suggestionKey = rateLimitKeyForRequest('/api/v1/address-suggestions', '::ffff:192.0.2.10');
  assert.equal(suggestionKey, '192.0.2.10:address-suggestions');
  assert.equal(
    rateLimitKeyForRequest('/api/v1/address-suggestions?query=next', '::ffff:192.0.2.10'),
    suggestionKey,
  );
  assert.notEqual(rateLimitKeyForRequest('/api/v1/leads', '::ffff:192.0.2.10'), suggestionKey);
});

test('honeypot is rejected before public controllers query data or call integrations', async () => {
  const never = async () => assert.fail('dependency called for honeypot request');
  const address = new AddressChecksController({ check: never }, { site: { findUnique: never } });
  await assert.rejects(address.check({ address: 'Казань, Баумана, 1', citySlug: 'kazan', website: 'spam.example' }), /Некорректный запрос/);

  const leads = new PublicLeadsController(
    { site: { findFirst: never } },
    { notifyLead: never },
    { check: never },
    { enqueue: never },
  );
  await assert.rejects(leads.create({ citySlug: 'kazan', phone: '+7 900 000-00-00', website: 'spam.example' }, { headers: {} }), /Некорректный запрос/);
});

test('API bootstrap registers the global validation pipe and patched Fastify rate limiter', () => {
  const source = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'main.ts'), 'utf8');
  const productionCompose = readFileSync(join(__dirname, '..', 'docker-compose.prod.yml'), 'utf8');
  assert.match(source, /useGlobalPipes\(createGlobalValidationPipe\(\)\)/);
  assert.match(source, /register\(fastifyRateLimit/);
  assert.match(source, /keyGenerator:\s*\(request\)\s*=>\s*rateLimitKeyForRequest\(request\.url, request\.ip\)/);
  assert.match(source, /skipOnError:\s*false/);
  assert.match(source, /trustProxy:/);
  assert.match(productionCompose, /api:[\s\S]*?TRUST_PROXY:\s*["']true["']/);
});

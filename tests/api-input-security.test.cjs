const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AddressChecksController } = require('../apps/api/dist/address-checks.controller.js');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller.js');
const { createGlobalValidationPipe, rateLimitForPath } = require('../apps/api/dist/security-options.js');
const { LoginDto, AddressCheckDto, CreateLeadDto, ConsumeLeadAccessDto } = require('../apps/api/dist/public.dto.js');

const metadata = (metatype) => ({ type: 'body', metatype, data: undefined });

test('global security options enforce strict DTOs and tighter public write limits', async () => {
  assert.equal(rateLimitForPath('/api/v1/auth/login'), 5);
  assert.equal(rateLimitForPath('/api/v1/address-checks'), 10);
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
    pipe.transform({ citySlug: 'kazan', phone: '+7 900 000-00-00', viewedPages: Array.from({ length: 51 }, (_, index) => `/${index}`) }, metadata(CreateLeadDto)),
    (error) => error.getStatus() === 400,
  );
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
  assert.match(source, /skipOnError:\s*false/);
  assert.match(source, /trustProxy:/);
  assert.match(productionCompose, /api:[\s\S]*?TRUST_PROXY:\s*["']true["']/);
});

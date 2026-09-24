const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('session snapshot uses server transport metadata, bounded time and sanitized URLs', () => {
  const { buildLeadAttribution } = require('../apps/api/dist/lead-attribution.js');
  const now = new Date('2026-09-25T00:10:00.000Z');
  const body = {
    pageUrl: 'https://example.test/kazan?secret=hidden', deviceType: 'tablet',
    session: {
      firstTouch: { url: 'https://example.test/?utm_source=search&secret=hidden#part', referrer: 'https://search.test/?q=private', utm: { utm_source: 'search' } },
      lastTouch: { url: 'https://example.test/kazan?utm_campaign=demo&secret=hidden', referrer: 'https://example.test/', utm: { utm_campaign: 'demo' } },
      startedAt: '2026-09-25T00:08:00.000Z', viewedPages: ['/', '/kazan', '/', '//invalid'],
    },
  };
  const result = buildLeadAttribution(body, { ip: '203.0.113.7', headers: { 'user-agent': 'Mozilla/5.0 (iPad)' } }, now);
  assert.equal(result.snapshot.capture, 'browser_session');
  assert.equal(result.snapshot.ipAddress, '203.0.113.7');
  assert.equal(result.snapshot.userAgent, 'Mozilla/5.0 (iPad)');
  assert.equal(result.snapshot.deviceType, 'tablet');
  assert.equal(result.snapshot.timeOnSiteSeconds, 120);
  assert.equal(result.snapshot.firstTouch.url, 'https://example.test/?utm_source=search');
  assert.equal(result.snapshot.firstTouch.referrer, 'https://search.test/');
  assert.equal(result.snapshot.lastTouch.url, 'https://example.test/kazan?utm_campaign=demo');
  assert.deepEqual(result.snapshot.viewedPages, ['/', '/kazan']);
  assert.equal(result.legacy.pageUrl, result.snapshot.lastTouch.url);
  assert.deepEqual(result.legacy.utm, { utm_campaign: 'demo' });
});

test('API fallback does not accept claimed IP or device from the lead body', () => {
  const { buildLeadAttribution } = require('../apps/api/dist/lead-attribution.js');
  const result = buildLeadAttribution({ pageUrl: 'https://example.test/', deviceType: 'mobile', ipAddress: '192.0.2.1' },
    { ip: 'not-an-ip', headers: {} }, new Date('2026-09-25T00:10:00.000Z'));
  assert.equal(result.snapshot.capture, 'api_fallback');
  assert.equal(result.snapshot.ipAddress, null);
  assert.equal(result.snapshot.userAgent, null);
  assert.equal(result.snapshot.deviceType, 'unknown');
  assert.equal(result.snapshot.firstTouch.url, 'https://example.test/');
});

test('public DTO rejects client IP/User-Agent spoofing and oversized session context', async () => {
  require('../apps/api/dist/public-leads.controller.js');
  const { CreateLeadDto } = require('../apps/api/dist/public.dto.js');
  const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');
  const pipe = createGlobalValidationPipe();
  const metadata = { type: 'body', metatype: CreateLeadDto, data: undefined };
  const base = { citySlug: 'kazan', phone: '+79000000000', submissionKey: '11111111-1111-4111-8111-111111111111', consentVersion: 'lead-form-v1-2026-09-22' };
  const session = { firstTouch: { url: 'https://example.test/' }, lastTouch: { url: 'https://example.test/kazan' }, startedAt: '2026-09-25T00:08:00.000Z', viewedPages: ['/', '/kazan'] };
  assert.equal((await pipe.transform({ ...base, session }, metadata)).session.firstTouch.url, session.firstTouch.url);
  for (const invalid of [
    { ...base, ipAddress: '192.0.2.1' },
    { ...base, userAgent: 'forged' },
    { ...base, session: { ...session, ipAddress: '192.0.2.1' } },
    { ...base, session: { ...session, firstTouch: { ...session.firstTouch, utm: { utm_password: 'secret' } } } },
    { ...base, session: { ...session, viewedPages: Array.from({ length: 51 }, (_, i) => `/${i}`) } },
  ]) await assert.rejects(pipe.transform(invalid, metadata), (error) => error.getStatus() === 400);
});

test('nullable attribution migration preserves historical leads and purge deletes the whole lead', () => {
  const root = join(__dirname, '..');
  const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(join(root, 'prisma/migrations/0051_lead_attribution_snapshot/migration.sql'), 'utf8');
  const purge = readFileSync(join(root, 'apps/api/src/pii-retention.service.ts'), 'utf8');
  assert.match(schema, /attributionSnapshot\s+Json\?/);
  assert.match(migration, /ALTER TABLE "Lead" ADD COLUMN "attributionSnapshot" JSONB/);
  assert.doesNotMatch(migration, /UPDATE "Lead"|NOT NULL/);
  assert.match(purge, /lead\.deleteMany/);
});

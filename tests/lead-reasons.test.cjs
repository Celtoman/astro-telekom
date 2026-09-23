const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('closed reason registry returns immutable v1 code, label and routing snapshots', () => {
  const { LEAD_REASONS, classifyLeadReason } = require('../apps/api/dist/lead-reasons.js');
  assert.deepEqual(LEAD_REASONS.map(({ code }) => code), [
    'new_connection', 'existing_subscriber_support', 'billing', 'relocation', 'other',
  ]);
  assert.equal(classifyLeadReason(undefined), null);
  assert.equal(classifyLeadReason('new_connection').route, 'SALES');
  assert.equal(classifyLeadReason('billing').route, 'NON_SALES');
  assert.equal(classifyLeadReason('other').route, 'MANUAL');
  assert.equal(classifyLeadReason('billing').label, 'Оплата');
  assert.equal(classifyLeadReason('billing').version, 1);
  assert.equal(classifyLeadReason('domofon'), null);
  assert.equal(classifyLeadReason(''), null);
});

test('reason snapshot migration is additive and leaves historical leads untouched', () => {
  const root = join(__dirname, '..');
  const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
  const migration = readFileSync(join(root, 'prisma', 'migrations', '0043_lead_reason_snapshot', 'migration.sql'), 'utf8');
  for (const field of ['reasonCode', 'reasonLabel', 'reasonRoute', 'reasonRegistryVersion']) {
    assert.match(schema, new RegExp(`${field}\\s+(?:String|Int)\\?`));
    assert.match(migration, new RegExp(`ADD COLUMN "${field}"`));
  }
  assert.match(schema, /NON_SALES_NOT_SENT/);
  assert.doesNotMatch(migration, /UPDATE "Lead"|NOT NULL/);
});

test('public DTO accepts only known reason codes', async () => {
  require('../apps/api/dist/public-leads.controller.js');
  const { CreateLeadDto } = require('../apps/api/dist/public.dto.js');
  const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');
  const pipe = createGlobalValidationPipe();
  const metadata = { type: 'body', metatype: CreateLeadDto, data: undefined };
  const body = { citySlug: 'kazan', phone: '+79000000000', submissionKey: '11111111-1111-4111-8111-111111111111', consentVersion: 'lead-form-v1-2026-09-22' };
  assert.equal((await pipe.transform({ ...body, reasonCode: 'billing' }, metadata)).reasonCode, 'billing');
  await assert.rejects(pipe.transform({ ...body, reasonCode: 'domofon' }, metadata), (error) => error.getStatus() === 400);
});

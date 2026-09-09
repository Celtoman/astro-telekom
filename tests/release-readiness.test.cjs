const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AdminReadinessController } = require('../apps/api/dist/admin-readiness.controller.js');
const { ReleaseReadinessService } = require('../apps/api/dist/release-readiness.service.js');

const integrationVariables = [
  'DOMRU_COVERAGE_API_URL',
  'DOMRU_COVERAGE_API_KEY',
  'DOMRU_CONTRACT_API_URL',
  'DOMRU_CONTRACT_API_KEY',
  'TARIFNIK_API_URL',
  'TARIFNIK_API_KEY',
  'LEADS_EMAIL',
  'RESEND_API_KEY',
  'LEADS_EMAIL_WEBHOOK_URL',
  'REBUILD_WEBHOOK_URL',
  'PII_RETENTION_DAYS',
];

async function withEnvironment(values, callback) {
  const previous = Object.fromEntries(integrationVariables.map((name) => [name, process.env[name]]));
  try {
    for (const name of integrationVariables) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    await callback();
  } finally {
    for (const name of integrationVariables) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('release readiness reports missing integration configuration without exposing values', async () => {
  await withEnvironment({
    DOMRU_COVERAGE_API_URL: 'https://coverage.secret.test',
    DOMRU_COVERAGE_API_KEY: 'coverage-secret',
    TARIFNIK_API_URL: 'https://tarifnik.secret.test',
    TARIFNIK_API_KEY: 'tarifnik-secret',
    LEADS_EMAIL: 'operator@secret.test',
  }, async () => {
    const result = new ReleaseReadinessService().configuration();
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.checks.coverage, { status: 'configured', missing: [] });
    assert.deepEqual(result.checks.contract, {
      status: 'missing',
      missing: ['DOMRU_CONTRACT_API_URL', 'DOMRU_CONTRACT_API_KEY'],
    });
    assert.deepEqual(result.checks.fallbackEmail, {
      status: 'missing',
      missing: ['RESEND_API_KEY|LEADS_EMAIL_WEBHOOK_URL'],
    });
    assert.deepEqual(result.checks.piiRetention, {
      status: 'missing',
      missing: ['PII_RETENTION_DAYS'],
    });
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /coverage-secret|tarifnik-secret|operator@secret\.test|secret\.test/);
  });
});

test('release readiness becomes configured only when every required integration has a transport', async () => {
  await withEnvironment({
    DOMRU_COVERAGE_API_URL: 'https://coverage.example.test',
    DOMRU_COVERAGE_API_KEY: 'coverage-key',
    DOMRU_CONTRACT_API_URL: 'https://contract.example.test',
    DOMRU_CONTRACT_API_KEY: 'contract-key',
    TARIFNIK_API_URL: 'https://tarifnik.example.test',
    TARIFNIK_API_KEY: 'tarifnik-key',
    LEADS_EMAIL: 'operator@example.test',
    LEADS_EMAIL_WEBHOOK_URL: 'https://mail.example.test',
    REBUILD_WEBHOOK_URL: 'https://deploy.example.test',
    PII_RETENTION_DAYS: '30',
  }, async () => {
    const result = new ReleaseReadinessService().configuration();
    assert.equal(result.status, 'configured');
    assert.ok(Object.values(result.checks).every((check) => check.status === 'configured'));
  });
});

test('admin readiness endpoint is authenticated and delegates sanitized configuration status', () => {
  const expected = { status: 'blocked', checks: {} };
  const controller = new AdminReadinessController({ configuration: () => expected });
  assert.equal(controller.getReadiness(), expected);
  const source = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'admin-readiness.controller.ts'), 'utf8');
  assert.match(source, /@UseGuards\(AdminTokenGuard\)/);
});

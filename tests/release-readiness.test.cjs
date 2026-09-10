const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AdminReadinessController } = require('../apps/api/dist/admin-readiness.controller.js');
const { ReleaseReadinessService } = require('../apps/api/dist/release-readiness.service.js');

const integrationVariables = [
  'DADATA_TOKEN',
  'DADATA_SECRET',
  'DADATA_SUGGEST_API_URL',
  'DADATA_CLEAN_API_URL',
  'TARIFNIK_ADDRESS_CHECK_API_URL',
  'TARIFNIK_TARGET_PROVIDER_ID',
  'DOMRU_CONTRACT_API_URL',
  'DOMRU_CONTRACT_CITY',
  'DOMRU_CONTRACT_ORIGIN',
  'DOMRU_CONTRACT_PROVIDER_ID',
  'DOMRU_CONTRACT_REFERER',
  'TARIFNIK_API_URL',
  'TARIFNIK_API_KEY',
  'TARIFNIK_UTM_CAMPAIGN',
  'LEADS_EMAIL',
  'RESEND_API_KEY',
  'LEADS_EMAIL_WEBHOOK_URL',
  'REBUILD_PROVIDER',
  'REBUILD_WEBHOOK_URL',
  'COOLIFY_API_URL',
  'COOLIFY_API_TOKEN',
  'COOLIFY_RESOURCE_UUID',
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
    DADATA_TOKEN: 'dadata-token',
    DADATA_SECRET: 'dadata-secret',
    DADATA_SUGGEST_API_URL: 'https://suggestions.example.test',
    DADATA_CLEAN_API_URL: 'https://cleaner.example.test',
    TARIFNIK_ADDRESS_CHECK_API_URL: 'https://coverage.secret.test',
    TARIFNIK_TARGET_PROVIDER_ID: '8',
    TARIFNIK_API_URL: 'https://tarifnik.secret.test',
    TARIFNIK_API_KEY: 'tarifnik-secret',
    TARIFNIK_UTM_CAMPAIGN: 'test',
    LEADS_EMAIL: 'operator@secret.test',
  }, async () => {
    const result = new ReleaseReadinessService().configuration();
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.checks.coverage, { status: 'configured', missing: [] });
    assert.deepEqual(result.checks.contract, {
      status: 'missing',
      missing: ['DOMRU_CONTRACT_API_URL'],
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
    DADATA_TOKEN: 'dadata-token',
    DADATA_SECRET: 'dadata-secret',
    DADATA_SUGGEST_API_URL: 'https://suggestions.example.test',
    DADATA_CLEAN_API_URL: 'https://cleaner.example.test',
    TARIFNIK_ADDRESS_CHECK_API_URL: 'https://coverage.example.test',
    TARIFNIK_TARGET_PROVIDER_ID: '8',
    DOMRU_CONTRACT_API_URL: 'https://contract.example.test',
    TARIFNIK_API_URL: 'https://tarifnik.example.test',
    TARIFNIK_API_KEY: 'tarifnik-key',
    TARIFNIK_UTM_CAMPAIGN: 'test',
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

test('release readiness requires both DaData endpoints and credentials for address normalization', async () => {
  await withEnvironment({
    DADATA_TOKEN: 'dadata-token',
    DADATA_SUGGEST_API_URL: 'https://suggestions.example.test',
    DADATA_CLEAN_API_URL: 'https://cleaner.example.test',
    TARIFNIK_ADDRESS_CHECK_API_URL: 'https://coverage.example.test',
    TARIFNIK_TARGET_PROVIDER_ID: '8',
    TARIFNIK_API_URL: 'https://tarifnik.example.test',
    TARIFNIK_API_KEY: 'tarifnik-key',
    TARIFNIK_UTM_CAMPAIGN: 'test',
    DOMRU_CONTRACT_API_URL: 'https://contract.example.test',
    LEADS_EMAIL: 'operator@example.test',
    LEADS_EMAIL_WEBHOOK_URL: 'https://mail.example.test',
    REBUILD_WEBHOOK_URL: 'https://deploy.example.test',
    PII_RETENTION_DAYS: '30',
  }, async () => {
    const result = new ReleaseReadinessService().configuration();
    assert.deepEqual(result.checks.coverage, { status: 'missing', missing: ['DADATA_SECRET'] });
    assert.equal(result.status, 'blocked');
  });
});

test('release readiness accepts a complete Coolify provider without a legacy webhook', async () => {
  await withEnvironment({
    DADATA_TOKEN: 'dadata-token',
    DADATA_SECRET: 'dadata-secret',
    DADATA_SUGGEST_API_URL: 'https://suggestions.example.test',
    DADATA_CLEAN_API_URL: 'https://cleaner.example.test',
    TARIFNIK_ADDRESS_CHECK_API_URL: 'https://coverage.example.test',
    TARIFNIK_TARGET_PROVIDER_ID: '8',
    DOMRU_CONTRACT_API_URL: 'https://contract.example.test',
    TARIFNIK_API_URL: 'https://tarifnik.example.test',
    TARIFNIK_API_KEY: 'tarifnik-key',
    TARIFNIK_UTM_CAMPAIGN: 'test',
    LEADS_EMAIL: 'operator@example.test',
    RESEND_API_KEY: 'resend-key',
    REBUILD_PROVIDER: 'coolify',
    COOLIFY_API_URL: 'https://coolify.example.test/api/v1',
    COOLIFY_API_TOKEN: 'coolify-secret',
    COOLIFY_RESOURCE_UUID: 'resource-uuid',
    PII_RETENTION_DAYS: '30',
  }, async () => {
    const result = new ReleaseReadinessService().configuration();
    assert.equal(result.status, 'configured');
    assert.deepEqual(result.checks.rebuild, { status: 'configured', missing: [] });
    assert.doesNotMatch(JSON.stringify(result), /coolify-secret|resource-uuid|coolify\.example\.test/);
  });
});

test('admin readiness endpoint is authenticated and delegates sanitized configuration status', () => {
  const expected = { status: 'blocked', checks: {} };
  const controller = new AdminReadinessController({ configuration: () => expected });
  assert.equal(controller.getReadiness(), expected);
  const source = readFileSync(join(__dirname, '..', 'apps', 'api', 'src', 'admin-readiness.controller.ts'), 'utf8');
  assert.match(source, /@UseGuards\(AdminTokenGuard\)/);
});

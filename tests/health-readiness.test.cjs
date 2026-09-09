const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { HealthController } = require('../apps/api/dist/health.controller.js');
const { HealthService } = require('../apps/api/dist/health.service.js');

const repositoryRoot = join(__dirname, '..');

test('liveness is process-only while health and readiness require dependencies', async () => {
  const calls = [];
  const controller = new HealthController({
    readiness: async () => {
      calls.push('readiness');
      return { status: 'ok', service: 'api', checks: { database: 'up', redis: 'up' } };
    },
  });

  assert.deepEqual(controller.getLiveness(), { status: 'ok', service: 'api' });
  assert.deepEqual(await controller.getHealth(), { status: 'ok', service: 'api', checks: { database: 'up', redis: 'up' } });
  assert.deepEqual(await controller.getReadiness(), { status: 'ok', service: 'api', checks: { database: 'up', redis: 'up' } });
  assert.deepEqual(calls, ['readiness', 'readiness']);

  const unavailable = new HealthController({
    readiness: async () => ({ status: 'error', service: 'api', checks: { database: 'down', redis: 'up' } }),
  });
  await assert.rejects(unavailable.getReadiness(), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.deepEqual(error.getResponse(), { status: 'error', service: 'api', checks: { database: 'down', redis: 'up' } });
    return true;
  });
});

test('readiness returns only sanitized dependency states', async () => {
  const service = new HealthService({ $queryRaw: async () => [{ ready: 1 }] });
  service.pingRedis = async () => 'PONG';
  assert.deepEqual(await service.readiness(), {
    status: 'ok',
    service: 'api',
    checks: { database: 'up', redis: 'up' },
  });

  service.pingRedis = async () => { throw new Error('redis://secret-host:6379 refused'); };
  assert.deepEqual(await service.readiness(), {
    status: 'error',
    service: 'api',
    checks: { database: 'up', redis: 'down' },
  });
});

test('deployment Compose applies migrations and preserves a reproducible Coolify publication order', () => {
  const compose = readFileSync(join(repositoryRoot, 'docker-compose.prod.yml'), 'utf8');
  const coolifyCompose = readFileSync(join(repositoryRoot, 'docker-compose.coolify.yml'), 'utf8');
  const webDockerfile = readFileSync(join(repositoryRoot, 'apps', 'web', 'Dockerfile'), 'utf8');
  const publishScript = readFileSync(join(repositoryRoot, 'apps', 'web', 'scripts', 'publish-static.sh'), 'utf8');
  const coolifyWebCaddy = readFileSync(join(repositoryRoot, 'deploy', 'coolify-web.Caddyfile'), 'utf8');
  const adminCaddy = readFileSync(join(repositoryRoot, 'deploy', 'static.Caddyfile'), 'utf8');
  const siteDataSource = readFileSync(join(repositoryRoot, 'apps', 'web', 'src', 'data', 'site.ts'), 'utf8');
  assert.match(compose, /^  migrate:\r?$/m);
  assert.match(compose, /migrate:\s+condition: service_completed_successfully/);
  assert.match(compose, /fetch\('http:\/\/localhost:3000\/api\/v1\/health\/ready'\)/);
  assert.match(compose, /node_modules\/prisma\/build\/index\.js["']?,\s*["']migrate["']?,\s*["']deploy/);
  assert.match(compose, /PUBLIC_API_URL:\s*https:\/\/\$\{API_DOMAIN\}\/api\/v1/);
  assert.match(compose, /SITE_DATA_API_URL:\s*\$\{SITE_DATA_API_URL\}/);
  assert.match(siteDataSource, /import\.meta\.env\.SITE_DATA_API_URL\s*\|\|\s*import\.meta\.env\.PUBLIC_API_URL/);

  assert.doesNotMatch(coolifyCompose, /(?:^|\n)\s+ports:\s*\n\s+- ["']?(?:80|443):/);
  assert.match(coolifyCompose, /bootstrap-seed:[\s\S]*RUN_BOOTSTRAP_SEED:\s*\$\{RUN_BOOTSTRAP_SEED:\?[^}]+\}[\s\S]*node \/app\/dist\/seed\.js/);
  assert.match(coolifyCompose, /bootstrap-seed:\s+condition:\s*service_completed_successfully/);
  assert.match(coolifyCompose, /web-publish:[\s\S]*target:\s*publisher[\s\S]*SITE_DATA_API_URL:\s*http:\/\/api:3000\/api\/v1/);
  assert.match(coolifyCompose, /web-publish:\s+condition:\s*service_completed_successfully/);
  assert.match(coolifyCompose, /REBUILD_PROVIDER:\s*\$\{REBUILD_PROVIDER:-coolify\}/);
  assert.match(coolifyCompose, /COOLIFY_API_TOKEN:\s*\$\{COOLIFY_API_TOKEN:\?[^}]+\}/);
  assert.match(coolifyCompose, /PUBLIC_API_URL:\s*https:\/\/\$\{PUBLIC_DOMAIN[^}]*\}\/api\/v1/);
  assert.match(coolifyCompose, /PUBLIC_API_URL:\s*https:\/\/\$\{ADMIN_DOMAIN[^}]*\}\/api\/v1/);
  assert.equal((coolifyCompose.match(/coolify\.traefik\.middlewares=test-basic-auth/g) || []).length, 2);
  assert.equal((coolifyCompose.match(/basicauth\.users=\$\{TEST_BASIC_AUTH_USERS:\?[^}]+\}/g) || []).length, 2);
  assert.doesNotMatch(coolifyCompose, /basicauth\.users=(?!\$\{TEST_BASIC_AUTH_USERS)/);
  assert.match(webDockerfile, /FROM source AS publisher/);
  assert.match(publishScript, /pnpm --filter @provider\/web run build[\s\S]*ln -s[\s\S]*mv -f/);
  assert.match(coolifyWebCaddy, /handle \/api\/\*[\s\S]*reverse_proxy \{\$API_UPSTREAM:api:3000\}/);
  assert.match(adminCaddy, /handle \/api\/\*[\s\S]*reverse_proxy \{\$API_UPSTREAM:api:3000\}/);
  assert.match(adminCaddy, /X-Robots-Tag "noindex, nofollow, noarchive"/);
});

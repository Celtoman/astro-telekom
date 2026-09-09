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
  const workerDockerfile = readFileSync(join(repositoryRoot, 'services', 'worker', 'Dockerfile'), 'utf8');
  const workerHealthcheck = readFileSync(join(repositoryRoot, 'services', 'worker', 'src', 'healthcheck.mjs'), 'utf8');
  const siteDataSource = readFileSync(join(repositoryRoot, 'apps', 'web', 'src', 'data', 'site.ts'), 'utf8');
  assert.match(compose, /^  migrate:\r?$/m);
  assert.match(compose, /migrate:\s+condition: service_completed_successfully/);
  assert.match(compose, /fetch\('http:\/\/localhost:3000\/api\/v1\/health\/ready'\)/);
  assert.match(compose, /node_modules\/prisma\/build\/index\.js["']?,\s*["']migrate["']?,\s*["']deploy/);
  assert.match(compose, /PUBLIC_API_URL:\s*https:\/\/\$\{API_DOMAIN\}\/api\/v1/);
  assert.match(compose, /SITE_DATA_API_URL:\s*\$\{SITE_DATA_API_URL\}/);
  assert.match(siteDataSource, /import\.meta\.env\.SITE_DATA_API_URL\s*\|\|\s*import\.meta\.env\.PUBLIC_API_URL/);

  assert.doesNotMatch(coolifyCompose, /(?:^|\n)\s+ports:\s*\n\s+- ["']?(?:80|443):/);
  assert.match(coolifyCompose, /bootstrap-seed:[\s\S]*RUN_BOOTSTRAP_SEED:\s*\$\{RUN_BOOTSTRAP_SEED:\?[^}]+\}[\s\S]*node \/workspace\/apps\/api\/dist\/seed\.js/);
  assert.match(coolifyCompose, /bootstrap-seed:\s+condition:\s*service_completed_successfully/);
  assert.match(coolifyCompose, /web-publish:[\s\S]*target:\s*publisher[\s\S]*SITE_DATA_API_URL:\s*http:\/\/api:3000\/api\/v1/);
  assert.match(coolifyCompose, /web-publish:\s+condition:\s*service_completed_successfully/);
  for (const service of ['migrate', 'bootstrap-seed', 'web-publish']) {
    assert.match(
      coolifyCompose,
      new RegExp(`${service}:[\\s\\S]*?exclude_from_hc:\\s*true[\\s\\S]*?restart:\\s*["']no["']`),
      `${service} must be explicitly excluded from Coolify application health`,
    );
  }
  assert.equal((coolifyCompose.match(/exclude_from_hc:\s*true/g) || []).length, 3);
  for (const service of ['web', 'admin']) {
    assert.match(
      coolifyCompose,
      new RegExp(`${service}:[\\s\\S]*?healthcheck:[\\s\\S]*?wget[\\s\\S]*?http://127\\.0\\.0\\.1/`),
      `${service} must verify its local Caddy response`,
    );
  }
  assert.match(coolifyCompose, /worker:[\s\S]*?healthcheck:[\s\S]*?node[\s\S]*?services\/worker\/src\/healthcheck\.mjs/);
  assert.match(workerHealthcheck, /new IORedis\(redisUrl/);
  assert.match(workerHealthcheck, /await redis\.ping\(\)/);
  assert.match(coolifyCompose, /REBUILD_PROVIDER:\s*\$\{REBUILD_PROVIDER:-coolify\}/);
  assert.match(coolifyCompose, /worker:[\s\S]*?env_file:\s*\$\{ENV_FILE:-\.env\}/);
  assert.doesNotMatch(coolifyCompose, /COOLIFY_API_TOKEN:\s*\$\{COOLIFY_API_TOKEN/);
  assert.match(coolifyCompose, /PUBLIC_API_URL:\s*https:\/\/\$\{PUBLIC_DOMAIN[^}]*\}\/api\/v1/);
  assert.match(coolifyCompose, /PUBLIC_API_URL:\s*https:\/\/\$\{ADMIN_DOMAIN[^}]*\}\/api\/v1/);
  assert.equal((coolifyCompose.match(/coolify\.traefik\.middlewares=test-basic-auth/g) || []).length, 2);
  assert.equal((coolifyCompose.match(/basicauth\.users=\$\{TEST_BASIC_AUTH_USERS:\?[^}]+\}/g) || []).length, 2);
  assert.doesNotMatch(coolifyCompose, /basicauth\.users=(?!\$\{TEST_BASIC_AUTH_USERS)/);
  assert.match(webDockerfile, /sh scripts\/pnpm-install-retry\.sh --filter @provider\/web --frozen-lockfile --trust-lockfile/);
  assert.match(webDockerfile, /FROM web-deps AS publisher/);
  assert.match(workerDockerfile, /sh scripts\/pnpm-install-retry\.sh --filter @provider\/worker --prod --frozen-lockfile --trust-lockfile/);
  assert.doesNotMatch(workerDockerfile, /pnpm install --frozen-lockfile/);
  assert.match(publishScript, /pnpm --filter @provider\/web run build[\s\S]*ln -s[\s\S]*mv -f/);
  assert.match(coolifyWebCaddy, /handle \/api\/\*[\s\S]*reverse_proxy \{\$API_UPSTREAM:api:3000\}/);
  assert.match(adminCaddy, /handle \/api\/\*[\s\S]*reverse_proxy \{\$API_UPSTREAM:api:3000\}/);
  assert.match(adminCaddy, /X-Robots-Tag "noindex, nofollow, noarchive"/);
});

test('Docker dependency layers are reusable when only sources change', () => {
  const dockerfiles = [
    join(repositoryRoot, 'apps', 'api', 'Dockerfile'),
    join(repositoryRoot, 'apps', 'web', 'Dockerfile'),
    join(repositoryRoot, 'apps', 'admin', 'Dockerfile'),
    join(repositoryRoot, 'services', 'worker', 'Dockerfile'),
  ];

  for (const path of dockerfiles) {
    const dockerfile = readFileSync(path, 'utf8');
    const installAt = dockerfile.search(/RUN --mount=[^\r\n]+\r?\n\s+sh scripts\/pnpm-install-retry\.sh(?: [^\r\n]+)? --frozen-lockfile/);
    const sourcesAt = path.endsWith(join('services', 'worker', 'Dockerfile'))
      ? dockerfile.indexOf('COPY services/worker ./services/worker')
      : dockerfile.indexOf('COPY . .');
    assert.ok(installAt >= 0, `${path} must install with a frozen lockfile`);
    assert.ok(sourcesAt > installAt, `${path} must copy sources after the dependency layer`);
    assert.match(dockerfile, /--mount=type=cache,id=pnpm-store,target=\/root\/\.local\/share\/pnpm\/store/);
    assert.match(dockerfile, /sh scripts\/pnpm-install-retry\.sh[^\r\n]+--trust-lockfile/);
    for (const manifest of [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'apps/api/package.json',
      'apps/web/package.json',
      'apps/admin/package.json',
      'services/worker/package.json',
      'packages/database/package.json',
    ]) {
      assert.ok(dockerfile.indexOf(manifest) < installAt, `${path} must copy ${manifest} before install`);
    }
  }
});

test('Docker pnpm installs retry transient failures with the populated shared store', () => {
  const pnpmInstallRetry = readFileSync(join(repositoryRoot, 'scripts', 'pnpm-install-retry.sh'), 'utf8');

  assert.match(pnpmInstallRetry, /PNPM_INSTALL_MAX_ATTEMPTS:-3/);
  assert.match(pnpmInstallRetry, /pnpm install "\$@"/);
  assert.match(pnpmInstallRetry, /attempt=\$\(\(attempt \+ 1\)\)/);
  assert.match(pnpmInstallRetry, /retrying with the populated store/);
  assert.match(pnpmInstallRetry, /sleep 5/);
});

test('API images share filtered build dependencies and keep a dedicated production runtime', () => {
  const dockerfile = readFileSync(join(repositoryRoot, 'apps', 'api', 'Dockerfile'), 'utf8');
  const coolifyCompose = readFileSync(join(repositoryRoot, 'docker-compose.coolify.yml'), 'utf8');

  assert.match(dockerfile, /sh scripts\/pnpm-install-retry\.sh --filter @provider\/api --prod --frozen-lockfile/);
  assert.match(dockerfile, /sh scripts\/pnpm-install-retry\.sh --filter @provider\/api --filter @provider\/database --frozen-lockfile/);
  assert.match(dockerfile, /FROM node:22\.23\.2-alpine AS migration/);
  assert.doesNotMatch(dockerfile, /AS migration-deps/);
  assert.match(dockerfile, /COPY --from=build-deps \/workspace\/node_modules \.\/node_modules/);
  assert.match(dockerfile, /FROM node:22\.23\.2-alpine AS runtime/);
  assert.match(dockerfile, /COPY --from=runtime-deps \/workspace\/node_modules \.\/node_modules/);
  assert.match(dockerfile, /COPY --from=runtime-deps \/workspace\/apps\/api\/node_modules \.\/apps\/api\/node_modules/);
  assert.doesNotMatch(dockerfile, /COPY --from=build \/workspace\/node_modules/);
  assert.match(dockerfile, /CMD \["node", "apps\/api\/dist\/main\.js"\]/);
  assert.match(coolifyCompose, /migrate:[\s\S]*?target:\s*migration/);
  assert.match(coolifyCompose, /api:[\s\S]*?target:\s*runtime/);
  const bootstrapService = coolifyCompose.match(/\n  bootstrap-seed:[\s\S]*?(?=\n  [a-z][a-z-]+:|\nvolumes:)/)?.[0] || '';
  assert.doesNotMatch(bootstrapService, /\n    build:/);
  assert.equal(
    (coolifyCompose.match(/image:\s*"\$\{COOLIFY_RESOURCE_UUID:-astro-telekom\}-api:runtime"/g) || []).length,
    2,
  );
  assert.match(coolifyCompose, /migrate:[\s\S]*?image:\s*"\$\{COOLIFY_RESOURCE_UUID:-astro-telekom\}-api:migration"/);
  assert.match(coolifyCompose, /true\) node \/workspace\/apps\/api\/dist\/seed\.js ;;/);
});

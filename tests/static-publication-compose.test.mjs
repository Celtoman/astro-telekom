import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('Coolify Compose after metadata removal pins static CMS, preserves its volume and keeps the controller private', async () => {
  const root = await mkdtemp(join(tmpdir(), 'static-compose-')); const path = join(root, 'fixture.env');
  try {
    await writeFile(path, `REBUILD_PROVIDER=coolify\nSTATIC_PUBLICATION_URL=https://foreign.invalid\nADMIN_API_TOKEN=fixture-machine-token-only\nDATABASE_URL=postgresql://fixture:fixture@postgres:5432/fixture\nPUBLICATION_LEGACY_HTML_DIGEST=${'a'.repeat(64)}\n`);
    const source = await readFile('docker-compose.coolify.yml', 'utf8');
    // Coolify consumes exclude_from_hc before passing the Compose payload to
    // Docker. Standard Compose rejects this provider-specific metadata.
    const payload = join(root, 'compose.yml');
    await writeFile(payload, source.replace(/^    exclude_from_hc: true\r?\n/gm, '')
      .replace(/context: \./g, `context: ${JSON.stringify(resolve('.').replaceAll('\\', '/'))}`));
    const env = { ...process.env };
    for (const match of source.matchAll(/\$\{([A-Z_]+):\?/g)) env[match[1]] = 'fixture';
    Object.assign(env, { ENV_FILE: path, PUBLIC_DOMAIN: 'public.example.test', ADMIN_DOMAIN: 'admin.example.test', RUN_BOOTSTRAP_SEED: 'false',
      COOLIFY_API_URL: 'https://provider.example.test/api/v1', COOLIFY_RESOURCE_UUID: 'resource-fixture', ADMIN_API_TOKEN: 's'.repeat(32), TEST_BASIC_AUTH_USERS: 'fixture:fixture' });
    delete env.SERVING_CATALOG_PROJECTIONS_ENABLED;
    delete env.SERVING_CATALOG_PROJECTION_WARMER_ENABLED;
    const result = spawnSync('docker', ['compose', '--env-file', path, '-f', payload, 'config', '--format', 'json'], { env, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const configuration = JSON.parse(result.stdout); const services = configuration.services;
    for (const name of ['api', 'worker']) {
      assert.equal(services[name].environment.REBUILD_PROVIDER, 'static');
      assert.equal(services[name].environment.STATIC_PUBLICATION_URL, 'http://web:8081');
      assert.equal(services[name].depends_on.web, undefined, 'API/worker must start without a circular web readiness dependency');
    }
    const warmer = services['serving-projection-warmer'];
    assert.ok(warmer);
    assert.equal(warmer.image, services.api.image);
    assert.deepEqual(warmer.command, ['node', 'apps/api/dist/serving-projection-warmer-main.js']);
    assert.equal(warmer.environment.STATIC_PUBLICATION_URL, 'http://web:8081');
    assert.equal(warmer.environment.SERVING_CATALOG_PROJECTION_WARMER_ENABLED, 'false');
    assert.equal(warmer.environment.DATABASE_URL, 'postgresql://fixture:fixture@postgres:5432/fixture');
    assert.equal(services.api.environment.SERVING_CATALOG_PROJECTIONS_ENABLED, 'false');
    assert.deepEqual(Object.keys(warmer.depends_on), ['migrate']);
    assert.equal(warmer.depends_on.migrate.condition, 'service_completed_successfully');
    assert.equal(warmer.ports, undefined);
    assert.equal(warmer.volumes, undefined);
    assert.equal(services['web-publish'], undefined);
    assert.equal(services.web.build.target, 'publication-runtime');
    assert.equal(services.web.environment.PUBLICATION_LEGACY_HTML_DIGEST, 'a'.repeat(64));
    assert.deepEqual(services.web.expose, ['80']); assert.equal(services.web.ports, undefined);
    assert.equal(services.web.volumes.find(volume => volume.target === '/publication').source, 'web_publication');
    assert.equal(services.web.volumes.find(volume => volume.target === '/publication').read_only, undefined);
    assert.equal(services.web.depends_on['bootstrap-seed'].condition, 'service_completed_successfully');
    assert.equal(services['bootstrap-seed'].environment.RUN_BOOTSTRAP_SEED, 'false');
    assert.match(services.web.healthcheck.test.join(' '), /127\.0\.0\.1:8081\/active/);
  } finally {
    assert.equal(resolve(path, '..'), resolve(root));
    await rm(root, { recursive: true, force: true });
  }
});

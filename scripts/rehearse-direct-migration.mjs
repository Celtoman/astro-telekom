import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Own disposable resources only; no project .env, production database or volumes.
const root = resolve(import.meta.dirname, '..');
const suffix = randomUUID().slice(0, 8);
const network = `astro-migration-${suffix}`;
const postgres = `${network}-pg`;
const image = `astro-direct-migration:${suffix}`;
const directory = mkdtempSync(join(tmpdir(), 'astro-direct-migration-'));
const envFile = join(directory, 'synthetic.env');
writeFileSync(envFile, 'POSTGRES_DB=provider\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=synthetic-password\nPUBLIC_DOMAIN=public.example.test\nAPI_DOMAIN=api.example.test\nADMIN_DOMAIN=admin.example.test\nSITE_DATA_API_URL=http://api:3000/api/v1\n');
function docker(args, { allowFailure = false, timeout = 120000, env = process.env } = {}) {
  const result = spawnSync('docker', args, { cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  if (!allowFailure) assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result;
}
try {
  const config = JSON.parse(docker(['compose', '--env-file', envFile, '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'], {
    env: { ...process.env, ENV_FILE: envFile },
  }).stdout);
  const service = config.services.migrate;
  assert.equal(service.build.target, 'migration');
  assert.equal(config.services.api.depends_on.migrate.condition, 'service_completed_successfully');
  docker(['build', '-f', service.build.dockerfile, '--target', service.build.target, '-t', image, service.build.context], { timeout: 600000 });
  process.stdout.write('direct migration image built from resolved production Compose\n');
  docker(['network', 'create', network]);
  docker(['run', '--rm', '-d', '--name', postgres, '--network', network, '-e', 'POSTGRES_DB=provider', '-e', 'POSTGRES_PASSWORD=synthetic-password', config.services.postgres.image]);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const logs = docker(['logs', postgres], { allowFailure: true });
    if ((logs.stdout + logs.stderr).includes('PostgreSQL init process complete') && docker(['exec', postgres, 'pg_isready', '-U', 'postgres', '-d', 'provider'], { allowFailure: true }).status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  assert.ok(ready, 'isolated PostgreSQL must be ready after its initialization server stops');
  const migrate = () => docker(['run', '--rm', '--network', network, '-e', `DATABASE_URL=postgresql://postgres:synthetic-password@${postgres}:5432/provider`, image, ...service.command]);
  const expected = readdirSync(join(root, 'prisma', 'migrations')).filter(name => existsSync(join(root, 'prisma', 'migrations', name, 'migration.sql'))).sort();
  const first = migrate();
  assert.match(first.stdout, /All migrations have been successfully applied/);
  const applied = () => docker(['exec', postgres, 'psql', '-U', 'postgres', '-d', 'provider', '-At', '-c', 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name']).stdout.trim().split(/\r?\n/);
  assert.deepEqual(applied(), expected);
  const before = docker(['exec', postgres, 'psql', '-U', 'postgres', '-d', 'provider', '-At', '-c', 'SELECT row_to_json(m) FROM "_prisma_migrations" m ORDER BY migration_name']).stdout;
  assert.match(migrate().stdout, /No pending migrations to apply/);
  const after = docker(['exec', postgres, 'psql', '-U', 'postgres', '-d', 'provider', '-At', '-c', 'SELECT row_to_json(m) FROM "_prisma_migrations" m ORDER BY migration_name']).stdout;
  assert.equal(after, before, 'repeat must leave migration history exactly unchanged');
  process.stdout.write(`direct migration rehearsal passed: ${expected.length} migrations, exact idempotence, API startup dependency\n`);
} finally {
  docker(['rm', '-f', postgres], { allowFailure: true });
  docker(['network', 'rm', network], { allowFailure: true });
  docker(['image', 'rm', image], { allowFailure: true });
  assert.equal(resolve(directory), directory);
  assert.ok(directory.startsWith(join(tmpdir(), 'astro-direct-migration-')));
  rmSync(directory, { recursive: true, force: true });
}

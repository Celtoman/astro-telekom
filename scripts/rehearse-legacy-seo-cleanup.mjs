import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const migration = readFileSync(fileURLToPath(new URL('../prisma/migrations/0054_drop_legacy_seo_overrides/migration.sql', import.meta.url)), 'utf8');
const container = `astro-legacy-seo-${randomUUID().slice(0, 8)}`;

function docker(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000 });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.stderr || result.error?.message || result.stdout}`);
  }
  return result;
}

function sql(statement, allowFailure = false) {
  return docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'provider'], statement, allowFailure);
}

try {
  docker(['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    // The official image briefly starts PostgreSQL during initdb, then stops it.
    // Wait for that init phase to finish before accepting pg_isready.
    const logs = docker(['logs', container], undefined, true);
    const initComplete = `${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.');
    if (initComplete && docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'provider'], undefined, true).status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, 'PostgreSQL 18 did not become ready');
  sql(`
    CREATE TABLE "Page" (id text PRIMARY KEY, seo jsonb);
    CREATE TABLE "Tariff" (id text PRIMARY KEY, seo jsonb);
    CREATE TABLE "PageTemplate" (id text PRIMARY KEY, seo jsonb);
    INSERT INTO "Page" VALUES ('sql-null', NULL), ('json-null', 'null'::jsonb), ('empty-object', '{}'::jsonb);
    INSERT INTO "Tariff" VALUES ('sql-null', NULL), ('json-null', 'null'::jsonb), ('empty-object', '{}'::jsonb);
    INSERT INTO "PageTemplate" VALUES ('sql-null', NULL), ('json-null', 'null'::jsonb), ('empty-object', '{}'::jsonb);
  `);

  for (const table of ['Page', 'Tariff', 'PageTemplate']) {
    sql(`INSERT INTO "${table}" VALUES ('nonempty', '{"title":"must survive"}'::jsonb);`);
    const result = sql(migration, true);
    assert.notEqual(result.status, 0, `${table}: migration must reject a nonempty override`);
    assert.match(result.stderr, /Legacy SEO overrides remain/);
    const columns = sql(`SELECT count(*) FROM information_schema.columns WHERE table_name IN ('Page','Tariff','PageTemplate') AND column_name = 'seo';`);
    assert.match(columns.stdout, /\b3\b/, `${table}: failed migration must retain all columns`);
    sql(`UPDATE "${table}" SET seo = '{}'::jsonb WHERE id = 'nonempty';`);
    process.stdout.write(`${table}: nonempty override rejected without schema loss\n`);
  }

  const completed = sql(migration);
  assert.match(completed.stdout, /ALTER TABLE/);
  const columns = sql(`SELECT count(*) FROM information_schema.columns WHERE table_name IN ('Page','Tariff','PageTemplate') AND column_name = 'seo';`);
  assert.match(columns.stdout, /\b0\b/, 'all three legacy columns must be removed');
  process.stdout.write('empty overrides removed transactionally\n');
} finally {
  docker(['rm', '-f', container], undefined, true);
}

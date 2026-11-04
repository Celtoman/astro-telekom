import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const migration = readFileSync(new URL('../prisma/migrations/0065_tvbox_availability/migration.sql', import.meta.url), 'utf8');
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8')).published;
const name = `astro-tvbox-${randomUUID().slice(0, 8)}`;
function docker(args, input, allowFailure = false) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (!allowFailure && r.status !== 0) throw new Error(r.stderr || r.error?.message || r.stdout);
  return r;
}
const sql = input => docker(['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-At', '-U', 'postgres', '-d', 'provider'], input).stdout;
try {
  docker(['run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const logs = docker(['logs', name], undefined, true);
    if (`${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.') && docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'provider', '-Atc', 'SELECT 1'], undefined, true).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready);
  const data = rows.map(t => ({ id: t.id, cityId: t.cityId, providerId: t.providerId, name: t.name, standardPrice: t.standardPrice, attributes: t.attributes }));
  const payload = JSON.stringify(data);
  assert.ok(!payload.includes('$catalog$'));
  sql(`CREATE TABLE "Provider" (id text PRIMARY KEY,slug text);CREATE TABLE "Site" (id text PRIMARY KEY,"workingRevision" int,"updatedAt" timestamptz);
    CREATE TABLE "City" (id text PRIMARY KEY,"siteId" text);CREATE TABLE "Tariff" (id text PRIMARY KEY,"cityId" text,"providerId" text,name text,"standardPrice" numeric,attributes jsonb,availability text,"updatedAt" timestamptz);
    CREATE TABLE "ContentRevision" (id text PRIMARY KEY,"siteId" text,"entityType" text,"entityId" text,"entityRevision" int,"siteRevision" int,action text,"previousSnapshot" jsonb,snapshot jsonb,"changedFields" jsonb,source text,"createdAt" timestamptz);
    CREATE TABLE "AuditEvent" (id text PRIMARY KEY,"siteId" text,"siteRevision" int,"entityType" text,"entityId" text,action text,"changedFields" jsonb,changes jsonb,source text,"createdAt" timestamptz);
    CREATE TABLE "SitePublication" (catalog jsonb);INSERT INTO "SitePublication" VALUES ('{"sentinel":"immutable"}');
    INSERT INTO "Site" VALUES ('site',27,now());
    CREATE TEMP TABLE input AS SELECT * FROM jsonb_to_recordset($catalog$${payload}$catalog$) AS x(id text,"cityId" text,"providerId" text,name text,"standardPrice" numeric,attributes jsonb);
    INSERT INTO "Provider" SELECT DISTINCT "providerId",'domru' FROM input;INSERT INTO "City" SELECT DISTINCT "cityId",'site' FROM input;
    INSERT INTO "Tariff" SELECT *, 'ACTIVE',now() FROM input;`);
  sql(migration);
  const counts = JSON.parse(sql(`SELECT json_build_object('all',count(*),'available',count(*) FILTER (WHERE attributes->>'tvbox_available'='true'),'unavailable',count(*) FILTER (WHERE attributes->>'tvbox_available'='false'),'zeroOffers',count(*) FILTER (WHERE attributes->>'tvbox_available'='true' AND attributes->>'tvbox_buyout_price'='0')) FROM "Tariff";`).trim());
  assert.equal(counts.all, rows.length);
  assert.equal(counts.unavailable, 1470);
  assert.equal(counts.available, 2335);
  assert.equal(counts.zeroOffers, 0);
  assert.equal(sql('SELECT "workingRevision" FROM "Site";').trim(), '28');
  assert.equal(sql('SELECT count(*) FROM "ContentRevision";').trim(), String(rows.length));
  assert.equal(sql('SELECT count(*) FROM "ContentRevision" WHERE "previousSnapshot"->>\'updatedAt\' IS NOT DISTINCT FROM snapshot->>\'updatedAt\';').trim(), '0');
  assert.equal(sql('SELECT count(*) FROM "Tariff" t JOIN "ContentRevision" r ON t.id=r."entityId" WHERE t.name IS DISTINCT FROM r."previousSnapshot"->>\'name\' OR t."standardPrice" IS DISTINCT FROM (r."previousSnapshot"->>\'standardPrice\')::numeric;').trim(), '0');
  assert.equal(sql('SELECT catalog->>\'sentinel\' FROM "SitePublication";').trim(), 'immutable');
  sql(migration);
  assert.equal(sql('SELECT "workingRevision" FROM "Site";').trim(), '28');
  assert.equal(sql('SELECT count(*) FROM "AuditEvent";').trim(), String(rows.length));
  console.log(JSON.stringify({ ...counts, historyRows: rows.length, preservedPreviousTimestamps: true, preservedPublication: true, preservedNamesPrices: true, idempotent: true }));
} finally { docker(['rm', '-f', name], undefined, true); }

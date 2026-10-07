import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const migration = readFileSync(new URL('../prisma/migrations/0058_home_composition_tariff_collection/migration.sql', import.meta.url), 'utf8');
const container = `astro-tariff-collection-${randomUUID().slice(0, 8)}`;
function docker(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000 });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.error?.message || result.stdout);
  return result;
}
const sql = (input, allowFailure = false) => docker(['exec', '-i', container, 'psql', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'provider'], input, allowFailure);
try {
  docker(['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const logs = docker(['logs', container], undefined, true);
    if (`${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.') && docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'provider'], undefined, true).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true);
  sql(`
    CREATE TYPE "ContentRevisionAction" AS ENUM ('CREATE','UPDATE','ARCHIVE','RESTORE','DELETE','IMPORT');
    CREATE TABLE "Site" ("id" text PRIMARY KEY, "name" text NOT NULL, "workingRevision" int NOT NULL, "updatedAt" timestamptz NOT NULL);
    CREATE TABLE "PageTemplate" ("id" text PRIMARY KEY, "siteId" text REFERENCES "Site", "kind" text NOT NULL, "titleTemplate" text NOT NULL, "status" text NOT NULL, "content" jsonb, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, UNIQUE("siteId","kind"));
    CREATE TABLE "PageTemplateBlock" ("id" text PRIMARY KEY, "templateId" text REFERENCES "PageTemplate", "blockType" text NOT NULL, "position" int NOT NULL, "visible" boolean NOT NULL, "data" jsonb NOT NULL, "source" text, UNIQUE("templateId","position"));
    CREATE TABLE "ContentRevision" ("id" text PRIMARY KEY, "siteId" text REFERENCES "Site", "entityType" text, "entityId" text, "entityRevision" int, "siteRevision" int, "action" "ContentRevisionAction", "previousSnapshot" jsonb, "snapshot" jsonb, "changedFields" jsonb, "source" text, "createdAt" timestamptz);
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY, "siteId" text REFERENCES "Site", "siteRevision" int, "entityType" text, "entityId" text, "action" "ContentRevisionAction", "changedFields" jsonb, "changes" jsonb, "source" text, "createdAt" timestamptz);
    CREATE TABLE "SitePublication" ("id" text PRIMARY KEY, "catalog" jsonb);
    INSERT INTO "Site" VALUES ('site', 'Дом.ру', 8, now());
    INSERT INTO "PageTemplate" VALUES ('city', 'site', 'CITY_HOME', 'Общий заголовок', 'PUBLISHED', '{}', now(), now());
    INSERT INTO "SitePublication" VALUES ('published', '{"sentinel":"immutable"}');
  `);

  const failed = sql(migration, true);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /exact legacy seven-block/);
  assert.equal(sql(`SELECT "workingRevision" FROM "Site";`).stdout.trim(), '8');
  const types = ['hero','service_grid','tariff_grid','steps','feature_grid','feature_grid','faq'];
  for (const [index, type] of types.entries()) sql(`INSERT INTO "PageTemplateBlock" VALUES ('b${index}','city','${type}',${10*(index+1)},true,'{"title":"Свой заголовок","sentinel":"keep"}','owner');`);
  sql(migration);
  const state = JSON.parse(sql(`SELECT jsonb_build_object('revision',(SELECT "workingRevision" FROM "Site"),'events',(SELECT count(*) FROM "AuditEvent"),'revisions',(SELECT count(*) FROM "ContentRevision"),'blocks',(SELECT jsonb_agg(to_jsonb(b) ORDER BY "position") FROM "PageTemplateBlock" b),'publication',(SELECT "catalog" FROM "SitePublication"));`).stdout.trim());
  assert.equal(state.revision, 9); assert.equal(state.events, 1); assert.equal(state.revisions, 1);
  assert.equal(state.blocks.length, 7);
  assert.deepEqual(state.blocks.filter(b => b.visible).map(b => b.blockType), ['hero','tariff_grid']);
  for (const block of state.blocks.filter(b => b.blockType !== 'tariff_grid')) assert.deepEqual(block.data, { title:'Свой заголовок', sentinel:'keep' });
  const grid = state.blocks.find(b => b.blockType === 'tariff_grid');
  assert.equal(grid.data.title, 'Свой заголовок'); assert.equal(grid.data.initialCount, 6); assert.equal(grid.data.sort, 'PRICE_ASC');
  assert.deepEqual(state.publication, { sentinel:'immutable' });
  assert.equal(sql(`SELECT "previousSnapshot"->'blocks'->2->'data'->>'sentinel' FROM "ContentRevision";`).stdout.trim(), 'keep');
  sql(`UPDATE "PageTemplateBlock" SET "data"="data"||'{"moreButtonText":"Моя кнопка"}'::jsonb WHERE "blockType"='tariff_grid';`);
  sql(migration);
  assert.equal(sql(`SELECT "data"->>'moreButtonText' FROM "PageTemplateBlock" WHERE "blockType"='tariff_grid';`).stdout.trim(), 'Моя кнопка');
  assert.equal(sql(`SELECT "workingRevision" FROM "Site";`).stdout.trim(), '9');
  assert.equal(sql(`SELECT count(*) FROM "ContentRevision";`).stdout.trim(), '1');
  process.stdout.write('tariff-collection migration: rollback, preserved hidden blocks, immutable publication, one attributed revision and idempotence passed\n');

} finally { docker(['rm', '-f', container], undefined, true); }

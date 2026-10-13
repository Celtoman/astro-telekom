import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const migration = readFileSync(new URL('../prisma/migrations/0056_first_screen_content/migration.sql', import.meta.url), 'utf8');
const container = `astro-home-hero-v2-${randomUUID().slice(0, 8)}`;
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
  sql(`INSERT INTO "PageTemplateBlock" VALUES ('hero','city','hero',10,true,'{"title":"Свой заголовок","text":"Своё описание"}','legacy');`);
  sql(migration);
  const next = readFileSync(new URL('../prisma/migrations/0060_home_hero_city_search/migration.sql', import.meta.url), 'utf8');
  const original = sql(`SELECT "data" FROM "PageTemplateBlock" WHERE "blockType"='home.hero';`).stdout.trim();
  const cityBefore = sql(`SELECT to_jsonb(t) FROM "PageTemplate" t WHERE "id"='city';`).stdout.trim();
  sql(`UPDATE "PageTemplate" SET "content"='{"firstScreenPassportVersion":"9.9.9"}' WHERE "kind"='HOME';`);
  assert.notEqual(sql(next, true).status, 0);
  assert.equal(sql(`SELECT "workingRevision" FROM "Site";`).stdout.trim(), '9');
  assert.equal(sql(`SELECT "data" FROM "PageTemplateBlock" WHERE "blockType"='home.hero';`).stdout.trim(), original);
  sql(`UPDATE "PageTemplate" SET "content"='{"firstScreenPassportVersion":"1.0.0","firstScreenImplementationVersion":"first-screen-editor-v1"}' WHERE "kind"='HOME';`);
  sql(next);
  const state = JSON.parse(sql(`SELECT jsonb_build_object('revision',(SELECT "workingRevision" FROM "Site"),'data',(SELECT "data" FROM "PageTemplateBlock" WHERE "blockType"='home.hero'),'version',(SELECT "content"->>'firstScreenPassportVersion' FROM "PageTemplate" WHERE "kind"='HOME'),'before',(SELECT "previousSnapshot" FROM "ContentRevision" WHERE "source"='migration:0060:home-hero-city-search'),'publication',(SELECT "catalog" FROM "SitePublication"));`).stdout.trim());
  assert.equal(state.revision, 10); assert.equal(state.version, '2.0.0'); assert.equal(state.data.steps.length, 3);
  assert.match(state.data.title, /<red>в вашем городе<\/red>/); assert.equal(state.data.cityLabel, undefined);
  assert.deepEqual(state.before.blocks[0].data, JSON.parse(original)); assert.deepEqual(state.publication, {sentinel:'immutable'});
  assert.equal(sql(`SELECT to_jsonb(t) FROM "PageTemplate" t WHERE "id"='city';`).stdout.trim(), cityBefore);
  sql(`UPDATE "PageTemplateBlock" SET "data"="data" || '{"searchButtonText":"Моя кнопка"}'::jsonb WHERE "blockType"='home.hero';`);
  sql(next);
  assert.equal(sql(`SELECT "data"->>'searchButtonText' FROM "PageTemplateBlock" WHERE "blockType"='home.hero';`).stdout.trim(), 'Моя кнопка');
  assert.equal(sql(`SELECT "workingRevision" FROM "Site";`).stdout.trim(), '10');
  assert.equal(sql(`SELECT count(*) FROM "ContentRevision" WHERE "source"='migration:0060:home-hero-city-search';`).stdout.trim(), '1');
  // Rehearse restoration as a new working revision; immutable publication is not switched.
  sql(`BEGIN;
    CREATE TEMP TABLE restore_before AS SELECT to_jsonb(t)||jsonb_build_object('blocks',(SELECT jsonb_agg(to_jsonb(b)) FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")) AS snapshot FROM "PageTemplate" t WHERE t."kind"='HOME';
    UPDATE "PageTemplateBlock" b SET "data"=(SELECT r."previousSnapshot"->'blocks'->0->'data' FROM "ContentRevision" r WHERE r."source"='migration:0060:home-hero-city-search') WHERE b."blockType"='home.hero';
    UPDATE "PageTemplate" SET "content"=(SELECT "previousSnapshot"->'content' FROM "ContentRevision" WHERE "source"='migration:0060:home-hero-city-search') WHERE "kind"='HOME';
    UPDATE "Site" SET "workingRevision"="workingRevision"+1;
    INSERT INTO "ContentRevision" ("id","siteId","entityType","entityId","entityRevision","siteRevision","action","previousSnapshot","snapshot","changedFields","source","createdAt")
    SELECT 'restore-v1','site','PAGE_TEMPLATE',t."id",3,11,'RESTORE',r.snapshot,to_jsonb(t)||jsonb_build_object('blocks',(SELECT jsonb_agg(to_jsonb(b)) FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")),'["blocks.data","content"]','rehearsal:restore',now() FROM "PageTemplate" t CROSS JOIN restore_before r WHERE t."kind"='HOME';
    COMMIT;`);
  assert.equal(sql(`SELECT "workingRevision" FROM "Site";`).stdout.trim(),'11');
  assert.equal(sql(`SELECT "data" FROM "PageTemplateBlock" WHERE "blockType"='home.hero';`).stdout.trim(),original);
  assert.equal(sql(`SELECT "catalog" FROM "SitePublication";`).stdout.trim(),'{"sentinel": "immutable"}');
  process.stdout.write('HOME v2 migration: guarded rollback, before/after, CITY_HOME preservation, idempotence and new-revision restore passed\n');
} finally { docker(['rm','-f',container],undefined,true); }
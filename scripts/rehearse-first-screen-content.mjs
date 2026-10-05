import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const migration = readFileSync(new URL('../prisma/migrations/0056_first_screen_content/migration.sql', import.meta.url), 'utf8');
const container = `astro-first-screen-${randomUUID().slice(0, 8)}`;
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
  assert.match(failed.stderr, /requires exactly one hero/);
  assert.equal(sql(`SELECT count(*) FROM "PageTemplate" WHERE "kind"='HOME';`).stdout.trim(), '0', 'failure must roll back root creation');
  sql(`INSERT INTO "PageTemplateBlock" VALUES ('hero','city','hero',10,true,'{"title":"Свой заголовок","text":"Своё описание","eyebrow":"legacy","ctaText":"old","ctaHref":"#old"}','legacy'), ('features','city','feature_grid',20,true,'{"sentinel":"keep"}','legacy');`);
  sql(migration);
  const state = JSON.parse(sql(`SELECT jsonb_build_object('revision',(SELECT "workingRevision" FROM "Site" WHERE "id"='site'),'templates',(SELECT count(*) FROM "PageTemplate"),'events',(SELECT count(*) FROM "AuditEvent"),'revisions',(SELECT count(*) FROM "ContentRevision"),'city',(SELECT "data" FROM "PageTemplateBlock" WHERE "id"='hero'),'root',(SELECT "data" FROM "PageTemplateBlock" WHERE "blockType"='home.hero'),'feature',(SELECT "data" FROM "PageTemplateBlock" WHERE "id"='features'),'publication',(SELECT "catalog" FROM "SitePublication" WHERE "id"='published'));`).stdout.trim());
  assert.equal(state.revision, 9); assert.equal(state.templates, 2); assert.equal(state.events, 2); assert.equal(state.revisions, 2);
  assert.equal(state.city.title, 'Свой заголовок'); assert.equal(state.city.text, 'Своё описание'); assert.equal(state.city.eyebrow, undefined);
  assert.equal(state.city.checkButtonText, 'Проверить'); assert.equal(state.root.chips.length, 3);
  assert.deepEqual(state.feature, { sentinel: 'keep' }); assert.deepEqual(state.publication, { sentinel: 'immutable' });
  sql(`UPDATE "PageTemplateBlock" SET "data" = "data" || '{"checkButtonText":"Моя подпись"}'::jsonb WHERE "id"='hero';`);
  sql(migration);
  assert.equal(sql(`SELECT "data"->>'checkButtonText' FROM "PageTemplateBlock" WHERE "id"='hero';`).stdout.trim(), 'Моя подпись');
  assert.equal(sql(`SELECT "workingRevision" FROM "Site" WHERE "id"='site';`).stdout.trim(), '9');
  assert.equal(sql(`SELECT count(*) FROM "ContentRevision";`).stdout.trim(), '2');
  process.stdout.write('first-screen migration: rollback, preservation, immutable publication and idempotence passed\n');
} finally { docker(['rm', '-f', container], undefined, true); }

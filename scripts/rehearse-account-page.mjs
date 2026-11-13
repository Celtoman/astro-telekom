import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaService } = require('../apps/api/dist/prisma.service.js');
const { accountPageDefaults } = require('../apps/api/dist/account-page-defaults.js');
const { ACCOUNT_PAGE_SLUG } = require('../apps/api/dist/account-page-model.js');
const { AdminAccountController } = require('../apps/api/dist/admin-account.controller.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const migration = readFileSync(new URL('../prisma/migrations/0067_account_page/migration.sql', import.meta.url), 'utf8');
const oldGlobalScope = /ALTER TABLE "Page" ADD CONSTRAINT "Page_global_scope_check" CHECK \([\s\S]*?\n\);/;
assert.ok(oldGlobalScope.test(migration), 'historical ACCOUNT scope statement must be identifiable');
let currentGlobalScope;
const container = `astro-account-${randomUUID().slice(0, 8)}`;
const docker = (args, options = {}) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000, windowsHide: true, ...options });
const checked = result => { assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message); return result.stdout.trim(); };
// Replay the ACCOUNT backfill against the current schema without replacing the
// newer global-scope guard owned by 0072. Existing OFFICIAL_SITE data must stay.
const apply = () => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'provider', '-v', 'ON_ERROR_STOP=1'], { input: migration.replace(oldGlobalScope, `ALTER TABLE "Page" ADD CONSTRAINT "Page_global_scope_check" ${currentGlobalScope};`) });
const json = value => JSON.parse(JSON.stringify(value));
let db, owned = false;
try {
  checked(docker(['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine'])); owned = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'provider'], { timeout: 5000 }).status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  assert.ok(ready);
  const port = checked(docker(['port', container, '5432/tcp'])).match(/:(\d+)\s*$/)[1];
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/provider`;
  checked(spawnSync('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], { shell: process.platform === 'win32', env: process.env, encoding: 'utf8', timeout: 120000, windowsHide: true }));
  const seed = () => checked(spawnSync(process.execPath, ['apps/api/dist/seed.js'], { env: { ...process.env, ADMIN_EMAIL: 'account-rehearsal@example.test', ADMIN_PASSWORD: 'synthetic-account-rehearsal-password' }, encoding: 'utf8', timeout: 30000, windowsHide: true }));
  seed();
  db = new PrismaService(); await db.onModuleInit();
  currentGlobalScope = checked(docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'provider', '-Atc', `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='Page_global_scope_check' AND conrelid='"Page"'::regclass`]));
  assert.match(currentGlobalScope, /OFFICIAL_SITE/, 'fresh migration chain includes the latest global page kind');
  const site = await db.site.findUniqueOrThrow({ where: { slug: 'domru-site' } });
  const pageQuery = () => db.page.findFirstOrThrow({ where: { siteId: site.id, type: 'ACCOUNT' } });
  assert.deepEqual((await pageQuery()).content, accountPageDefaults(), 'fresh seed initializes ACCOUNT after migrations on empty DB');
  await db.page.deleteMany({ where: { siteId: site.id, type: 'ACCOUNT' } });
  await db.seoTemplate.deleteMany({ where: { siteId: site.id, kind: 'ACCOUNT' } });
  const existing = json(await db.page.findMany({ where: { siteId: site.id }, orderBy: { id: 'asc' } }));
  const templates = json(await db.pageTemplate.findMany({ where: { siteId: site.id }, include: { blocks: true }, orderBy: { id: 'asc' } }));
  const publication = json(await db.sitePublication.create({ data: { siteId: site.id, siteRevision: 0, status: 'SUCCEEDED', catalog: { historical: true }, triggerEntity: 'site', triggerEntityId: site.id } }));
  const other = await db.provider.create({ data: { name: 'Other', slug: 'other', sites: { create: { name: 'Other', slug: 'other-site' } } }, include: { sites: true } });
  checked(apply());
  assert.deepEqual((await pageQuery()).content, accountPageDefaults());
  assert.equal(await db.page.count({ where: { siteId: site.id, type: 'ACCOUNT', cityId: null, slug: ACCOUNT_PAGE_SLUG } }), 1);
  assert.equal(await db.page.count({ where: { siteId: other.sites[0].id, type: 'ACCOUNT' } }), 0);
  assert.deepEqual(json(await db.page.findMany({ where: { siteId: site.id, type: { not: 'ACCOUNT' } }, orderBy: { id: 'asc' } })), existing);
  assert.deepEqual(json(await db.pageTemplate.findMany({ where: { siteId: site.id }, include: { blocks: true }, orderBy: { id: 'asc' } })), templates);
  const revision = (await db.site.findUniqueOrThrow({ where: { id: site.id } })).workingRevision;
  checked(apply()); assert.equal((await db.site.findUniqueOrThrow({ where: { id: site.id } })).workingRevision, revision);
  const controller = new AdminAccountController(db, new PublicationWorkflowService(db, new SiteCatalogService(db)));
  const content = accountPageDefaults(); content.hero.h1 = 'Авторский заголовок';
  const result = await controller.save(site.id, { expectedWorkingRevision: revision, content });
  assert.equal(result.workingRevision, revision + 1);
  await assert.rejects(controller.save(site.id, { expectedWorkingRevision: revision, content }), error => error.getStatus() === 409);
  checked(apply()); seed(); assert.equal((await pageQuery()).content.hero.h1, content.hero.h1);
  assert.deepEqual(json(await db.sitePublication.findUniqueOrThrow({ where: { id: publication.id } })), publication);
  await db.page.deleteMany({ where: { siteId: site.id, type: 'ACCOUNT' } });
  const region = await db.region.findFirstOrThrow({ where: { siteId: site.id } });
  const collisions = [
    async () => db.city.create({ data: { siteId: site.id, regionId: region.id, name: 'Collision', slug: ACCOUNT_PAGE_SLUG } }),
    async () => db.page.create({ data: { siteId: site.id, type: 'COVERAGE', slug: ACCOUNT_PAGE_SLUG, title: 'Authored collision' } }),
    async () => db.redirect.create({ data: { siteId: site.id, sourcePath: `/${ACCOUNT_PAGE_SLUG}`, targetPath: '/' } }),
  ];
  for (let i = 0; i < collisions.length; i++) {
    const conflict = await collisions[i]();
    assert.notEqual(apply().status, 0, 'canonical collision must roll back');
    assert.equal(await db.page.count({ where: { siteId: site.id, type: 'ACCOUNT' } }), 0);
    assert.equal((await db.site.findUniqueOrThrow({ where: { id: site.id } })).workingRevision, revision + 1);
    await [db.city, db.page, db.redirect][i].delete({ where: { id: conflict.id } });
  }
  process.stdout.write('ACCOUNT: fresh seed, migration, idempotence, authored content, immutable publication, provider isolation, atomic save and three collision rollbacks passed\n');
} finally {
  if (db) await db.onModuleDestroy();
  if (owned && /^astro-account-[0-9a-f]{8}$/.test(container)) docker(['rm', '-f', container]);
}

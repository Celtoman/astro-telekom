import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaService } = require('../apps/api/dist/prisma.service.js');
const { addressPageFromTemplate } = require('../apps/api/dist/address-page-view.js');
const { ADDRESS_PAGE_SLUG } = require('../apps/api/dist/address-page-model.js');
const { addressPageDefaultBlocks } = require('../apps/api/dist/address-page-defaults.js');
const { AdminPageTemplatesController } = require('../apps/api/dist/admin-page-templates.controller.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const migration = readFileSync(new URL('../prisma/migrations/0064_address_page_composition/migration.sql', import.meta.url), 'utf8');
const container = `astro-address-${randomUUID().slice(0, 8)}`;
const docker = (args, options = {}) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000, windowsHide: true, ...options });
const checked = result => { assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message); return result.stdout.trim(); };
const apply = () => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'provider', '-v', 'ON_ERROR_STOP=1'], { input: migration });
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
  checked(spawnSync(process.execPath, ['apps/api/dist/seed.js'], { env: { ...process.env, ADMIN_EMAIL: 'address-rehearsal@example.test', ADMIN_PASSWORD: 'synthetic-address-rehearsal-password' }, encoding: 'utf8', timeout: 30000, windowsHide: true }));
  db = new PrismaService(); await db.onModuleInit();
  const site = await db.site.findUniqueOrThrow({ where: { slug: 'domru-site' } });
  const templateQuery = () => db.pageTemplate.findUniqueOrThrow({ where: { siteId_kind: { siteId: site.id, kind: 'CITY_ADDRESS_CHECK' } }, include: { blocks: { orderBy: { position: 'asc' } } } });
  assert.equal(addressPageFromTemplate(await templateQuery()).blocks.length, 8, 'fresh seed initializes ADDRESS');
  // Recreate the exact pre-rollout shape without changing HOME or historical publication.
  await db.page.deleteMany({ where: { siteId: site.id, slug: ADDRESS_PAGE_SLUG } });
  await db.pageTemplate.deleteMany({ where: { siteId: site.id, kind: 'CITY_ADDRESS_CHECK' } });
  await db.seoTemplate.deleteMany({ where: { siteId: site.id, kind: 'CITY_ADDRESS_CHECK' } });
  const existing = json(await db.pageTemplate.findMany({ where: { siteId: site.id }, include: { blocks: true }, orderBy: { id: 'asc' } }));
  const cityCount = await db.city.count({ where: { siteId: site.id } });
  const publication = json(await db.sitePublication.create({ data: { siteId: site.id, siteRevision: 0, status: 'SUCCEEDED', catalog: { historical: true }, triggerEntity: 'site', triggerEntityId: site.id } }));
  const other = await db.provider.create({ data: { name: 'Other', slug: 'other', sites: { create: { name: 'Other', slug: 'other-site' } } }, include: { sites: true } });
  checked(apply());
  const template = await templateQuery(); assert.equal(addressPageFromTemplate(template).blocks.length, 8);
  assert.deepEqual(template.blocks.map(({ blockType, data }) => ({ blockType, data })), addressPageDefaultBlocks());
  assert.equal(await db.page.count({ where: { siteId: site.id, type: 'ADDRESS_CHECK', slug: ADDRESS_PAGE_SLUG, templateId: template.id } }), cityCount);
  assert.equal(await db.pageTemplate.count({ where: { siteId: other.sites[0].id } }), 0);
  assert.deepEqual(json(await db.pageTemplate.findMany({ where: { siteId: site.id, kind: { not: 'CITY_ADDRESS_CHECK' } }, include: { blocks: true }, orderBy: { id: 'asc' } })), existing);
  assert.deepEqual(json(await db.sitePublication.findUniqueOrThrow({ where: { id: publication.id } })), publication);
  const revision = (await db.site.findUniqueOrThrow({ where: { id: site.id } })).workingRevision;
  checked(apply()); assert.equal((await db.site.findUniqueOrThrow({ where: { id: site.id } })).workingRevision, revision);
  const publications = new PublicationWorkflowService(db, new SiteCatalogService(db));
  const controller = new AdminPageTemplatesController(db, publications);
  const blocks = addressPageDefaultBlocks(); blocks[2].data.noteTitle = 'Отредактированное пояснение';
  const result = await controller.updateAddressComposition(site.id, { expectedWorkingRevision: revision, blocks });
  assert.equal(result.workingRevision, revision + 1);
  await assert.rejects(controller.updateAddressComposition(site.id, { expectedWorkingRevision: revision, blocks }), error => error.getStatus() === 409);
  assert.deepEqual(json(await db.sitePublication.findUniqueOrThrow({ where: { id: publication.id } })), publication);
  // Canonical collisions stop the entire transaction and retain the old content.
  await db.page.deleteMany({ where: { siteId: site.id, slug: ADDRESS_PAGE_SLUG } });
  await db.pageTemplate.delete({ where: { id: template.id } });
  await db.seoTemplate.deleteMany({ where: { siteId: site.id, kind: 'CITY_ADDRESS_CHECK' } });
  const city = await db.city.findFirstOrThrow({ where: { siteId: site.id } });
  await db.page.create({ data: { siteId: site.id, cityId: city.id, type: 'INTERNET', slug: ADDRESS_PAGE_SLUG, title: 'Существующий контент' } });
  assert.notEqual(apply().status, 0);
  assert.equal(await db.pageTemplate.count({ where: { siteId: site.id, kind: 'CITY_ADDRESS_CHECK' } }), 0);
  assert.equal((await db.site.findUniqueOrThrow({ where: { id: site.id } })).workingRevision, revision + 1);
  process.stdout.write('ADDRESS: migration, idempotence, preserved HOME, immutable publication, provider isolation, atomic save and collision rollback passed\n');
} finally {
  if (db) await db.onModuleDestroy();
  if (owned) docker(['rm', '-f', container]);
}

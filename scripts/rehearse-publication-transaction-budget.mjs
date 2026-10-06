import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { PrismaService } = require('../apps/api/dist/prisma.service.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const { publicationSource } = require('../tests/helpers/publication-source.cjs');
const container = `astro-publication-budget-${randomUUID().slice(0, 8)}`;
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 90000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
let db;
try {
  docker(['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8', timeout: 5000 });
    ready = `${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete')
      && spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { timeout: 5000 }).status === 0;
    if (ready) break;
    await new Promise(done => setTimeout(done, 150));
  }
  assert.ok(ready, 'PostgreSQL not ready');
  const port = Number(docker(['port', container, '5432/tcp']).match(/:(\d+)\s*$/)[1]);
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/provider`;
  const migration = spawnSync('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], { encoding: 'utf8', env: process.env, shell: process.platform === 'win32', timeout: 120000 });
  assert.equal(migration.status, 0, migration.stderr || migration.stdout);
  db = new PrismaService(); await db.onModuleInit();
  const source = publicationSource();
  await db.provider.create({ data: { id: 'provider-1', name: 'Synthetic', slug: 'synthetic', settings: {} } });
  await db.site.create({ data: { id: source.site.id, providerId: 'provider-1', slug: source.site.slug, name: source.site.name,
    domain: source.site.domain, status: 'PUBLISHED', workingRevision: 1, settings: {} } });
  const renderer = new SiteCatalogService(db);
  let captures = 0;
  const catalog = {
    async captureSourceBySiteId(siteId, transaction) {
      assert.equal(siteId, source.site.id); captures++;
      // Real SQL work exceeds Prisma's default interactive transaction budget.
      await transaction.$queryRawUnsafe('SELECT 1 AS waited FROM pg_sleep(6)');
      return structuredClone(source);
    },
    renderSource: (snapshot, now) => renderer.renderSource(snapshot, now),
  };
  const service = new PublicationWorkflowService(db, catalog);
  const input = { siteId: source.site.id, expectedWorkingRevision: 1, triggerEntity: 'site', triggerEntityId: source.site.id };
  await assert.rejects(service.preparePublication({ ...input, expectedWorkingRevision: 0 }), /Рабочая ревизия/);
  assert.equal(captures, 0);
  const started = Date.now();
  const publication = await service.preparePublication(input);
  assert.ok(Date.now() - started >= 6000);
  assert.equal(publication.status, 'PENDING'); assert.equal(publication.siteRevision, 1);
  assert.equal((await db.site.findUnique({ where: { id: source.site.id } })).publishedRevision, 0);
  assert.equal((await service.preparePublication(input)).id, publication.id);
  assert.equal(captures, 1, 'Pending retry must reuse its immutable snapshot');
  await service.markFailed(publication.id, 'synthetic failed attempt');
  const retried = await service.preparePublication(input);
  assert.equal(retried.id, publication.id); assert.equal(retried.status, 'PENDING'); assert.equal(captures, 2);
  assert.equal(await db.sitePublication.count(), 1);
  assert.equal((await db.site.findUnique({ where: { id: source.site.id } })).publishedRevision, 0);
  console.log('Real SQL capture beyond 5 seconds prepares and retries an immutable publication without publishing');
} finally {
  if (db) await db.onModuleDestroy();
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore', timeout: 10000 });
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaService } = require('../apps/api/dist/prisma.service.js');
const { TariffPurgeService } = require('../apps/api/dist/tariff-purge.service.js');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const container = `astro-tariff-purge-${randomUUID().slice(0, 8)}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 300_000, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.error?.message || result.stdout}`);
  return result.stdout.trim();
}

let db;
try {
  run('docker', ['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
    const initComplete = `${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.');
    const status = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'provider'], { encoding: 'utf8' });
    if (initComplete && status.status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, 'PostgreSQL 18 did not become ready');
  const portText = run('docker', ['port', container, '5432/tcp']);
  const port = Number(portText.match(/:(\d+)\s*$/)?.[1]);
  assert.ok(Number.isInteger(port) && port > 0, `Docker port unavailable: ${portText}`);
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/provider`;
  run('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], {
    env: process.env,
    shell: process.platform === 'win32',
  });

  db = new PrismaService();
  await db.onModuleInit();
  const provider = await db.provider.create({ data: { name: 'Test', slug: 'test' } });
  const site = await db.site.create({ data: { providerId: provider.id, name: 'Test', slug: 'test-site' } });
  const region = await db.region.create({ data: { siteId: site.id, name: 'Test', slug: 'test-region' } });
  const city = await db.city.create({ data: { siteId: site.id, regionId: region.id, name: 'Казань', slug: 'kazan' } });
  const createTariff = (slug) => db.tariff.create({
    data: {
      providerId: provider.id, cityId: city.id, name: slug, slug, identityKey: slug,
      serviceType: 'INTERNET', status: 'ARCHIVED', availability: 'ARCHIVED',
      archiveReason: 'MANUAL', archivedAt: new Date('2026-09-01T00:00:00Z'),
    },
  });
  const free = await createTariff('free');
  const freeSecond = await createTariff('free-second');
  const lead = await createTariff('lead');
  const redirect = await createTariff('redirect');
  const publication = await createTariff('publication');
  const publicationTrigger = await createTariff('publication-trigger');
  const validation = await createTariff('validation');
  const imported = await createTariff('imported');
  await db.lead.create({ data: { siteId: site.id, cityId: city.id, tariffId: lead.id, phone: '79990000000' } });
  await db.redirect.create({ data: { siteId: site.id, sourcePath: '/old', targetPath: '/kazan/redirect', managedTariffId: redirect.id } });
  await db.sitePublication.create({
    data: { siteId: site.id, siteRevision: 1, catalog: { cities: [{ tariffs: [{ id: publication.id }, { id: publication.id }] }] }, triggerEntity: 'SITE', triggerEntityId: site.id },
  });
  await db.sitePublication.create({
    data: { siteId: site.id, siteRevision: 3, catalog: {}, triggerEntity: 'TARIFF', triggerEntityId: publicationTrigger.id },
  });
  await db.sitePublicationValidation.create({
    data: { siteId: site.id, siteRevision: 2, sourceSnapshot: { cities: [{ tariffs: [{ id: validation.id }] }] },
      report: {}, appVersion: 'test', outcome: 'PASSED', checkedUrlCount: 0 },
  });
  await db.tariffImportRun.create({
    data: { providerId: provider.id, fileName: 'synthetic.xlsx', status: 'APPLIED', totalRows: 0,
      validRows: 0, errorRows: 0, warningRows: 0, report: {}, changeSet: { afterTariffs: [{ id: imported.id }] } },
  });

  await assert.rejects(() => db.tariff.delete({ where: { id: lead.id } }), (error) => error.code === 'P2003');
  assert.equal((await db.lead.findFirst({ where: { tariffId: lead.id } }))?.tariffId, lead.id);

  const workflow = Object.create(PublicationWorkflowService.prototype);
  const service = new TariffPurgeService(db, workflow);
  const preview = await service.preview(site.id);
  assert.equal(preview.total, 8);
  assert.deepEqual(preview.items.filter((item) => item.blockers.length === 0).map((item) => item.id), [free.id, freeSecond.id]);
  for (const tariff of [lead, redirect, publication, publicationTrigger, validation, imported]) {
    assert.ok(preview.items.find((item) => item.id === tariff.id)?.blockers.length, `${tariff.slug} must be blocked`);
  }
  assert.ok(preview.items.find((item) => item.id === publication.id)?.blockers.includes('Упоминается в публикациях: 1'));
  assert.ok(preview.items.find((item) => item.id === publicationTrigger.id)?.blockers.includes('Упоминается в публикациях: 1'));
  const result = await service.purge({ siteId: site.id, offset: 0, ids: [free.id, freeSecond.id], fingerprint: preview.fingerprint, confirm: true });
  assert.equal(result.removed, 2);
  assert.equal(await db.tariff.findUnique({ where: { id: free.id } }), null);
  assert.equal(await db.tariff.findUnique({ where: { id: freeSecond.id } }), null);
  assert.equal(await db.tariff.count({ where: { id: { in: [lead.id, redirect.id, publication.id, publicationTrigger.id, validation.id, imported.id] } } }), 6);
  const audit = await db.auditEvent.findMany({ where: { entityType: 'TARIFF', entityId: { in: [free.id, freeSecond.id] } } });
  assert.equal(audit.length, 2);
  assert.ok(audit.every((event) => event.action === 'PURGE'));
  process.stdout.write('PostgreSQL 18: linked history blocked, free archive batch purged with audit\n');
} finally {
  if (db) await db.onModuleDestroy();
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', timeout: 30_000 });
}

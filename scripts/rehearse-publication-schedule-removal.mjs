import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { retirePublicationScheduler, isRetiredPublicationJob } from '../services/worker/src/retired-publication-jobs.mjs';

const require = createRequire(import.meta.url);
const workerRequire = createRequire(new URL('../services/worker/package.json', import.meta.url));
const { PrismaService } = require('../apps/api/dist/prisma.service.js');
const { Queue, Worker, QueueEvents } = workerRequire('bullmq');
const suffix = randomUUID().slice(0, 8);
const postgres = `astro-schedule-retirement-pg-${suffix}`;
const redis = `astro-schedule-retirement-redis-${suffix}`;
const migration = readFileSync(new URL('../prisma/migrations/0057_remove_publication_schedule/migration.sql', import.meta.url), 'utf8');
function command(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000, ...options });
}
function run(cmd, args, options) {
  const result = command(cmd, args, options);
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
const sql = (input) => command('docker', ['exec', '-i', postgres, 'psql', '-U', 'postgres', '-d', 'provider', '-v', 'ON_ERROR_STOP=1'], { input });
const port = (container, service) => Number(run('docker', ['port', container, service]).match(/:(\d+)\s*$/)[1]);
let db, queue, events, worker;
try {
  run('docker', ['run', '--rm', '-d', '--name', postgres, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const logs = command('docker', ['logs', postgres]);
    if (`${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete') && command('docker', ['exec', postgres, 'pg_isready', '-U', 'postgres', '-d', 'provider']).status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready);
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port(postgres, '5432/tcp')}/provider`;
  run('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], { env: process.env, shell: process.platform === 'win32' });
  db = new PrismaService(); await db.onModuleInit();
  await db.provider.create({ data: { id: 'retire-provider', name: 'Synthetic', slug: 'synthetic' } });
  await db.site.create({ data: { id: 'retire-site', providerId: 'retire-provider', name: 'Synthetic', slug: 'synthetic' } });
  // Recreate the exact old scheduling fields after checking fresh migration deploy.
  const setup = sql(`
    ALTER TYPE "SitePublicationStatus" ADD VALUE 'SCHEDULED';
    ALTER TABLE "SitePublication" ADD COLUMN "scheduledFor" TIMESTAMPTZ(3), ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);
    CREATE INDEX "SitePublication_status_scheduledFor_idx" ON "SitePublication"("status", "scheduledFor");
    INSERT INTO "SitePublication" (id, "siteId", "siteRevision", status, catalog, "triggerEntity", "triggerEntityId", "scheduledFor", "providerResponse", "createdAt", "updatedAt") VALUES
      ('waiting', 'retire-site', 1, 'SCHEDULED', '{"fixture":"waiting"}', 'site-schedule', 'retire-site', now()+interval '1 day', NULL, now(), now()),
      ('published', 'retire-site', 2, 'SUCCEEDED', '{"fixture":"published"}', 'site-schedule', 'retire-site', now()-interval '1 day', '{"deployment":"old-proof"}', now(), now()),
      ('cancelled', 'retire-site', 3, 'CANCELLED', '{"fixture":"cancelled"}', 'site-schedule', 'retire-site', now()+interval '2 days', NULL, now(), now()),
      ('handed-off', 'retire-site', 4, 'PENDING', '{"fixture":"handed-off"}', 'site-schedule', 'retire-site', now()-interval '1 hour', NULL, now(), now()),
      ('manual', 'retire-site', 5, 'PENDING', '{"fixture":"manual"}', 'site', 'retire-site', NULL, NULL, now(), now());
  `);
  assert.equal(setup.status, 0, setup.stderr);
  const blocked = sql(migration);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Finish active timed publications/);
  assert.equal((await db.$queryRaw`SELECT status::text FROM "SitePublication" WHERE id='waiting'`)[0].status, 'SCHEDULED');
  assert.equal((await db.$queryRaw`SELECT "providerResponse" FROM "SitePublication" WHERE id='published'`)[0].providerResponse.deployment, 'old-proof');
  await db.$executeRaw`UPDATE "SitePublication" SET status='FAILED' WHERE id='handed-off'`;
  const applied = sql(migration); assert.equal(applied.status, 0, applied.stderr);
  const rows = await db.sitePublication.findMany({ orderBy: { siteRevision: 'asc' } });
  assert.equal(rows.length, 5);
  assert.equal(rows[0].status, 'CANCELLED');
  assert.match(rows[0].lastError, /требуется ручной запуск/);
  assert.ok(rows[0].providerResponse.retiredSchedule.scheduledFor);
  assert.equal(rows[1].status, 'SUCCEEDED'); assert.equal(rows[1].providerResponse.deployment, 'old-proof');
  assert.deepEqual(rows[1].catalog, { fixture: 'published' });
  assert.equal(rows[4].status, 'PENDING'); assert.equal(rows[4].providerResponse, null);
  const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='SitePublication' AND column_name IN ('scheduledFor', 'cancelledAt')`;
  assert.equal(columns.length, 0);
  assert.equal((await db.site.findUnique({ where: { id: 'retire-site' } })).publishedRevision, 0);
  await assert.rejects(() => db.$executeRaw`UPDATE "SitePublication" SET status='SCHEDULED' WHERE id='waiting'`, /invalid input value/);

  run('docker', ['run', '--rm', '-d', '--name', redis, '-p', '127.0.0.1::6379', 'redis:8.10.1-alpine']);
  const connection = { host: '127.0.0.1', port: port(redis, '6379/tcp'), maxRetriesPerRequest: null };
  queue = new Queue('maintenance', { connection });
  await queue.upsertJobScheduler('publication-schedules-every-minute', { pattern: '* * * * *' }, { name: 'publication-schedules', data: {} });
  await queue.upsertJobScheduler('lead-decision-reconcile-every-minute', { pattern: '* * * * *' }, { name: 'lead-decision-reconcile', data: {} });
  await retirePublicationScheduler(queue);
  const schedulers = await queue.getJobSchedulers();
  assert.equal(schedulers.some((item) => item.key === 'publication-schedules-every-minute'), false);
  assert.equal(schedulers.some((item) => item.key === 'lead-decision-reconcile-every-minute'), true);
  events = new QueueEvents('maintenance', { connection }); await events.waitUntilReady();
  worker = new Worker('maintenance', async (job) => isRetiredPublicationJob(job) ? { retired: true } : { normal: true }, { connection });
  const residual = await queue.add('publication-schedules', {});
  assert.deepEqual(await residual.waitUntilFinished(events, 10000), { retired: true });
  const normal = await queue.add('lead-decision-reconcile', {});
  assert.deepEqual(await normal.waitUntilFinished(events, 10000), { normal: true });
  process.stdout.write('PostgreSQL/Redis: waiting schedules cancelled, active handoff blocked, history intact, fields removed, legacy scheduler retired and residual jobs ignored\n');
} finally {
  if (worker) await worker.close();
  if (events) await events.close();
  if (queue) await queue.close();
  if (db) await db.onModuleDestroy();
  command('docker', ['rm', '-f', redis]);
  command('docker', ['rm', '-f', postgres]);
}

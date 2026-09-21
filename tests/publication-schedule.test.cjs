const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const { PublicationWorkflowController } = require('../apps/api/dist/publication-workflow.controller.js');

const repositoryRoot = join(__dirname, '..');

function fixture() {
  const site = { id: 'site-1', slug: 'domru-site', connectionPhone: '78005557244', supportPhone: '78002507777', workingRevision: 3, publishedRevision: 2 };
  const publications = [];
  const prisma = {
    site: { findUnique: async ({ where }) => where.id === site.id ? site : null },
    sitePublication: {
      findUnique: async ({ where }) => {
        if (where.id) return publications.find((row) => row.id === where.id) || null;
        const key = where.siteId_siteRevision;
        return publications.find((row) => row.siteId === key.siteId && row.siteRevision === key.siteRevision) || null;
      },
      findFirst: async ({ where }) => publications.find((row) => (
        (!where.siteId || row.siteId === where.siteId)
        && (!where.status || row.status === where.status)
      )) || null,
      create: async ({ data }) => {
        const row = { id: `publication-${publications.length + 1}`, status: 'PENDING', createdAt: new Date(), updatedAt: new Date(), ...data };
        publications.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const index = publications.findIndex((row) => row.id === where.id);
        publications[index] = { ...publications[index], ...data, updatedAt: new Date() };
        return publications[index];
      },
      updateMany: async ({ where, data }) => {
        const index = publications.findIndex((row) => row.id === where.id && (!where.status || row.status === where.status));
        if (index < 0) return { count: 0 };
        publications[index] = { ...publications[index], ...data, updatedAt: new Date() };
        return { count: 1 };
      },
    },
    $transaction: async (callback) => callback(prisma),
  };
  const catalog = { listBySiteId: async () => ({ site: { slug: site.slug }, marker: 'revision-3' }) };
  return { service: new PublicationWorkflowService(prisma, catalog), publications };
}

test('publication schedule schema is additive and stores explicit lifecycle timestamps', () => {
  const schema = readFileSync(join(repositoryRoot, 'prisma', 'schema.prisma'), 'utf8');
  const migration = readFileSync(join(repositoryRoot, 'prisma', 'migrations', '0031_publication_schedule', 'migration.sql'), 'utf8');

  assert.match(schema, /enum SitePublicationStatus[\s\S]*SCHEDULED[\s\S]*CANCELLED/);
  assert.match(schema, /model SitePublication[\s\S]*scheduledFor\s+DateTime\?[\s\S]*cancelledAt\s+DateTime\?/);
  assert.match(migration, /ADD VALUE 'SCHEDULED'/);
  assert.match(migration, /ADD VALUE 'CANCELLED'/);
  assert.match(migration, /ADD COLUMN "scheduledFor" TIMESTAMPTZ\(3\)/);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
});

test('scheduling captures the exact working snapshot and cancellation never publishes it', async () => {
  const f = fixture();
  const scheduledFor = new Date(Date.now() + 3_600_000);

  const scheduled = await f.service.prepareScheduledPublication({
    siteId: 'site-1',
    expectedWorkingRevision: 3,
    scheduledFor,
    triggerEntity: 'site',
    triggerEntityId: 'site-1',
    requestedById: 'user-1',
  });

  assert.equal(scheduled.status, 'SCHEDULED');
  assert.equal(scheduled.siteRevision, 3);
  assert.equal(scheduled.catalog.marker, 'revision-3');
  assert.equal(scheduled.scheduledFor.toISOString(), scheduledFor.toISOString());

  const cancelled = await f.service.cancelScheduledPublication('site-1', scheduled.id);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.ok(cancelled.cancelledAt instanceof Date);
  assert.equal(cancelled.publishedAt, undefined);
});

test('publishing now promotes the same scheduled snapshot instead of capturing mutable data again', async () => {
  const f = fixture();
  const scheduled = await f.service.prepareScheduledPublication({
    siteId: 'site-1', expectedWorkingRevision: 3, scheduledFor: new Date(Date.now() + 3_600_000),
    triggerEntity: 'site-schedule', triggerEntityId: 'site-1', requestedById: 'user-1',
  });

  const immediate = await f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 3,
    triggerEntity: 'site', triggerEntityId: 'site-1', requestedById: 'user-1',
  });

  assert.equal(immediate.id, scheduled.id);
  assert.equal(immediate.status, 'PENDING');
  assert.equal(immediate.scheduledFor, null);
  assert.equal(f.publications.length, 1);
});

test('due claim cancels a superseded snapshot and claims only the current exact version', async () => {
  const now = new Date('2026-09-15T12:00:00.000Z');
  const rows = [
    { id: 'publication-old', siteId: 'site-1', siteRevision: 2, status: 'SCHEDULED', scheduledFor: new Date('2026-09-15T11:00:00.000Z'), updatedAt: new Date('2026-09-15T10:00:00.000Z'), site: { publishedRevision: 2 } },
    { id: 'publication-current', siteId: 'site-2', siteRevision: 4, status: 'SCHEDULED', scheduledFor: new Date('2026-09-15T11:30:00.000Z'), updatedAt: new Date('2026-09-15T10:00:00.000Z'), site: { publishedRevision: 3 } },
  ];
  const publications = {
    findMany: async () => rows,
    findFirst: async ({ where }) => rows.find((row) => row.siteId === where.siteId && row.siteRevision > where.siteRevision.gt) || null,
    updateMany: async ({ where, data }) => {
      const row = rows.find((item) => item.id === where.id && item.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, data, { updatedAt: now });
      return { count: 1 };
    },
  };
  const prisma = { sitePublication: publications, $transaction: async (callback) => callback(prisma) };
  const service = new PublicationWorkflowService(prisma, { listBySiteId: async () => ({}) });

  const claimed = await service.claimDuePublications(now);

  assert.deepEqual(claimed.map((row) => row.id), ['publication-current']);
  assert.equal(rows[0].status, 'CANCELLED');
  assert.ok(rows[0].cancelledAt instanceof Date);
  assert.equal(rows[1].status, 'PENDING');
});

test('schedule rejects a past timestamp before reading or writing the database', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.prepareScheduledPublication({
    siteId: 'site-1', expectedWorkingRevision: 3, scheduledFor: new Date(Date.now() - 1_000),
    triggerEntity: 'site-schedule', triggerEntityId: 'site-1',
  }), /будущем/i);
  assert.equal(f.publications.length, 0);
});

test('schedule controller manages exact snapshots and releases due work through the existing rebuild queue', async () => {
  const calls = [];
  const scheduled = { id: 'publication-3', siteId: 'site-1', siteRevision: 3, status: 'SCHEDULED' };
  const publications = {
    prepareScheduledPublication: async (input) => { calls.push(['schedule', input]); return scheduled; },
    cancelScheduledPublication: async (siteId, publicationId) => { calls.push(['cancel', siteId, publicationId]); return { ...scheduled, status: 'CANCELLED' }; },
    claimDuePublications: async () => [{ ...scheduled, status: 'PENDING' }],
    releaseScheduleClaim: async (id, error) => calls.push(['release', id, error]),
  };
  const rebuilds = {
    enqueue: async (input) => { calls.push(['enqueue', input]); return { id: 'rebuild-1', status: 'QUEUED' }; },
  };
  const controller = new PublicationWorkflowController(publications, rebuilds);
  const scheduledFor = new Date(Date.now() + 3_600_000).toISOString();

  const created = await controller.schedule('site-1', { expectedWorkingRevision: 3, scheduledFor }, { user: { id: 'user-1' } });
  const cancelled = await controller.cancelSchedule('site-1', scheduled.id);
  const released = await controller.releaseDueSchedules();

  assert.equal(created.status, 'SCHEDULED');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(released.processed, 1);
  assert.deepEqual(calls, [
    ['schedule', { siteId: 'site-1', expectedWorkingRevision: 3, scheduledFor: new Date(scheduledFor), triggerEntity: 'site-schedule', triggerEntityId: 'site-1', requestedById: 'user-1' }],
    ['cancel', 'site-1', 'publication-3'],
    ['enqueue', { entity: 'site-publication-schedule', id: 'publication-3', siteId: 'site-1', publicationId: 'publication-3' }],
  ]);
});

test('due release returns a failed enqueue claim to scheduled state for retry', async () => {
  const calls = [];
  const publication = { id: 'publication-3', siteId: 'site-1', siteRevision: 3, status: 'PENDING' };
  const controller = new PublicationWorkflowController({
    claimDuePublications: async () => [publication],
    releaseScheduleClaim: async (id, error) => calls.push([id, error]),
  }, {
    enqueue: async () => { throw new Error('Redis unavailable'); },
  });

  await assert.rejects(
    () => controller.releaseDueSchedules(),
    (error) => error.getStatus() === 503 && /Redis unavailable/.test(error.message),
  );
  assert.deepEqual(calls, [['publication-3', 'Redis unavailable']]);
});

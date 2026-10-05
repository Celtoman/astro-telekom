const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const root = join(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

test('publication exposes only manual create/state/review, without scheduling DTO or controller operations', () => {
  const { PublicationWorkflowController } = require('../apps/api/dist/publication-workflow.controller.js');
  const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
  const dto = require('../apps/api/dist/publication-workflow.dto.js');
  for (const method of ['schedule', 'cancelSchedule', 'releaseDueSchedules']) assert.equal(PublicationWorkflowController.prototype[method], undefined);
  for (const method of ['prepareScheduledPublication', 'cancelScheduledPublication', 'claimDuePublications', 'releaseScheduleClaim']) assert.equal(PublicationWorkflowService.prototype[method], undefined);
  assert.equal(dto.ScheduleSitePublicationDto, undefined);
  assert.equal(typeof PublicationWorkflowController.prototype.create, 'function');
  assert.equal(typeof PublicationWorkflowController.prototype.review, 'function');
  assert.doesNotMatch(read('apps/admin/src/components/PublicationStatusCard.tsx'), /datetime-local|Запланировать|расписанию|publication-schedules/);
  assert.doesNotMatch(read('apps/admin/src/lib/publication-display.mjs'), /scheduledPublication|SCHEDULED/);
});

test('worker retires persisted scheduler and recognizes residual jobs without a publication API call', async () => {
  const path = join(root, 'services/worker/src/retired-publication-jobs.mjs');
  assert.equal(existsSync(path), true);
  const { retirePublicationScheduler, isRetiredPublicationJob } = await import(pathToFileURL(path));
  const removed = [];
  await retirePublicationScheduler({ removeJobScheduler: async (id) => { removed.push(id); return true; } });
  assert.deepEqual(removed, ['publication-schedules-every-minute']);
  assert.equal(isRetiredPublicationJob({ name: 'publication-schedules' }), true);
  assert.equal(isRetiredPublicationJob({ name: 'lead-decision-reconcile' }), false);
  assert.equal(isRetiredPublicationJob({ name: 'pii-retention' }), false);
  assert.doesNotMatch(read('services/worker/src/index.mjs'), /release-due/);
});

test('forward migration retires waiting snapshots and removes schedule schema without deleting history', () => {
  const migration = join(root, 'prisma/migrations/0057_remove_publication_schedule/migration.sql');
  assert.equal(existsSync(migration), true);
  const sql = readFileSync(migration, 'utf8');
  assert.match(sql, /retiredSchedule/);
  assert.match(sql, /CANCELLED/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /DROP COLUMN "scheduledFor"/);
  assert.match(sql, /DROP COLUMN "cancelledAt"/);
  assert.doesNotMatch(sql, /DELETE FROM "SitePublication"/);
  assert.doesNotMatch(read('prisma/schema.prisma'), /SCHEDULED|scheduledFor|cancelledAt/);
});

test('schedule retirement runs against real isolated PostgreSQL and Redis without advancing published data', { timeout: 300000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/rehearse-publication-schedule-removal.mjs'], { cwd: root, encoding: 'utf8', timeout: 300000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /waiting schedules cancelled, active handoff blocked, history intact/);
  assert.match(result.stdout, /legacy scheduler retired and residual jobs ignored/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RebuildQueueService } = require('../apps/api/dist/rebuild-queue.service.js');

function fixture(initial = {}) {
  let record = initial.record || null;
  const updates = [];
  const queueCalls = [];
  const publicationCalls = [];
  const siteRebuild = {
    findUnique: async () => record,
    findMany: async () => record ? [record] : [],
    upsert: async ({ create, update }) => {
      record = record
        ? { ...record, ...update, requestedRevision: record.requestedRevision + (update.requestedRevision?.increment || 0) }
        : {
            id: 'rebuild-1',
            status: 'PENDING',
            requestedRevision: 1,
            processingRevision: 0,
            publishedRevision: 0,
            attempts: 0,
            maxAttempts: 3,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
      return record;
    },
    update: async ({ data }) => {
      updates.push(data);
      record = { ...record, ...data };
      return record;
    },
    updateMany: async ({ where, data }) => {
      if (!record || record.id !== where.id) return { count: 0 };
      if (where.status !== undefined && record.status !== where.status) return { count: 0 };
      if (typeof where.requestedRevision === 'number' && record.requestedRevision !== where.requestedRevision) return { count: 0 };
      if (where.requestedRevision?.gt !== undefined && record.requestedRevision <= where.requestedRevision.gt) return { count: 0 };
      if (typeof where.processingRevision === 'number' && record.processingRevision !== where.processingRevision) return { count: 0 };
      if (where.publishedRevision?.lt !== undefined && record.publishedRevision >= where.publishedRevision.lt) return { count: 0 };
      updates.push(data);
      record = { ...record, ...data };
      return { count: 1 };
    },
  };
  const publicationWorkflow = {
    markRunning: async (publicationId) => publicationCalls.push(['running', publicationId]),
    markSucceeded: async (publicationId, result) => publicationCalls.push(['succeeded', publicationId, result]),
    markFailed: async (publicationId, error) => publicationCalls.push(['failed', publicationId, error]),
  };
  const service = new RebuildQueueService({ siteRebuild }, publicationWorkflow);
  service.queue = {
    add: async (...args) => {
      queueCalls.push(args);
      return { id: args[2].jobId };
    },
    close: async () => {},
  };
  service.redis = { quit: async () => {} };
  return { service, queueCalls, updates, publicationCalls, getRecord: () => record };
}

test('rebuild keeps requested and processing publication snapshots separate', async () => {
  const f = fixture();

  await f.service.enqueue({ entity: 'tariff', id: 'tariff-1', siteId: 'site-1', publicationId: 'publication-1' });
  const started = await f.service.startAttempt('rebuild-1', 1, 3);
  await f.service.enqueue({ entity: 'tariff', id: 'tariff-1', siteId: 'site-1', publicationId: 'publication-2' });

  assert.equal(started.publicationId, 'publication-1');
  assert.equal(f.getRecord().processingPublicationId, 'publication-1');
  assert.equal(f.getRecord().requestedPublicationId, 'publication-2');
  assert.deepEqual(f.publicationCalls, [['running', 'publication-1']]);
});

test('a legacy rebuild clears stale publication pointers from an earlier snapshot build', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1', dedupeKey: 'site:site-1', siteId: 'site-1', status: 'SUCCEEDED', affectedPaths: ['/*'],
      requestedRevision: 1, processingRevision: 1, publishedRevision: 1, attempts: 1, maxAttempts: 3,
      requestedPublicationId: 'publication-old', processingPublicationId: 'publication-old', publishedPublicationId: 'publication-old',
    },
  });

  await f.service.enqueue({ entity: 'page', id: 'page-1', siteId: 'site-1' });
  const started = await f.service.startAttempt('rebuild-1', 1, 3);

  assert.equal(f.getRecord().requestedPublicationId, null);
  assert.equal(f.getRecord().processingPublicationId, null);
  assert.equal(started.publicationId, null);
  assert.deepEqual(f.publicationCalls, []);
});

test('successful rebuild publishes only its processing snapshot', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1', dedupeKey: 'site:site-1', siteId: 'site-1', status: 'RUNNING', affectedPaths: ['/*'],
      requestedRevision: 2, processingRevision: 1, publishedRevision: 0, attempts: 1, maxAttempts: 3,
      requestedPublicationId: 'publication-2', processingPublicationId: 'publication-1', publishedPublicationId: null,
    },
  });

  await f.service.finishSuccessfulRevision('rebuild-1', 1, { status: 'SUCCEEDED', deploymentId: 'deploy-1' });

  assert.equal(f.getRecord().publishedPublicationId, 'publication-1');
  assert.deepEqual(f.publicationCalls, [['succeeded', 'publication-1', { status: 'SUCCEEDED', deploymentId: 'deploy-1' }]]);
});

test('final rebuild failure marks only its processing publication failed', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1', dedupeKey: 'site:site-1', siteId: 'site-1', status: 'RUNNING', affectedPaths: ['/*'],
      requestedRevision: 1, processingRevision: 1, publishedRevision: 0, attempts: 2, maxAttempts: 3,
      requestedPublicationId: 'publication-1', processingPublicationId: 'publication-1', publishedPublicationId: null,
    },
  });

  await f.service.reportResult('rebuild-1', { attemptNumber: 3, maxAttempts: 3, revision: 1, error: 'Coolify failed' });

  assert.deepEqual(f.publicationCalls, [['failed', 'publication-1', 'Coolify failed']]);
});

test('rebuild changes for one site are persisted and deduplicated while queued', async () => {
  const f = fixture();

  await f.service.enqueue({ entity: 'page', id: 'page-1', siteId: 'site-1' });
  await f.service.enqueue({ entity: 'tariff', id: 'tariff-1', siteId: 'site-1' });

  assert.equal(f.getRecord().dedupeKey, 'site:site-1');
  assert.deepEqual(f.getRecord().affectedPaths, ['/*']);
  assert.equal(f.getRecord().requestedRevision, 2);
  assert.equal(f.queueCalls.length, 1);
  assert.deepEqual(f.queueCalls[0][1], { rebuildId: 'rebuild-1', revision: 1 });
  assert.deepEqual(f.queueCalls[0][2], {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    jobId: 'rebuild-1-1',
    removeOnComplete: 100,
    removeOnFail: 100,
  });
});

test('transient provider error is recorded for BullMQ retry', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'QUEUED',
      affectedPaths: ['/*'],
      requestedRevision: 1,
      processingRevision: 0,
      publishedRevision: 0,
      attempts: 0,
      maxAttempts: 3,
    },
  });
  const started = await f.service.startAttempt('rebuild-1', 1, 3);
  const result = await f.service.reportResult('rebuild-1', { attemptNumber: 1, maxAttempts: 3, revision: started.revision, error: '503 unavailable' });
  assert.equal(result.status, 'RETRYING');
  assert.equal(f.getRecord().status, 'RETRYING');
  assert.equal(f.getRecord().attempts, 1);
  assert.equal(f.getRecord().publishedRevision, 0);
});

test('final provider error marks the job failed without publishing its revision', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'RETRYING',
      affectedPaths: ['/*'],
      requestedRevision: 4,
      processingRevision: 4,
      publishedRevision: 2,
      attempts: 2,
      maxAttempts: 3,
    },
  });
  await f.service.reportResult('rebuild-1', { attemptNumber: 3, maxAttempts: 3, revision: 4, error: '500 failed' });
  assert.equal(f.getRecord().status, 'FAILED');
  assert.equal(f.getRecord().publishedRevision, 2);
  assert.ok(f.getRecord().completedAt instanceof Date);
});

test('only an explicit final provider result publishes the processed revision', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'QUEUED',
      affectedPaths: ['/*'],
      requestedRevision: 2,
      processingRevision: 0,
      publishedRevision: 0,
      attempts: 0,
      maxAttempts: 3,
    },
  });
  const started = await f.service.startAttempt('rebuild-1', 1, 3);
  const result = await f.service.reportResult('rebuild-1', {
    attemptNumber: 1,
    maxAttempts: 3,
    revision: started.revision,
    result: { status: 'SUCCEEDED', deploymentId: 'deploy-42', url: 'https://example.test' },
  });

  assert.equal(result.published, true);
  assert.equal(f.getRecord().status, 'SUCCEEDED');
  assert.equal(f.getRecord().processingRevision, 2);
  assert.equal(f.getRecord().publishedRevision, 2);
  assert.equal(f.getRecord().providerDeploymentId, 'deploy-42');
});

test('a successful HTTP response without final provider status is retried, not published', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'QUEUED',
      affectedPaths: ['/*'],
      requestedRevision: 1,
      processingRevision: 0,
      publishedRevision: 0,
      attempts: 0,
      maxAttempts: 3,
    },
  });
  const started = await f.service.startAttempt('rebuild-1', 1, 3);
  await f.service.reportResult('rebuild-1', { attemptNumber: 1, maxAttempts: 3, revision: started.revision, error: 'final status missing' });
  assert.equal(f.getRecord().status, 'RETRYING');
  assert.equal(f.getRecord().publishedRevision, 0);
});

test('an edit during a running build schedules the newer revision after success', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'RUNNING',
      affectedPaths: ['/*'],
      requestedRevision: 2,
      processingRevision: 1,
      publishedRevision: 0,
      attempts: 1,
      maxAttempts: 3,
    },
  });
  await f.service.finishSuccessfulRevision('rebuild-1', 1, { status: 'SUCCEEDED', deploymentId: 'deploy-1' });

  assert.equal(f.getRecord().publishedRevision, 1);
  assert.equal(f.getRecord().status, 'QUEUED');
  assert.equal(f.queueCalls.length, 1);
  assert.equal(f.queueCalls[0][2].jobId, 'rebuild-1-2');
});

test('a stale BullMQ job is skipped after its revision was already published', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'SUCCEEDED',
      affectedPaths: ['/*'],
      requestedRevision: 2,
      processingRevision: 2,
      publishedRevision: 2,
      attempts: 1,
      maxAttempts: 3,
    },
  });

  assert.deepEqual(await f.service.startAttempt('rebuild-1', 2, 3, 2), { skipped: true, reason: 'already_published' });
  assert.equal(f.getRecord().status, 'SUCCEEDED');
});

test('provider progress stores a deployment UUID only for the running revision', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'RUNNING',
      affectedPaths: ['/*'],
      requestedRevision: 4,
      processingRevision: 4,
      publishedRevision: 2,
      attempts: 1,
      maxAttempts: 3,
      providerDeploymentId: null,
      providerStatus: null,
    },
  });

  const stored = await f.service.recordProviderProgress('rebuild-1', {
    revision: 4,
    deploymentId: 'deployment-42',
    providerStatus: 'IN_PROGRESS',
    providerResponse: { deployment_uuid: 'deployment-42', status: 'in_progress' },
  });

  assert.equal(stored.saved, true);
  assert.equal(f.getRecord().providerDeploymentId, 'deployment-42');
  assert.equal(f.getRecord().providerStatus, 'IN_PROGRESS');
  const stale = await f.service.recordProviderProgress('rebuild-1', {
    revision: 3,
    deploymentId: 'stale-deployment',
    providerStatus: 'QUEUED',
  });
  assert.equal(stale.skipped, true);
  assert.equal(f.getRecord().providerDeploymentId, 'deployment-42');
});

test('a late success cannot overwrite a newer running revision', async () => {
  const f = fixture({
    record: {
      id: 'rebuild-1',
      dedupeKey: 'site:site-1',
      siteId: 'site-1',
      status: 'RUNNING',
      affectedPaths: ['/*'],
      requestedRevision: 2,
      processingRevision: 2,
      publishedRevision: 0,
      attempts: 1,
      maxAttempts: 3,
    },
  });

  const result = await f.service.finishSuccessfulRevision('rebuild-1', 1, { status: 'SUCCEEDED', deploymentId: 'stale' });

  assert.equal(result.skipped, true);
  assert.equal(f.getRecord().status, 'RUNNING');
  assert.equal(f.getRecord().processingRevision, 2);
  assert.equal(f.getRecord().publishedRevision, 0);
});

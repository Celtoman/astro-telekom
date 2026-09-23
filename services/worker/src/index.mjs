import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { runRebuildJob } from './rebuild-job.mjs';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const apiUrl = process.env.API_URL || 'http://localhost:3000/api/v1';
const adminToken = process.env.ADMIN_API_TOKEN;
const piiRetentionDays = Number(process.env.PII_RETENTION_DAYS);
const hasValidPiiRetention = Number.isSafeInteger(piiRetentionDays) && piiRetentionDays > 0 && piiRetentionDays <= 3_650;
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const maintenanceQueue = new Queue('maintenance', { connection });

const jsonRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
};

const importWorker = new Worker(
  'tariff-imports',
  async (job) => {
    if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
    return jsonRequest(`${apiUrl}/admin/tariffs/import`, {
      method: 'POST',
      headers: { 'x-admin-token': adminToken },
      body: JSON.stringify(job.data),
    });
  },
  { connection, concurrency: 2 },
);

const rebuildWorker = new Worker(
  'site-rebuilds',
  (job) => runRebuildJob(job, {
    apiUrl,
    adminToken,
    provider: process.env.REBUILD_PROVIDER,
    rebuildUrl: process.env.REBUILD_WEBHOOK_URL,
    coolifyApiUrl: process.env.COOLIFY_API_URL,
    coolifyApiToken: process.env.COOLIFY_API_TOKEN,
    coolifyResourceUuid: process.env.COOLIFY_RESOURCE_UUID,
    coolifyPollIntervalMs: process.env.COOLIFY_POLL_INTERVAL_MS,
    coolifyDeployTimeoutMs: process.env.COOLIFY_DEPLOY_TIMEOUT_MS,
    jsonRequest,
  }),
  { connection, concurrency: 1 },
);

const leadDeliveryWorker = new Worker(
  'lead-deliveries',
  async (job) => {
    if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
    return jsonRequest(`${apiUrl}/internal/lead-deliveries/${encodeURIComponent(job.data.leadId)}`, {
      method: 'POST',
      headers: { 'x-admin-token': adminToken },
      body: JSON.stringify({ attemptNumber: job.data.attemptNumber, retryNumber: job.data.retryNumber }),
    });
  },
  { connection, concurrency: 4 },
);

const leadDecisionWorker = new Worker(
  'lead-decisions',
  async (job) => {
    if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
    return jsonRequest(`${apiUrl}/internal/lead-decisions/${encodeURIComponent(job.data.leadId)}`, {
      method: 'POST',
      headers: { 'x-admin-token': adminToken },
      body: JSON.stringify({ attemptNumber: job.data.attemptNumber }),
    });
  },
  { connection, concurrency: 4 },
);

const leadNotificationWorker = new Worker(
  'lead-notifications',
  async (job) => {
    if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
    return jsonRequest(`${apiUrl}/internal/lead-notifications/${encodeURIComponent(job.data.notificationId)}`, {
      method: 'POST',
      headers: { 'x-admin-token': adminToken },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        attemptNumber: job.data.attemptNumber,
        maxAttempts: job.data.maxAttempts,
        revision: job.data.revision,
      }),
    });
  },
  { connection, concurrency: 4 },
);

const maintenanceWorker = new Worker(
  'maintenance',
  async (job) => {
    if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
    if (job.name === 'publication-schedules') {
      return jsonRequest(`${apiUrl}/internal/site-publications/release-due`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
        body: '{}',
      });
    }
    if (job.name === 'lead-decision-reconcile') {
      return jsonRequest(`${apiUrl}/internal/lead-decisions/reconcile`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
        body: '{}',
      });
    }
    if (job.name !== 'pii-retention') throw new Error(`Unsupported maintenance job: ${job.name}`);
    const totals = { leads: 0, addressChecks: 0, accessTokens: 0, detachedDuplicates: 0, batches: 0 };
    for (let batch = 0; batch < 100; batch += 1) {
      const result = await jsonRequest(`${apiUrl}/internal/pii-retention`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
        body: '{}',
      });
      totals.leads += result.deleted.leads;
      totals.addressChecks += result.deleted.addressChecks;
      totals.accessTokens += result.deleted.accessTokens;
      totals.detachedDuplicates += result.detachedDuplicates;
      totals.batches += 1;
      if (result.complete) return { ...totals, cutoff: result.cutoff };
    }
    throw new Error('PII retention exceeded 100 batches; retrying the remaining backlog');
  },
  { connection, concurrency: 1 },
);

await maintenanceQueue.upsertJobScheduler(
  'publication-schedules-every-minute',
  { pattern: '* * * * *', tz: 'UTC' },
  { name: 'publication-schedules', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 100, removeOnFail: 100 } },
);

await maintenanceQueue.upsertJobScheduler(
  'lead-decision-reconcile-every-minute',
  { pattern: '* * * * *', tz: 'UTC' },
  { name: 'lead-decision-reconcile', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 100, removeOnFail: 100 } },
);

if (hasValidPiiRetention) {
  await maintenanceQueue.upsertJobScheduler(
    'pii-retention-daily',
    { pattern: process.env.PII_RETENTION_CRON || '0 3 * * *', tz: 'UTC' },
    { name: 'pii-retention', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 30, removeOnFail: 100 } },
  );
} else {
  console.warn('[worker] PII_RETENTION_DAYS is missing or invalid; retention scheduler is disabled');
}

for (const worker of [importWorker, rebuildWorker, leadDecisionWorker, leadDeliveryWorker, leadNotificationWorker, maintenanceWorker]) {
  worker.on('completed', (job) => console.log(`[worker] ${job.queueName}/${job.id} completed`));
  worker.on('failed', (job, error) => console.error(`[worker] ${job?.queueName}/${job?.id} failed`, error));
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}, closing workers`);
  await Promise.all([importWorker.close(), rebuildWorker.close(), leadDecisionWorker.close(), leadDeliveryWorker.close(), leadNotificationWorker.close(), maintenanceWorker.close(), maintenanceQueue.close()]);
  await connection.quit();
  console.log('[worker] shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

console.log('[worker] tariff-imports, site-rebuilds, lead-decisions, lead-deliveries, lead-notifications and maintenance are listening');

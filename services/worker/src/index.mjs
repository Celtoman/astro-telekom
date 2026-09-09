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
    rebuildUrl: process.env.REBUILD_WEBHOOK_URL,
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
      body: JSON.stringify({ attemptNumber: job.data.attemptNumber }),
    });
  },
  { connection, concurrency: 4 },
);

const piiRetentionWorker = new Worker(
  'maintenance',
  async (job) => {
    if (job.name !== 'pii-retention') throw new Error(`Unsupported maintenance job: ${job.name}`);
    if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
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

if (hasValidPiiRetention) {
  await maintenanceQueue.upsertJobScheduler(
    'pii-retention-daily',
    { pattern: process.env.PII_RETENTION_CRON || '0 3 * * *', tz: 'UTC' },
    { name: 'pii-retention', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 30, removeOnFail: 100 } },
  );
} else {
  console.warn('[worker] PII_RETENTION_DAYS is missing or invalid; retention scheduler is disabled');
}

for (const worker of [importWorker, rebuildWorker, leadDeliveryWorker, piiRetentionWorker]) {
  worker.on('completed', (job) => console.log(`[worker] ${job.queueName}/${job.id} completed`));
  worker.on('failed', (job, error) => console.error(`[worker] ${job?.queueName}/${job?.id} failed`, error));
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}, closing workers`);
  await Promise.all([importWorker.close(), rebuildWorker.close(), leadDeliveryWorker.close(), piiRetentionWorker.close(), maintenanceQueue.close()]);
  await connection.quit();
  console.log('[worker] shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

console.log('[worker] tariff-imports, site-rebuilds, lead-deliveries and maintenance are listening');

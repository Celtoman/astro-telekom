import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const apiUrl = process.env.API_URL || 'http://localhost:3000/api/v1';
const adminToken = process.env.ADMIN_API_TOKEN;
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

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
  async (job) => {
    const rebuildUrl = process.env.REBUILD_WEBHOOK_URL;
    if (!rebuildUrl) return { skipped: true, reason: 'REBUILD_WEBHOOK_URL is not configured' };
    return jsonRequest(rebuildUrl, { method: 'POST', body: JSON.stringify(job.data) });
  },
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

for (const worker of [importWorker, rebuildWorker, leadDeliveryWorker]) {
  worker.on('completed', (job) => console.log(`[worker] ${job.queueName}/${job.id} completed`));
  worker.on('failed', (job, error) => console.error(`[worker] ${job?.queueName}/${job?.id} failed`, error));
}

console.log('[worker] tariff-imports, site-rebuilds and lead-deliveries are listening');

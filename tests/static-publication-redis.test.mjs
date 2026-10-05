import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runRebuildJob } from '../services/worker/src/rebuild-job.mjs';
const require = createRequire(new URL('../services/worker/package.json', import.meta.url));
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

test('real Redis and BullMQ recover uncertain activation beyond failure-attempt limit without a failed job', { timeout: 75000 }, async () => {
  const container = `astro-static-recovery-${randomUUID().slice(0, 8)}`;
  const docker = args => {
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout.trim();
  };
  let connection; let queue; let worker; let timer;
  try {
    docker(['run', '-d', '--name', container, '-p', '127.0.0.1::6379', 'redis:8.10.1-alpine']);
    const port = JSON.parse(docker(['inspect', container]))[0].NetworkSettings.Ports['6379/tcp'][0].HostPort;
    connection = new IORedis(`redis://127.0.0.1:${port}`, { maxRetriesPerRequest: null });
    connection.on('error', () => undefined);
    queue = new Queue('site-rebuilds', { connection });
    const rebuild = { rebuildId: 'rebuild-1', siteId: 'site-1', publicationId: 'pub-b', revision: 2, siteSlug: 'domru-site' };
    const receipt = { status: 'SUCCEEDED', rebuildId: 'rebuild-1', rebuildRevision: 2, siteId: 'site-1', publicationId: 'pub-b',
      siteRevision: 7, artifactId: 'a'.repeat(64), rendererId: 'b'.repeat(64), catalogDigest: 'c'.repeat(64), manifestDigest: 'd'.repeat(64) };
    let checks = 0; let starts = 0; let failed = 0; const results = [];
    worker = new Worker('site-rebuilds', job => runRebuildJob(job, {
      apiUrl: 'http://api/api/v1', adminToken: 'synthetic', provider: 'static', publicationUrl: 'http://web:8081',
      jsonRequest: async (url, request) => {
        if (url.endsWith('/start')) { starts++; return rebuild; }
        if (url.endsWith('/result')) results.push(JSON.parse(request.body));
        return { saved: true };
      },
      fetchImpl: async url => url.includes('/receipts/')
        ? Response.json(++checks === 1 ? { status: 'NOT_FOUND' } : receipt)
        : Response.json({ status: 'UNCERTAIN' }, { status: 202 }),
    }), { connection, concurrency: 1 });
    worker.on('failed', () => failed++);
    const completed = new Promise((accept, reject) => {
      worker.once('completed', accept); worker.once('error', reject);
      timer = setTimeout(() => reject(new Error('Static recovery did not complete')), 60000);
    });
    await worker.waitUntilReady();
    const job = await queue.add('rebuild', { rebuildId: 'rebuild-1', revision: 2 }, { attempts: 1 });
    await completed;
    assert.equal(await job.getState(), 'completed'); assert.equal(starts, 2); assert.equal(failed, 0);
    assert.equal(results.length, 1); assert.deepEqual(results[0].result, receipt); assert.equal(results[0].error, undefined);
  } finally {
    clearTimeout(timer); await worker?.close(); await queue?.close(); await connection?.quit();
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', timeout: 30000 });
  }
});

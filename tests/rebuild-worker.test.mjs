import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRebuildJob } from '../services/worker/src/rebuild-job.mjs';

function fixture(providerResponse) {
  const requests = [];
  const jsonRequest = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    if (url.endsWith('/start')) {
      return { rebuildId: 'rebuild-1', siteId: 'site-1', dedupeKey: 'site:site-1', affectedPaths: ['/*'], revision: 4 };
    }
    return { saved: true };
  };
  const fetchImpl = async (_url, options) => {
    requests.push({ url: 'provider', body: JSON.parse(options.body) });
    return providerResponse;
  };
  const job = { data: { rebuildId: 'rebuild-1' }, attemptsMade: 0, opts: { attempts: 3 } };
  const options = {
    apiUrl: 'https://api.example.test/api/v1',
    adminToken: 'service-token',
    rebuildUrl: 'https://deploy.example.test/rebuild',
    jsonRequest,
    fetchImpl,
  };
  return { job, options, requests };
}

test('worker calls deployment provider and persists its final success through API', async () => {
  const f = fixture({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ status: 'SUCCEEDED', deploymentId: 'deploy-42' }),
  });

  await runRebuildJob(f.job, f.options);

  assert.equal(f.requests[1].url, 'provider');
  assert.equal(f.requests[1].body.revision, 4);
  assert.equal(f.requests[1].body.rebuildId, 'rebuild-1');
  assert.equal(f.requests[2].body.result.status, 'SUCCEEDED');
  assert.equal(f.requests[2].body.attemptNumber, 1);
});

test('worker persists provider failure and rethrows it for BullMQ retry', async () => {
  const f = fixture({ ok: false, status: 503, text: async () => 'unavailable' });

  await assert.rejects(runRebuildJob(f.job, f.options), /503/);

  assert.match(f.requests[2].body.error, /503/);
  assert.equal(f.requests[2].body.maxAttempts, 3);
});

test('worker rejects HTTP success without final SUCCEEDED result', async () => {
  const f = fixture({ ok: true, status: 202, text: async () => JSON.stringify({ status: 'QUEUED' }) });

  await assert.rejects(runRebuildJob(f.job, f.options), /final status SUCCEEDED/);

  assert.match(f.requests[2].body.error, /final status SUCCEEDED/);
});

test('worker persists missing deployment configuration as an attempt failure', async () => {
  const f = fixture({ ok: true, status: 200, text: async () => '' });
  f.options.rebuildUrl = undefined;

  await assert.rejects(runRebuildJob(f.job, f.options), /REBUILD_WEBHOOK_URL/);

  assert.match(f.requests[1].body.error, /REBUILD_WEBHOOK_URL/);
});

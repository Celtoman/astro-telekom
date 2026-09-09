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

test('worker persists Coolify deployment UUID and waits for a final finished status', async () => {
  const requests = [];
  const statuses = ['queued', 'in_progress', 'finished'];
  const jsonRequest = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ kind: 'api', url, body });
    if (url.endsWith('/start')) {
      return { rebuildId: 'rebuild-1', siteId: 'site-1', affectedPaths: ['/*'], revision: 4 };
    }
    return { saved: true };
  };
  const fetchImpl = async (url, options) => {
    requests.push({ kind: 'coolify', url, options });
    if (url.endsWith('/deploy')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ deployments: [{ resource_uuid: 'resource-1', deployment_uuid: 'deployment-42' }] }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ deployment_uuid: 'deployment-42', status: statuses.shift(), deployment_url: 'https://coolify.example.test/deployments/deployment-42' }),
    };
  };

  await runRebuildJob(
    { data: { rebuildId: 'rebuild-1' }, attemptsMade: 0, opts: { attempts: 3 } },
    {
      apiUrl: 'https://api.example.test/api/v1',
      adminToken: 'service-token',
      provider: 'coolify',
      coolifyApiUrl: 'https://coolify.example.test/api/v1',
      coolifyApiToken: 'coolify-secret',
      coolifyResourceUuid: 'resource-1',
      coolifyPollIntervalMs: 1,
      coolifyDeployTimeoutMs: 1_000,
      sleepImpl: async () => {},
      jsonRequest,
      fetchImpl,
    },
  );

  const deployRequest = requests.find((request) => request.kind === 'coolify' && request.url.endsWith('/deploy'));
  assert.equal(deployRequest.options.headers.authorization, 'Bearer coolify-secret');
  assert.deepEqual(JSON.parse(deployRequest.options.body), { uuid: 'resource-1' });
  const progress = requests.find((request) => request.kind === 'api' && request.url.endsWith('/provider-progress'));
  assert.equal(progress.body.deploymentId, 'deployment-42');
  assert.equal(progress.body.providerStatus, 'QUEUED');
  const result = requests.find((request) => request.kind === 'api' && request.url.endsWith('/result'));
  assert.equal(result.body.result.status, 'SUCCEEDED');
  assert.equal(result.body.result.deploymentId, 'deployment-42');
  assert.doesNotMatch(JSON.stringify(requests.filter((request) => request.kind === 'api')), /coolify-secret/);
});

test('worker resumes polling a persisted Coolify deployment without starting a duplicate', async () => {
  const providerRequests = [];
  const jsonRequest = async (url, options) => {
    if (url.endsWith('/start')) {
      return {
        rebuildId: 'rebuild-1',
        siteId: 'site-1',
        affectedPaths: ['/*'],
        revision: 4,
        providerDeploymentId: 'deployment-existing',
        providerStatus: 'IN_PROGRESS',
      };
    }
    return { saved: true };
  };
  const fetchImpl = async (url, options) => {
    providerRequests.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ deployment_uuid: 'deployment-existing', status: 'finished' }),
    };
  };

  await runRebuildJob(
    { data: { rebuildId: 'rebuild-1' }, attemptsMade: 1, opts: { attempts: 3 } },
    {
      apiUrl: 'https://api.example.test/api/v1',
      adminToken: 'service-token',
      provider: 'coolify',
      coolifyApiUrl: 'https://coolify.example.test/api/v1',
      coolifyApiToken: 'coolify-secret',
      coolifyResourceUuid: 'resource-1',
      jsonRequest,
      fetchImpl,
    },
  );

  assert.equal(providerRequests.length, 1);
  assert.match(providerRequests[0].url, /\/deployments\/deployment-existing$/);
});

test('worker records final Coolify failure without publishing the revision', async () => {
  const f = fixture({ ok: true, status: 200, text: async () => '' });
  f.options.provider = 'coolify';
  f.options.coolifyApiUrl = 'https://coolify.example.test/api/v1';
  f.options.coolifyApiToken = 'coolify-secret';
  f.options.coolifyResourceUuid = 'resource-1';
  f.options.fetchImpl = async (url) => url.endsWith('/deploy')
    ? { ok: true, status: 200, text: async () => JSON.stringify({ deployments: [{ resource_uuid: 'resource-1', deployment_uuid: 'deployment-failed' }] }) }
    : { ok: true, status: 200, text: async () => JSON.stringify({ deployment_uuid: 'deployment-failed', status: 'failed' }) };

  await assert.rejects(runRebuildJob(f.job, f.options), /ended with status failed/);

  const result = f.requests.find((request) => request.url.endsWith('/result'));
  assert.equal(result.body.deploymentId, 'deployment-failed');
  assert.equal(result.body.providerStatus, 'FAILED');
  assert.equal(result.body.result, undefined);
  assert.doesNotMatch(JSON.stringify(f.requests), /coolify-secret/);
});

test('worker times out bounded Coolify polling and keeps the deployment resumable', async () => {
  const f = fixture({ ok: true, status: 200, text: async () => '' });
  let now = 0;
  f.options.provider = 'coolify';
  f.options.coolifyApiUrl = 'https://coolify.example.test/api/v1';
  f.options.coolifyApiToken = 'coolify-secret';
  f.options.coolifyResourceUuid = 'resource-1';
  f.options.coolifyPollIntervalMs = 1;
  f.options.coolifyDeployTimeoutMs = 1_000;
  f.options.nowImpl = () => { now += 600; return now; };
  f.options.sleepImpl = async () => {};
  f.options.fetchImpl = async (url) => url.endsWith('/deploy')
    ? { ok: true, status: 200, text: async () => JSON.stringify({ deployments: [{ resource_uuid: 'resource-1', deployment_uuid: 'deployment-slow' }] }) }
    : { ok: true, status: 200, text: async () => JSON.stringify({ deployment_uuid: 'deployment-slow', status: 'queued' }) };

  await assert.rejects(runRebuildJob(f.job, f.options), /timed out after 1000ms/);

  const result = f.requests.find((request) => request.url.endsWith('/result'));
  assert.equal(result.body.deploymentId, 'deployment-slow');
  assert.equal(result.body.providerStatus, 'QUEUED');
  assert.equal(result.body.result, undefined);
});

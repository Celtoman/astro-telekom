import { runCoolifyDeployment } from './coolify-deployment.mjs';
import { DelayedError } from 'bullmq';
import { runStaticPublication, StaticPublicationUncertainError } from './static-publication.mjs';

const parseProviderResponse = async (response) => {
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* handled as invalid final result */ }
  if (!response.ok) throw new Error(`rebuild provider responded ${response.status}: ${raw.slice(0, 500)}`);
  if (!parsed || typeof parsed !== 'object' || parsed.status !== 'SUCCEEDED') {
    throw new Error(`rebuild provider did not return final status SUCCEEDED: ${raw.slice(0, 500)}`);
  }
  return parsed;
};

async function deferStaticRecovery(job, error) {
  if (typeof job.moveToDelayed === 'function' && job.token) {
    await job.moveToDelayed(Date.now() + 30000, job.token);
    throw new DelayedError();
  }
  throw error;
}

export async function runRebuildJob(job, options) {
  const { apiUrl, adminToken, rebuildUrl, jsonRequest, fetchImpl = fetch } = options;
  if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
  const maxAttempts = Number(job.opts.attempts || 1);
  const attemptNumber = job.attemptsMade + 1;
  const headers = { 'x-admin-token': adminToken };
  const endpoint = `${apiUrl}/internal/site-rebuilds/${encodeURIComponent(job.data.rebuildId)}`;
  let rebuild;
  try { rebuild = await jsonRequest(`${endpoint}/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ attemptNumber, maxAttempts, revision: job.data.revision }),
  }); } catch (error) {
    if (options.provider === 'static') return deferStaticRecovery(job, error);
    throw error;
  }
  if (rebuild.skipped) return rebuild;

  let result;
  try {
    const provider = options.provider || 'webhook';
    if (provider === 'static') {
      result = await runStaticPublication(rebuild, { ...options, fetchImpl });
    } else if (provider === 'coolify') {
      result = await runCoolifyDeployment(rebuild, {
        ...options,
        fetchImpl,
        existingDeploymentId: rebuild.providerDeploymentId,
        existingProviderStatus: rebuild.providerStatus,
        onProgress: (progress) => jsonRequest(`${endpoint}/provider-progress`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ revision: rebuild.revision, ...progress }),
        }),
      });
    } else if (provider === 'webhook') {
      if (!rebuildUrl) throw new Error('REBUILD_WEBHOOK_URL is not configured');
      const response = await fetchImpl(rebuildUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(15 * 60 * 1000),
        headers: { 'content-type': 'application/json', 'idempotency-key': `${rebuild.rebuildId}:${rebuild.revision}` },
        body: JSON.stringify(rebuild),
      });
      result = await parseProviderResponse(response);
    } else {
      throw new Error(`Unsupported REBUILD_PROVIDER: ${provider}`);
    }
  } catch (error) {
    if (error instanceof StaticPublicationUncertainError) {
      // A lost reply can follow a committed activation. Keep SQL unfinished and
      // recover this same job without exhausting BullMQ's bounded failure attempts.
      await jsonRequest(`${endpoint}/provider-progress`, { method: 'POST', headers, body: JSON.stringify({
        revision: rebuild.revision, deploymentId: `static-${rebuild.rebuildId}-${rebuild.revision}`, providerStatus: 'UNCERTAIN',
      }) }).catch(() => undefined);
      return deferStaticRecovery(job, error);
    }
    const message = error instanceof Error ? error.message : String(error);
    const providerFailure = error && typeof error === 'object' ? error : {};
    await jsonRequest(`${endpoint}/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        attemptNumber,
        maxAttempts,
        revision: rebuild.revision,
        error: message,
        ...(providerFailure.deploymentId ? { deploymentId: providerFailure.deploymentId } : {}),
        ...(providerFailure.providerStatus ? { providerStatus: providerFailure.providerStatus } : {}),
        ...(providerFailure.providerResponse ? { providerResponse: providerFailure.providerResponse } : {}),
      }),
    });
    throw error;
  }

  try { return await jsonRequest(`${endpoint}/result`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ attemptNumber, maxAttempts, revision: rebuild.revision, result }),
  }); } catch (error) {
    // Durable serving success remains recoverable if SQL acknowledgment is down.
    if (options.provider === 'static') return deferStaticRecovery(job, error);
    throw error;
  }
}

const pendingStatuses = new Set(['queued', 'in_progress']);
const failedStatuses = new Set(['failed', 'cancelled', 'cancelled-by-user']);

class CoolifyDeploymentError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CoolifyDeploymentError';
    Object.assign(this, details);
  }
}

const parseResponse = async (response, operation) => {
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* reported below */ }
  if (!response.ok) {
    throw new CoolifyDeploymentError(`Coolify ${operation} responded ${response.status}: ${raw.slice(0, 500)}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new CoolifyDeploymentError(`Coolify ${operation} returned invalid JSON: ${raw.slice(0, 500)}`);
  }
  return parsed;
};

const normalizeApiUrl = (value) => {
  if (!value) throw new CoolifyDeploymentError('COOLIFY_API_URL is not configured');
  let url;
  try { url = new URL(value); } catch { throw new CoolifyDeploymentError('COOLIFY_API_URL must be a valid HTTPS /api/v1 URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new CoolifyDeploymentError('COOLIFY_API_URL must be a clean HTTPS /api/v1 URL');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/api/v1') throw new CoolifyDeploymentError('COOLIFY_API_URL must end with /api/v1');
  return `${url.origin}/api/v1`;
};

const positiveInteger = (value, fallback, name) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new CoolifyDeploymentError(`${name} must be a positive integer`);
  return parsed;
};

const summarizeDeployment = (deployment, deploymentId) => ({
  deployment_uuid: deploymentId,
  status: typeof deployment.status === 'string' ? deployment.status : null,
  deployment_url: typeof deployment.deployment_url === 'string' ? deployment.deployment_url : null,
});

export async function runCoolifyDeployment(rebuild, options) {
  const {
    coolifyApiToken,
    coolifyResourceUuid,
    existingDeploymentId,
    existingProviderStatus,
    fetchImpl = fetch,
    sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    nowImpl = Date.now,
    onProgress = async () => {},
  } = options;
  if (!coolifyApiToken) throw new CoolifyDeploymentError('COOLIFY_API_TOKEN is not configured');
  if (!coolifyResourceUuid) throw new CoolifyDeploymentError('COOLIFY_RESOURCE_UUID is not configured');

  const apiUrl = normalizeApiUrl(options.coolifyApiUrl);
  const pollIntervalMs = positiveInteger(options.coolifyPollIntervalMs, 5_000, 'COOLIFY_POLL_INTERVAL_MS');
  const deployTimeoutMs = positiveInteger(options.coolifyDeployTimeoutMs, 15 * 60 * 1000, 'COOLIFY_DEPLOY_TIMEOUT_MS');
  const headers = { authorization: `Bearer ${coolifyApiToken}`, 'content-type': 'application/json' };
  const reusableStatus = String(existingProviderStatus || '').toLowerCase();
  let deploymentId = existingDeploymentId && pendingStatuses.has(reusableStatus) ? existingDeploymentId : null;

  if (!deploymentId) {
    const response = await fetchImpl(`${apiUrl}/deploy`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers,
      body: JSON.stringify({ uuid: coolifyResourceUuid }),
    });
    const payload = await parseResponse(response, 'deploy');
    const deployment = Array.isArray(payload.deployments)
      ? payload.deployments.find((item) => item?.resource_uuid === coolifyResourceUuid)
      : null;
    deploymentId = typeof deployment?.deployment_uuid === 'string' ? deployment.deployment_uuid : null;
    if (!deploymentId) throw new CoolifyDeploymentError('Coolify deploy response did not contain deployment_uuid');
    try {
      await onProgress({ deploymentId, providerStatus: 'QUEUED', providerResponse: { deployment_uuid: deploymentId, resource_uuid: coolifyResourceUuid } });
    } catch (error) {
      throw new CoolifyDeploymentError(`Could not persist Coolify deployment ${deploymentId}: ${error instanceof Error ? error.message : String(error)}`, {
        deploymentId,
        providerStatus: 'QUEUED',
      });
    }
  }

  const startedAt = nowImpl();
  let lastStatus = reusableStatus && pendingStatuses.has(reusableStatus) ? reusableStatus : 'queued';
  while (true) {
    const elapsed = nowImpl() - startedAt;
    if (elapsed >= deployTimeoutMs) {
      throw new CoolifyDeploymentError(`Coolify deployment ${deploymentId} timed out after ${deployTimeoutMs}ms`, {
        deploymentId,
        providerStatus: lastStatus.toUpperCase(),
      });
    }
    let deployment;
    try {
      const response = await fetchImpl(`${apiUrl}/deployments/${encodeURIComponent(deploymentId)}`, {
        method: 'GET',
        signal: AbortSignal.timeout(Math.min(30_000, Math.max(1, deployTimeoutMs - elapsed))),
        headers: { authorization: headers.authorization },
      });
      deployment = await parseResponse(response, 'deployment status');
    } catch (error) {
      if (error instanceof CoolifyDeploymentError) {
        error.deploymentId ||= deploymentId;
        error.providerStatus ||= lastStatus.toUpperCase();
        throw error;
      }
      throw new CoolifyDeploymentError(`Coolify deployment status request failed: ${error instanceof Error ? error.message : String(error)}`, {
        deploymentId,
        providerStatus: lastStatus.toUpperCase(),
      });
    }
    const status = typeof deployment.status === 'string' ? deployment.status.toLowerCase() : '';
    const summary = summarizeDeployment(deployment, deploymentId);
    if (status === 'finished') {
      return { status: 'SUCCEEDED', deploymentId, url: summary.deployment_url || undefined, provider: 'coolify', providerResponse: summary };
    }
    if (failedStatuses.has(status)) {
      throw new CoolifyDeploymentError(`Coolify deployment ${deploymentId} ended with status ${status}`, {
        deploymentId,
        providerStatus: status.toUpperCase(),
        providerResponse: summary,
      });
    }
    if (!pendingStatuses.has(status)) {
      throw new CoolifyDeploymentError(`Coolify deployment ${deploymentId} returned unknown status ${status || '(empty)'}`, {
        deploymentId,
        providerStatus: status ? status.toUpperCase() : 'UNKNOWN',
        providerResponse: summary,
      });
    }
    if (status !== lastStatus) {
      lastStatus = status;
      try {
        await onProgress({ deploymentId, providerStatus: status.toUpperCase(), providerResponse: summary });
      } catch (error) {
        throw new CoolifyDeploymentError(`Could not persist Coolify deployment ${deploymentId}: ${error instanceof Error ? error.message : String(error)}`, {
          deploymentId,
          providerStatus: status.toUpperCase(),
          providerResponse: summary,
        });
      }
    }
    await sleepImpl(Math.min(pollIntervalMs, Math.max(1, deployTimeoutMs - (nowImpl() - startedAt))));
  }
}

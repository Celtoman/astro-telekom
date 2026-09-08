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

export async function runRebuildJob(job, options) {
  const { apiUrl, adminToken, rebuildUrl, jsonRequest, fetchImpl = fetch } = options;
  if (!adminToken) throw new Error('ADMIN_API_TOKEN is not configured');
  const maxAttempts = Number(job.opts.attempts || 1);
  const attemptNumber = job.attemptsMade + 1;
  const headers = { 'x-admin-token': adminToken };
  const endpoint = `${apiUrl}/internal/site-rebuilds/${encodeURIComponent(job.data.rebuildId)}`;
  const rebuild = await jsonRequest(`${endpoint}/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ attemptNumber, maxAttempts, revision: job.data.revision }),
  });
  if (rebuild.skipped) return rebuild;

  let result;
  try {
    if (!rebuildUrl) throw new Error('REBUILD_WEBHOOK_URL is not configured');
    const response = await fetchImpl(rebuildUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(15 * 60 * 1000),
      headers: { 'content-type': 'application/json', 'idempotency-key': `${rebuild.rebuildId}:${rebuild.revision}` },
      body: JSON.stringify(rebuild),
    });
    result = await parseProviderResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await jsonRequest(`${endpoint}/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ attemptNumber, maxAttempts, revision: rebuild.revision, error: message }),
    });
    throw error;
  }

  return jsonRequest(`${endpoint}/result`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ attemptNumber, maxAttempts, revision: rebuild.revision, result }),
  });
}

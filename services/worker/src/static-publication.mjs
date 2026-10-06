export class StaticPublicationUncertainError extends Error {
  constructor(message, options) { super(message, options); this.name = 'StaticPublicationUncertainError'; }
}
class StaticPublicationFailedError extends Error {}

function validateReceipt(result, rebuild) {
  if (result.status !== 'SUCCEEDED' || result.rebuildId !== rebuild.rebuildId || result.rebuildRevision !== rebuild.revision
    || result.publicationId !== rebuild.publicationId || result.siteId !== rebuild.siteId
    || !Number.isSafeInteger(result.siteRevision) || result.siteRevision < 0
    || ['artifactId', 'rendererId', 'catalogDigest', 'manifestDigest'].some(field => !/^[a-f0-9]{64}$/.test(result[field] || ''))) {
    throw new StaticPublicationUncertainError('Static publication receipt identity mismatch');
  }
  return result;
}

export async function runStaticPublication(rebuild, { publicationUrl, adminToken, fetchImpl = fetch }) {
  try {
    const base = new URL(publicationUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid private publication URL');
    if (!rebuild.publicationId || !rebuild.siteId || !rebuild.siteSlug) throw new Error('Static rebuild requires an exact publication/site identity');
    const url = base.href.replace(/\/$/, '');
    const headers = { 'content-type': 'application/json', 'x-admin-token': adminToken };
    const receiptResponse = await fetchImpl(`${url}/receipts/${encodeURIComponent(rebuild.rebuildId)}/${rebuild.revision}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!receiptResponse.ok) throw new StaticPublicationUncertainError(`Static receipt unavailable (${receiptResponse.status})`);
    const receipt = await receiptResponse.json();
    if (receipt.status === 'SUCCEEDED') return validateReceipt(receipt, rebuild);
    if (!['NOT_FOUND', 'PENDING'].includes(receipt.status)) throw new StaticPublicationUncertainError('Static receipt outcome is unknown');
    const response = await fetchImpl(`${url}/publish`, { method: 'POST', headers, signal: AbortSignal.timeout(16 * 60 * 1000), body: JSON.stringify({
      publicationId: rebuild.publicationId, siteId: rebuild.siteId, siteSlug: rebuild.siteSlug,
      rebuildId: rebuild.rebuildId, rebuildRevision: rebuild.revision,
      ...(rebuild.progressRunId ? { progressRunId: rebuild.progressRunId } : {}),
    }) });
    const result = await response.json();
    if ([400, 409, 422].includes(response.status) && result.status === 'FAILED') throw new StaticPublicationFailedError(String(result.error || 'Static build rejected').slice(0, 2000));
    if (!response.ok || response.status !== 200 || result.status !== 'SUCCEEDED') throw new StaticPublicationUncertainError('Static activation is not yet confirmed');
    return validateReceipt(result, rebuild);
  } catch (error) {
    if (error instanceof StaticPublicationFailedError || error instanceof StaticPublicationUncertainError) throw error;
    throw new StaticPublicationUncertainError('Static publication outcome could not be verified', { cause: error });
  }
}

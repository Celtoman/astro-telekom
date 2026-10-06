import { ActivationUncertainError } from './caddy-activation.mjs';

// Read-only provider verification: this module never starts a deployment.
export function createCodeDeploymentVerifier({ apiUrl, token, resourceId, fetchImpl = fetch }) {
  const base = new URL(apiUrl).href.replace(/\/+$/, '');
  if (!token || !/^[a-zA-Z0-9_-]{1,200}$/.test(resourceId || '')) throw new Error('Code deployment verification requires provider credentials/resource');
  const readLatest = async expectedCommit => {
    try {
      const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
      const [deploymentsResponse, applicationResponse] = await Promise.all([
        fetchImpl(`${base}/deployments/applications/${resourceId}?take=10`, { headers, signal: AbortSignal.timeout(10000) }),
        fetchImpl(`${base}/applications/${resourceId}`, { headers, signal: AbortSignal.timeout(10000) }),
      ]);
      if (!deploymentsResponse.ok || !applicationResponse.ok) throw new Error('Provider state unavailable');
      const [deployments, application] = await Promise.all([deploymentsResponse.json(), applicationResponse.json()]);
      const latest = deployments.deployments?.[0];
      if (!latest || !/^[a-zA-Z0-9_-]{1,200}$/.test(latest.deployment_uuid || '') || latest.status !== 'finished'
        || latest.commit !== expectedCommit || application.uuid !== resourceId || application.status !== 'running:healthy') {
        throw new Error('Latest deployment identity/status does not authorize this renderer');
      }
      return { deploymentId: latest.deployment_uuid, expectedCommit };
    } catch (error) {
      // Returning an uncertain result keeps the currently served HTML unchanged.
      throw new ActivationUncertainError('Code deployment could not be confirmed', { cause: error });
    }
  };
  const verify = async ({ deploymentId, expectedCommit }) => {
    const latest = await readLatest(expectedCommit);
    if (latest.deploymentId !== deploymentId) throw new ActivationUncertainError('A newer deployment superseded this code release');
  };
  verify.latest = readLatest;
  return verify;
}

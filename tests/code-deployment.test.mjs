import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodeDeploymentVerifier } from '../apps/web/scripts/publication/code-deployment.mjs';
import { ActivationUncertainError } from '../apps/web/scripts/publication/caddy-activation.mjs';

test('CODE verifier requires the latest exact finished deployment and a healthy configured resource', async () => {
  const expectedCommit = 'c'.repeat(40);
  let latest = { deployment_uuid: 'deployment-1', commit: expectedCommit, status: 'finished' };
  let application = { uuid: 'application-1', status: 'running:healthy' }; let unavailable = false;
  const verifier = createCodeDeploymentVerifier({ apiUrl: 'https://provider.test/api/v1', token: 'fixture-provider', resourceId: 'application-1',
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.authorization, 'Bearer fixture-provider');
      if (unavailable) return new Response('', { status: 503 });
      return Response.json(url.includes('/deployments/') ? { deployments: [latest, { deployment_uuid: 'deployment-old', commit: expectedCommit, status: 'finished' }] } : application);
    } });
  const input = { deploymentId: 'deployment-1', expectedCommit };
  await verifier(input);
  for (const change of [{ status: 'in_progress' }, { status: 'failed' }, { commit: 'd'.repeat(40) }, { deployment_uuid: 'deployment-newer' }]) {
    const previous = latest; latest = { ...latest, ...change };
    await assert.rejects(verifier(input), ActivationUncertainError); latest = previous;
  }
  await assert.rejects(verifier({ ...input, deploymentId: 'deployment-old' }), ActivationUncertainError);
  for (const change of [{ status: 'running:unhealthy' }, { uuid: 'foreign-application' }]) {
    const previous = application; application = { ...application, ...change };
    await assert.rejects(verifier(input), ActivationUncertainError); application = previous;
  }
  unavailable = true; await assert.rejects(verifier(input), ActivationUncertainError);
});

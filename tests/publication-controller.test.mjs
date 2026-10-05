import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealArtifact, recordReceipt } from '../apps/web/scripts/publication/artifact-store.mjs';
import { ActivationUncertainError } from '../apps/web/scripts/publication/caddy-activation.mjs';

test('private publication controller persists intent and recovers committed activation after restart without rebuilding', async () => {
  const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  const root = await mkdtemp(join(tmpdir(), 'publication-controller-'));
  try {
    const source = join(root, 'source'); await mkdir(source);
    await writeFile(join(source, 'index.html'), '<h1>Saved B</h1>'); await writeFile(join(source, '404.html'), '<h1>404</h1>');
    const job = { publicationId: 'pub-b', siteId: 'site-1', siteSlug: 'domru-site', rebuildId: 'rebuild-1', rebuildRevision: 2 };
    const artifact = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: {
      ...job, artifactId: 'b'.repeat(64), rendererId: 'f'.repeat(64), catalogDigest: 'e'.repeat(64), siteRevision: 7, redirects: [],
    } });
    let active = { artifactId: 'a'.repeat(64) }; let builds = 0; let failReply = true;
    const builder = { build: async () => { builds++; return artifact; } };
    const activation = {
      current: async () => ({ active }),
      activate: async input => {
        assert.equal(input.kind, 'CMS'); assert.equal(input.expectedActiveArtifactId, 'a'.repeat(64));
        active = artifact;
        if (failReply) throw new ActivationUncertainError('Committed, reply/read unavailable');
        return recordReceipt(root, artifact);
      },
      reconcile: async value => value.artifactId === artifact.artifactId ? recordReceipt(root, artifact) : null,
    };
    const controller = new PublicationController({ publicationRoot: root, builder, activation });
    await assert.rejects(controller.publish(job), ActivationUncertainError);
    const restarted = new PublicationController({ publicationRoot: root, builder, activation });
    assert.equal((await restarted.receipt(job.rebuildId, job.rebuildRevision)).status, 'SUCCEEDED');
    failReply = false;
    assert.equal((await restarted.publish(job)).publicationId, 'pub-b'); assert.equal(builds, 1);
    await assert.rejects(restarted.publish({ ...job, publicationId: 'foreign' }), /collision|identity/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('controller HTTP requires machine token and limits paths, body and activation kind', async () => {
  const { createPublicationServer } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  let calls = 0;
  const server = createPublicationServer({ adminToken: 's'.repeat(32), controller: {
    active: async () => ({ publicationId: 'pub-a' }), publish: async job => { calls++; return { status: 'SUCCEEDED', publicationId: job.publicationId }; },
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'x-admin-token': 's'.repeat(32), 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/active`)).status, 401);
    assert.deepEqual(await (await fetch(`${base}/active`, { headers })).json(), { publicationId: 'pub-a' });
    assert.equal((await fetch(`${base}/publish`, { method: 'POST', headers, body: 'broken' })).status, 400);
    assert.equal((await fetch(`${base}/publish`, { method: 'POST', headers, body: JSON.stringify({ kind: 'CODE' }) })).status, 400);
    assert.equal((await fetch(`${base}/publish`, { method: 'POST', headers, body: 'x'.repeat(40000) })).status, 413);
    const job = { publicationId: 'pub-b', siteId: 'site-1', siteSlug: 'domru-site', rebuildId: 'rebuild-1', rebuildRevision: 2 };
    assert.equal((await fetch(`${base}/publish`, { method: 'POST', headers, body: JSON.stringify(job) })).status, 200);
    assert.equal((await fetch(`${base}/config`, { headers })).status, 404);
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

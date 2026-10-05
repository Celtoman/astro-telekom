import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealArtifact, recordReceipt } from '../apps/web/scripts/publication/artifact-store.mjs';
import { ActivationUncertainError } from '../apps/web/scripts/publication/caddy-activation.mjs';

test('CMS waits for the serving renderer and revalidates an unresolved snapshot before activation', async () => {
  const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  const root = await mkdtemp(join(tmpdir(), 'publication-renderer-'));
  try {
    const source = join(root, 'source'); await mkdir(source);
    await writeFile(join(source, 'index.html'), 'B'); await writeFile(join(source, '404.html'), '404');
    const job = { publicationId: 'pub-b', siteId: 'site-1', siteSlug: 'domru-site', rebuildId: 'rebuild-b', rebuildRevision: 1 };
    const artifact = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: {
      ...job, artifactId: 'b'.repeat(64), rendererId: 'f'.repeat(64), catalogDigest: 'e'.repeat(64), siteRevision: 2, redirects: [],
    } });
    let renderer = 'd'.repeat(64); let builds = 0; let activations = 0; let eligible = true;
    const builder = { get renderer() { return Promise.resolve(renderer); },
      build: async () => { builds++; return artifact; },
      fetchSnapshot: async () => { if (!eligible) throw Object.assign(new Error('Cancelled snapshot'), { httpStatus: 409 }); return artifact; },
    };
    const activation = { current: async () => ({ active: { artifactId: 'a'.repeat(64), rendererId: 'f'.repeat(64) } }),
      reconcile: async () => null, activate: async () => { activations++; throw new ActivationUncertainError('Unavailable'); } };
    const controller = new PublicationController({ publicationRoot: root, builder, activation });
    await assert.rejects(controller.publish(job), ActivationUncertainError); assert.equal(builds, 0);
    renderer = 'f'.repeat(64);
    await assert.rejects(controller.publish(job), ActivationUncertainError); assert.equal(builds, 1); assert.equal(activations, 1);
    eligible = false;
    await assert.rejects(controller.publish(job), /Cancelled snapshot/); assert.equal(activations, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CODE is bound to a controller instance and verified deployment, preserves serving snapshot and recovers without rollback', async () => {
  const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  const root = await mkdtemp(join(tmpdir(), 'publication-code-'));
  try {
    let active = { publicationId: 'pub-serving', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7,
      artifactId: 'a'.repeat(64), rendererId: 'd'.repeat(64), catalogDigest: 'e'.repeat(64) };
    let builds = 0; let verified = false; let failReply = true;
    const rendererId = 'f'.repeat(64);
    const builder = { renderer: Promise.resolve(rendererId), fetchSnapshot: async () => active, build: async job => {
      builds++; assert.equal(job.publicationId, 'pub-serving');
      const source = join(root, 'source'); await mkdir(source);
      await writeFile(join(source, 'index.html'), 'Serving content / new code'); await writeFile(join(source, '404.html'), '404');
      return sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: { ...active, ...job, rendererId, artifactId: 'b'.repeat(64), redirects: [] } });
    } };
    const activation = { current: async () => ({ active }), reconcile: async value => value.artifactId === 'b'.repeat(64) ? recordReceipt(root, value) : null,
      activate: async input => {
        assert.equal(input.kind, 'CODE'); assert.equal(input.expectedActiveArtifactId, 'a'.repeat(64));
        const { readArtifact } = await import('../apps/web/scripts/publication/artifact-store.mjs'); active = await readArtifact(root, input.artifactId);
        if (failReply) throw new ActivationUncertainError('Reply lost'); return recordReceipt(root, active);
      } };
    const verifyCodeRelease = async input => { assert.equal(input.deploymentId, 'deployment-1'); if (!verified) throw new ActivationUncertainError('Deployment not finished'); };
    const controller = new PublicationController({ publicationRoot: root, builder, activation, verifyCodeRelease });
    const identity = await controller.rendererIdentity();
    const input = { ...identity, deploymentId: 'deployment-1', expectedCommit: 'c'.repeat(40) };
    assert.throws(() => controller.releaseCode({ ...input, kind: 'CMS' }), /Unsupported/);
    await assert.rejects(controller.releaseCode({ ...input, instanceId: '00000000-0000-4000-8000-000000000000' }), /instance/);
    await assert.rejects(controller.releaseCode(input), ActivationUncertainError); assert.equal(builds, 0);
    verified = true;
    await assert.rejects(controller.releaseCode(input), ActivationUncertainError); assert.equal(builds, 1);
    const restarted = new PublicationController({ publicationRoot: root, builder, activation, verifyCodeRelease });
    const retry = { ...input, ...await restarted.rendererIdentity() }; failReply = false;
    assert.equal((await restarted.releaseCode(retry)).publicationId, 'pub-serving'); assert.equal(builds, 1);
    active = { ...active, publicationId: 'pub-newer', siteRevision: 8, artifactId: '9'.repeat(64) };
    assert.equal((await restarted.releaseCode(retry)).publicationId, 'pub-serving'); assert.equal(active.publicationId, 'pub-newer');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CODE waits for a durable CMS intent, but a proven cancelled intent does not block the release', async () => {
  const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  const root = await mkdtemp(join(tmpdir(), 'publication-code-intent-'));
  try {
    const source = join(root, 'source'); await mkdir(source);
    await writeFile(join(source, 'index.html'), 'B'); await writeFile(join(source, '404.html'), '404');
    const job = { publicationId: 'pub-b', siteId: 'site-1', siteSlug: 'domru-site', rebuildId: 'rebuild-b', rebuildRevision: 1 };
    const active = { ...job, publicationId: 'pub-a', artifactId: 'a'.repeat(64), rendererId: 'f'.repeat(64), catalogDigest: 'e'.repeat(64), siteRevision: 1 };
    const artifact = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: {
      ...job, artifactId: 'b'.repeat(64), rendererId: active.rendererId, catalogDigest: active.catalogDigest, siteRevision: 2, redirects: [],
    } });
    let cancelled = false; let builds = 0;
    const builder = { renderer: Promise.resolve(active.rendererId), build: async () => { builds++; return artifact; },
      fetchSnapshot: async () => { if (cancelled) throw Object.assign(new Error('Cancelled'), { httpStatus: 409 }); return artifact; } };
    const activation = { current: async () => ({ active }), reconcile: async () => ({ status: 'SUCCEEDED', publicationId: 'pub-a' }),
      activate: async () => { throw new ActivationUncertainError('Unavailable'); } };
    const controller = new PublicationController({ publicationRoot: root, builder, activation, verifyCodeRelease: async () => {} });
    await assert.rejects(controller.publish(job), ActivationUncertainError);
    const release = { ...await controller.rendererIdentity(), deploymentId: 'deployment-1', expectedCommit: 'c'.repeat(40) };
    await assert.rejects(controller.releaseCode(release), /unresolved CMS/); assert.equal(builds, 1);
    cancelled = true;
    assert.equal((await controller.releaseCode(release)).publicationId, 'pub-a'); assert.equal(builds, 1);
    await assert.rejects(controller.publish(job), /Cancelled/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CODE rechecks deployment after build and rejects a foreign serving digest before writing intent', async () => {
  const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  const root = await mkdtemp(join(tmpdir(), 'publication-code-recheck-'));
  try {
    const active = { publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 1,
      artifactId: 'a'.repeat(64), rendererId: 'd'.repeat(64), catalogDigest: 'e'.repeat(64) };
    let checks = 0; let activations = 0; let foreign = true;
    const builder = { renderer: Promise.resolve('f'.repeat(64)), build: async job => ({ ...active, ...job,
      artifactId: 'b'.repeat(64), rendererId: 'f'.repeat(64), catalogDigest: foreign ? '9'.repeat(64) : active.catalogDigest }) };
    const activation = { current: async () => ({ active }), reconcile: async () => null, activate: async () => { activations++; } };
    const controller = new PublicationController({ publicationRoot: root, builder, activation, verifyCodeRelease: async () => {
      checks++; if (checks === 3) throw new ActivationUncertainError('New deployment started during build');
    } });
    const release = { ...await controller.rendererIdentity(), deploymentId: 'deployment-1', expectedCommit: 'c'.repeat(40) };
    await assert.rejects(controller.releaseCode(release), /changed the serving snapshot/); assert.equal(activations, 0);
    foreign = false;
    await assert.rejects(controller.releaseCode(release), /New deployment started/); assert.equal(activations, 0); assert.equal(checks, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

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
    let active = { artifactId: 'a'.repeat(64), rendererId: 'f'.repeat(64) }; let builds = 0; let failReply = true;
    const builder = { renderer: Promise.resolve('f'.repeat(64)), fetchSnapshot: async () => artifact,
      build: async () => { builds++; return artifact; } };
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

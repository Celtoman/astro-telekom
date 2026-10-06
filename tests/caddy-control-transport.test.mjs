import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CaddyActivation, ActivationUncertainError } from '../apps/web/scripts/publication/caddy-activation.mjs';
import { createServingConfig } from '../apps/web/scripts/publication/serving-config.mjs';
import { sealArtifact, readReceipt } from '../apps/web/scripts/publication/artifact-store.mjs';

async function fixture(t, { unavailableReadback = false, lostPostReply = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'astro-caddy-control-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'build'); await mkdir(source);
  await writeFile(join(source, 'index.html'), '<h1>Candidate</h1>');
  await writeFile(join(source, '404.html'), '<h1>Not found</h1>');
  const candidate = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: {
    artifactId: 'a'.repeat(64), rendererId: 'b'.repeat(64), catalogDigest: 'c'.repeat(64),
    siteId: 'site-1', siteSlug: 'synthetic-site', siteRevision: 1,
    publicationId: 'publication-1', rebuildId: 'rebuild-1', rebuildRevision: 1, redirects: [],
  } });
  const options = { publicationToken: 'synthetic-control-transport-token-'.repeat(2) };
  let config = createServingConfig(null, options), generation = 0, posts = 0, staleReads = 0;
  const sockets = new WeakMap(), requests = [];
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, connection: request.headers.connection });
    assert.equal(request.headers.origin, 'http://127.0.0.1:2019');
    assert.equal(request.url, '/config/');
    if (request.method === 'POST') {
      posts++;
      if (request.headers['if-match'] !== `"${generation}"`) { response.writeHead(412); response.end(); return; }
      let body = ''; for await (const chunk of request) body += chunk;
      config = JSON.parse(body); generation++;
      if (lostPostReply) { request.socket.destroy(); return; }
      response.writeHead(200); response.end(); return;
    }
    // Caddy replaces its admin server during reload. An idle socket from the old
    // generation may be picked before the client observes its asynchronous close.
    if (sockets.get(request.socket) < generation) {
      staleReads++; request.socket.destroy(); return;
    }
    if (generation && unavailableReadback) { response.writeHead(503); response.end(); return; }
    response.writeHead(200, { 'content-type': 'application/json', etag: `"${generation}"` });
    response.end(JSON.stringify(config));
  });
  server.on('connection', socket => sockets.set(socket, generation));
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); });
  const manager = new CaddyActivation({ publicationRoot: root,
    adminUrl: `http://127.0.0.1:${server.address().port}`, servingOptions: options });
  return { root, candidate, manager, requests, counts: () => ({ posts, staleReads }) };
}

test('activation verifies the committed artifact without reusing a pre-reload control socket', async t => {
  const { root, candidate, manager, requests, counts } = await fixture(t);
  const receipt = await manager.activate({ artifactId: candidate.artifactId, expectedActiveArtifactId: null, kind: 'BOOTSTRAP' });
  assert.equal(receipt.status, 'SUCCEEDED');
  assert.equal(receipt.artifactId, candidate.artifactId);
  assert.deepEqual(await readReceipt(root, candidate.artifactId), receipt);
  assert.deepEqual(counts(), { posts: 1, staleReads: 0 });
  assert.deepEqual(requests.map(item => item.method), ['GET', 'POST', 'GET']);
  assert.ok(requests.every(item => item.connection === 'close'));
});

test('lost POST reply is reconciled on a fresh socket without repeating the configuration write', async t => {
  const { candidate, manager, counts } = await fixture(t, { lostPostReply: true });
  const receipt = await manager.activate({ artifactId: candidate.artifactId, expectedActiveArtifactId: null, kind: 'BOOTSTRAP' });
  assert.equal(receipt.status, 'SUCCEEDED');
  assert.deepEqual(counts(), { posts: 1, staleReads: 0 });
});

test('unavailable readback remains uncertain and never creates a success receipt or repeats POST', async t => {
  const { root, candidate, manager, counts } = await fixture(t, { unavailableReadback: true });
  await assert.rejects(manager.activate({ artifactId: candidate.artifactId, expectedActiveArtifactId: null, kind: 'BOOTSTRAP' }), ActivationUncertainError);
  assert.equal(counts().posts, 1);
  await assert.rejects(readReceipt(root, candidate.artifactId), { code: 'ENOENT' });
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sealArtifact, readReceipt } from '../apps/web/scripts/publication/artifact-store.mjs';
import { createServingConfig } from '../apps/web/scripts/publication/serving-config.mjs';
import { CaddyActivation, ActivationConflictError, ActivationUncertainError } from '../apps/web/scripts/publication/caddy-activation.mjs';

const suffix = randomUUID().slice(0, 8);
const server = `astro-activation-caddy-${suffix}`;
const api = `astro-activation-api-${suffix}`;
const network = `astro-activation-${suffix}`;
const root = await mkdtemp(join(tmpdir(), 'astro-static-activation-'));
const safeRoot = await realpath(root);
const token = 'synthetic-publication-proxy-token-for-rehearsal';
function command(args, optional = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 90000 });
  if (!optional && result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return optional ? `${result.stdout || ''}${result.stderr || ''}`.trim() : result.stdout?.trim();
}
const port = (name, value) => Number(command(['port', name, value]).match(/:(\d+)\s*$/)[1]);
let base, adminUrl, upstream;
const options = () => ({ publicationToken: token, apiUpstream: `${api}:3000`, adminListen: ':2019' });
async function waitReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await fetch(`${adminUrl}/config/`, { headers: { origin: 'http://127.0.0.1:2019' } }).then((response) => response.ok, () => false)) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(command(['logs', server], true) || 'Caddy did not become ready');
}
async function artifact(letter, revision, renderer = 'f'.repeat(64), publicationId = `publication-${revision}`, catalogDigest = letter.repeat(64)) {
  const directory = join(root, `build-${letter}`); await mkdir(join(directory, '_astro'), { recursive: true });
  await mkdir(join(directory, 'city'));
  await writeFile(join(directory, 'index.html'), `<html><head><title>Version ${letter}</title></head><body><h1>${letter}</h1><script src="/__publication_assets/${letter.repeat(64)}/_astro/client.js"></script></body></html>`);
  await writeFile(join(directory, 'city', 'index.html'), `<h1>City ${letter}</h1>`);
  await writeFile(join(directory, '404.html'), `<h1>404 ${letter}</h1>`);
  await writeFile(join(directory, '_astro', 'client.js'), `window.version = ${JSON.stringify(letter)};`);
  return sealArtifact({ publicationRoot: root, sourceDirectory: directory, identity: {
    artifactId: letter.repeat(64), rendererId: renderer, catalogDigest,
    siteId: 'site-1', siteSlug: 'domru-site', siteRevision: revision,
    publicationId, rebuildId: `rebuild-${letter}`, rebuildRevision: revision,
    redirects: [{ id: 'redirect-1', sourcePath: '/old-city' }],
  } });
}
async function visible(letter, revision = letter === 'a' ? 1 : 2) {
  const [page, catalog, redirect] = await Promise.all([
    fetch(`${base}/`).then((response) => response.text()),
    fetch(`${base}/api/v1/catalog`, { headers: { 'x-site-publication-id': 'spoofed', 'x-site-publication-token': 'spoofed' } }).then((response) => response.json()),
    fetch(`${base}/old-city?campaign=preserved`, { redirect: 'manual' }),
  ]);
  assert.match(page, new RegExp(`<h1>${letter}</h1>`));
  assert.equal(catalog.publicationId, `publication-${revision}`);
  assert.equal(catalog.trusted, true);
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), `/city?campaign=preserved`);
}
try {
  command(['network', 'create', network]);
  const mockApi = `const http=require('node:http'); http.createServer((q,s)=>{const trusted=q.headers['x-site-publication-token']===${JSON.stringify(token)};if(q.url.includes('/redirects/')){s.writeHead(trusted?301:403,{location:'/city'+(q.url.includes('?')?q.url.slice(q.url.indexOf('?')):'')});s.end();return;}s.setHeader('content-type','application/json');s.end(JSON.stringify({publicationId:q.headers['x-site-publication-id'],trusted}));}).listen(3000,'0.0.0.0');`;
  command(['run', '--rm', '-d', '--name', api, '--network', network, 'node:22.23.2-alpine', 'node', '-e', mockApi]);
  await writeFile(join(root, 'boot.json'), JSON.stringify(createServingConfig(null, options())));
  command(['run', '-d', '--name', server, '--network', network,
    '-v', `${resolve(root)}:/publication`, '-e', 'XDG_CONFIG_HOME=/publication/state',
    '-p', '127.0.0.1::80', '-p', '127.0.0.1::2019', 'caddy:2.11.4-alpine',
    'caddy', 'run', '--config', '/publication/boot.json']);
  base = `http://127.0.0.1:${port(server, '80/tcp')}`;
  adminUrl = `http://127.0.0.1:${port(server, '2019/tcp')}`;
  await waitReady();
  const manager = new CaddyActivation({ publicationRoot: root, adminUrl, servingOptions: options() });
  const a = await artifact('a', 1); const b = await artifact('b', 2);
  await manager.activate({ artifactId: a.artifactId, expectedActiveArtifactId: null, kind: 'BOOTSTRAP' });
  await visible('a');
  const slash = await fetch(`${base}/city/?x=1`, { redirect: 'manual' });
  assert.equal(slash.status, 301); assert.equal(slash.headers.get('location'), '/city?x=1');
  const missing = await fetch(`${base}/unknown`); assert.equal(missing.status, 404); assert.match(await missing.text(), /404 a/);
  assert.equal((await fetch(`${base}/__publication_assets/${a.artifactId}/index.html`)).status, 404);
  assert.equal((await fetch(`${base}/manifests/${a.artifactId}.json`)).status, 404);

  // A genuine rejected whole-config update preserves A (including active API identity).
  const state = await manager.current();
  const invalid = structuredClone(createServingConfig(b, options()));
  invalid.apps.http.servers.public.routes[0].handle.push({ handler: 'not_an_installed_module' });
  const rejected = await fetch(`${adminUrl}/config/`, { method: 'POST', headers: { origin: 'http://127.0.0.1:2019', 'content-type': 'application/json', 'if-match': state.etag }, body: JSON.stringify(invalid) });
  assert.equal(rejected.ok, false); await visible('a');
  await assert.rejects(readReceipt(root, b.artifactId), { code: 'ENOENT' });

  // B commits, but the transport discards the successful answer. The readback proves success.
  let drop = true;
  const lostReply = new CaddyActivation({ publicationRoot: root, adminUrl, servingOptions: options(), fetchImpl: async (url, request) => {
    const response = await fetch(url, request);
    if (request?.method === 'POST' && drop) { drop = false; throw new Error('Synthetic lost response after commit'); }
    return response;
  } });
  const receipt = await lostReply.activate({ artifactId: b.artifactId, expectedActiveArtifactId: a.artifactId });
  assert.equal(receipt.status, 'SUCCEEDED'); await visible('b');
  assert.deepEqual(await manager.activate({ artifactId: b.artifactId, expectedActiveArtifactId: a.artifactId }), receipt);
  assert.match(await fetch(`${base}/__publication_assets/${a.artifactId}/_astro/client.js`).then((response) => response.text()), /"a"/);
  await rm(join(root, 'receipts', `${b.artifactId}.json`));

  // Old code/candidate and an outdated compare-and-swap cannot roll serving back.
  const wrongRenderer = await artifact('c', 3, 'd'.repeat(64));
  await assert.rejects(manager.activate({ artifactId: wrongRenderer.artifactId, expectedActiveArtifactId: b.artifactId }), ActivationConflictError);
  assert.deepEqual(await readReceipt(root, b.artifactId), receipt, 'restart recovery records B before any later activation');
  const newer = await artifact('d', 3);
  await assert.rejects(manager.activate({ artifactId: newer.artifactId, expectedActiveArtifactId: a.artifactId }), ActivationConflictError);
  const stale = await fetch(`${adminUrl}/config/`, { method: 'POST', headers: { origin: 'http://127.0.0.1:2019', 'content-type': 'application/json', 'if-match': state.etag }, body: JSON.stringify(createServingConfig(a, options())) });
  assert.equal(stale.status, 412); await visible('b');

  // A process restarts from Caddy's own durable autosave, not a second independent pointer.
  command(['exec', server, 'test', '-f', '/publication/state/caddy/autosave.json']);
  command(['rm', '-f', server]);
  command(['run', '-d', '--name', server, '--network', network,
    '-v', `${resolve(root)}:/publication`, '-e', 'XDG_CONFIG_HOME=/publication/state',
    '-p', '127.0.0.1::80', '-p', '127.0.0.1::2019', 'caddy:2.11.4-alpine', 'caddy', 'run', '--resume']);
  base = `http://127.0.0.1:${port(server, '80/tcp')}`; adminUrl = `http://127.0.0.1:${port(server, '2019/tcp')}`;
  await waitReady(); await visible('b');
  const restarted = new CaddyActivation({ publicationRoot: root, adminUrl, servingOptions: options() });
  assert.deepEqual(await restarted.activate({ artifactId: b.artifactId, expectedActiveArtifactId: a.artifactId }), receipt);

  // If both acknowledgement and readback fail, the caller must keep an UNKNOWN outcome.
  const unknown = new CaddyActivation({ publicationRoot: root, adminUrl, servingOptions: options(), fetchImpl: async (url, request) => {
    if (request?.method === 'POST') { await fetch(url, request); throw new Error('Synthetic lost reply after commit'); }
    if (url.endsWith('/config/') && unknown.seen) throw new Error('Synthetic readback unavailable');
    unknown.seen = true; return fetch(url, request);
  } });
  await assert.rejects(unknown.activate({ artifactId: newer.artifactId, expectedActiveArtifactId: b.artifactId }), ActivationUncertainError);
  await visible('d', 3);
  await assert.rejects(readReceipt(root, newer.artifactId), { code: 'ENOENT' });
  const resolved = await restarted.activate({ artifactId: newer.artifactId, expectedActiveArtifactId: b.artifactId });
  assert.equal(resolved.status, 'SUCCEEDED');
  assert.deepEqual(await restarted.activate({ artifactId: b.artifactId, expectedActiveArtifactId: a.artifactId }), receipt);
  await visible('d', 3);
  const badCode = await artifact('e', 3, 'e'.repeat(64));
  await assert.rejects(restarted.activate({ artifactId: badCode.artifactId, expectedActiveArtifactId: newer.artifactId, kind: 'CODE' }), ActivationConflictError);
  const code = await artifact('f', 3, 'e'.repeat(64), 'publication-3', newer.catalogDigest);
  await restarted.activate({ artifactId: code.artifactId, expectedActiveArtifactId: newer.artifactId, kind: 'CODE' });
  await visible('f', 3);
  command(['rm', '-f', api]);
  assert.match(await fetch(`${base}/`).then((response) => response.text()), /<h1>f<\/h1>/);
  assert.match(await fetch(`${base}/__publication_assets/${a.artifactId}/_astro/client.js`).then((response) => response.text()), /"a"/);
  process.stdout.write('Caddy: atomic serving, lost response reconciled, stale writer rejected, restart resumed, previous assets retained; HTML remains autonomous without API\n');
} catch (error) {
  const logs = command(['logs', server], true);
  if (logs) process.stderr.write(`${logs.slice(-5000)}\n`);
  const diagnostic = command(['inspect', server, '--format', '{{json .State}} {{json .NetworkSettings.Ports}} {{json .HostConfig.PortBindings}}'], true);
  if (diagnostic) process.stderr.write(`${diagnostic}\n`);
  throw error;
} finally {
  command(['rm', '-f', server], true); command(['rm', '-f', api], true); command(['network', 'rm', network], true);
  if ((await realpath(root)) !== safeRoot || !safeRoot.startsWith(await realpath(tmpdir()))) throw new Error('Unexpected rehearsal cleanup root');
  await rm(root, { recursive: true, force: true });
}

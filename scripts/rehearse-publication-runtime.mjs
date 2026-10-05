import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealArtifact } from '../apps/web/scripts/publication/artifact-store.mjs';

const require = createRequire(import.meta.url);
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { publicationSource, city } = require('../tests/helpers/publication-source.cjs');
const suffix = randomUUID().slice(0, 8);
const name = `astro-publication-runtime-${suffix}`;
const image = `astro-publication-runtime:fixture-${suffix}`;
const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url));
await mkdir(temporary, { recursive: true });
const root = await mkdtemp(join(temporary, 'publication-runtime-'));
const safeRoot = await realpath(root);
const token = 'runtime-fixture-machine-token-'.repeat(2);
const commit = 'c'.repeat(40);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function docker(args, optional = false, timeout = 90000) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  if (!optional && result.status !== 0) throw new Error((result.stderr || result.stdout || String(result.error)).slice(-16000));
  return result.stdout?.trim();
}
async function until(predicate, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await predicate().catch(() => false)) return; await new Promise(done => setTimeout(done, 150)); }
  throw new Error(message);
}
let api; let providerReads = 0; let originalError;
try {
  docker(['build', '--file', 'apps/web/Dockerfile', '--target', 'publication-runtime', '--tag', image, '.'], false, 600000);
  const source = publicationSource([city('kazan')]);
  source.cities[0].status = 'PUBLISHED'; source.cities[0].pages[0].status = 'PUBLISHED';
  for (const page of source.globalPages) page.status = 'PUBLISHED';
  const catalog = new SiteCatalogService({}).renderSource(source, new Date('2026-10-06T00:00:00Z'));
  const snapshots = new Map([['publication-a', { publicationId: 'publication-a', siteId: 'site-1', siteSlug: source.site.slug,
    siteRevision: 7, catalogDigest: sha(catalog), catalog }]]);
  const candidate = structuredClone(snapshots.get('publication-a'));
  candidate.publicationId = 'publication-b'; candidate.siteRevision = 8;
  candidate.catalog.seoByPath['/kazan'].title = 'Контент опубликован без deployment'; candidate.catalogDigest = sha(candidate.catalog);
  snapshots.set(candidate.publicationId, candidate);
  api = createServer((request, response) => {
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (request.url === '/api/v1/applications/application-1') { providerReads++; send(200, { uuid: 'application-1', status: 'running:healthy' }); return; }
    if (request.url === '/api/v1/deployments/applications/application-1?take=10') { providerReads++; send(200, { deployments: [{ deployment_uuid: 'deployment-1', status: 'finished', commit }] }); return; }
    const match = request.url.match(/^\/api\/v1\/internal\/site-publications\/domru-site\/snapshots\/(publication-[ab])$/);
    if (match && request.headers['x-admin-token'] === token) { send(200, snapshots.get(match[1])); return; }
    send(404, { error: 'Fixture endpoint unavailable' });
  });
  await new Promise(done => api.listen(0, '0.0.0.0', done));
  const apiPort = api.address().port;
  const oldSource = join(root, 'source'); await mkdir(oldSource);
  await writeFile(join(oldSource, 'index.html'), '<h1>Previously served HTML</h1>');
  await writeFile(join(oldSource, '404.html'), '<h1>404</h1>');
  await writeFile(join(oldSource, 'old.js'), 'console.log("retained")');
  const baseline = await sealArtifact({ publicationRoot: root, sourceDirectory: oldSource, identity: {
    publicationId: 'publication-a', siteId: 'site-1', siteSlug: source.site.slug, siteRevision: 7,
    catalogDigest: sha(catalog), rendererId: 'd'.repeat(64), artifactId: 'a'.repeat(64), rebuildId: 'legacy-baseline', rebuildRevision: 1, redirects: [],
  } });
  const user = process.platform === 'linux' ? ['--user', `${process.getuid()}:${process.getgid()}`] : [];
  docker(['run', '-d', '--name', name, ...user, '--add-host', 'host.docker.internal:host-gateway', '-v', `${resolve(root)}:/publication`,
    '-p', '127.0.0.1::80', '-p', '127.0.0.1::8081', '-e', `ADMIN_API_TOKEN=${token}`, '-e', `PUBLICATION_BASELINE_ARTIFACT_ID=${baseline.artifactId}`,
    '-e', 'PUBLIC_SITE_URL=https://partner.example.test', '-e', 'PUBLIC_API_URL=https://partner.example.test/api/v1', '-e', `PUBLIC_SITE_SLUG=${source.site.slug}`,
    '-e', `SITE_DATA_API_URL=http://host.docker.internal:${apiPort}/api/v1`, '-e', `API_UPSTREAM=host.docker.internal:${apiPort}`,
    '-e', `COOLIFY_API_URL=http://host.docker.internal:${apiPort}/api/v1`, '-e', 'COOLIFY_API_TOKEN=fixture-provider', '-e', 'COOLIFY_RESOURCE_UUID=application-1', image]);
  const port = service => Number(docker(['port', name, service]).match(/:(\d+)\s*$/)[1]);
  let publicUrl = `http://127.0.0.1:${port('80/tcp')}`; let privateUrl = `http://127.0.0.1:${port('8081/tcp')}`;
  const request = async (path, body) => {
    const response = await fetch(`${privateUrl}${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'x-admin-token': token, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
    return { status: response.status, body: await response.json() };
  };
  await until(async () => (await request('/active')).status === 200, 'Runtime did not become ready');
  assert.equal(await fetch(publicUrl).then(response => response.text()), '<h1>Previously served HTML</h1>');
  assert.equal((await fetch(`${publicUrl}/renderer`)).status, 404, 'Private controller was exposed on public HTTP');
  assert.equal((await fetch(`${privateUrl}/active`)).status, 401);
  docker(['exec', name, 'test', '!', '-e', '/workspace/.codex-tmp']);
  const job = { publicationId: 'publication-b', siteId: 'site-1', siteSlug: source.site.slug, rebuildId: 'cms-b', rebuildRevision: 1 };
  assert.equal((await request('/publish', job)).status, 202, 'CMS used the unreleased renderer');
  const renderer = (await request('/renderer')).body;
  const release = await request('/release-code', { ...renderer, deploymentId: 'deployment-1', expectedCommit: commit });
  assert.equal(release.status, 200, JSON.stringify(release.body)); assert.equal(release.body.publicationId, 'publication-a');
  assert.equal(release.body.catalogDigest, baseline.catalogDigest); assert.equal(release.body.rendererId, renderer.rendererId);
  assert.ok(providerReads >= 4); const beforeCms = providerReads;
  const published = await request('/publish', job);
  assert.equal(published.status, 200, JSON.stringify(published.body)); assert.equal(published.body.publicationId, 'publication-b');
  assert.equal(providerReads, beforeCms, 'CMS publication consulted the deployment provider');
  const html = await fetch(`${publicUrl}/kazan`).then(response => response.text()); assert.ok(html.includes(candidate.catalog.seoByPath['/kazan'].title));
  const retained = `${publicUrl}/__publication_assets/${baseline.artifactId}/old.js`;
  assert.equal((await fetch(retained)).status, 200);
  assert.equal((await request('/publish', job)).body.artifactId, published.body.artifactId);
  await new Promise(done => { api.closeAllConnections(); api.close(done); }); api = null;
  docker(['restart', name]);
  publicUrl = `http://127.0.0.1:${port('80/tcp')}`; privateUrl = `http://127.0.0.1:${port('8081/tcp')}`;
  await until(async () => (await request('/active')).body.publicationId === 'publication-b', 'Runtime did not resume B without API');
  assert.equal(await fetch(`${publicUrl}/kazan`).then(response => response.text()), html);
  assert.equal((await fetch(`${publicUrl}/__publication_assets/${baseline.artifactId}/old.js`)).status, 200);
  // Stop only the owned Caddy child: its supervisor must stop too, rather than serve a misleading controller state.
  docker(['exec', name, 'sh', '-c', 'kill -TERM $(pidof caddy)']);
  await until(async () => docker(['inspect', '--format', '{{.State.Running}}', name]) === 'false', 'Caddy exit did not stop its supervisor');
  assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', name]), '1');
  console.log('Runtime proof passed: CODE preserves serving A; CMS publishes B without provider; restart retains B/assets without API; Caddy exit stops supervisor');
} catch (error) { originalError = error; console.error(error.message); process.exitCode = 1; }
finally {
  const failures = [];
  if (api) { api.closeAllConnections(); await new Promise(done => api.close(done)); }
  docker(['rm', '-f', name], true); docker(['image', 'rm', image], true);
  try {
    if (await realpath(root) !== safeRoot || !safeRoot.startsWith(`${await realpath(temporary)}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('Unsafe runtime fixture cleanup');
    await rm(root, { recursive: true, force: true });
  } catch (error) { failures.push(error); }
  if (!originalError && failures.length) throw new AggregateError(failures, 'Runtime fixture cleanup failed');
}

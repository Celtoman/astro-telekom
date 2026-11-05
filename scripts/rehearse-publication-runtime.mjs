import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactInventory } from '../apps/web/scripts/publication/artifact-store.mjs';
import { htmlInventoryDigest } from '../apps/web/scripts/publication/legacy-baseline.mjs';

const require = createRequire(import.meta.url);
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { publicationSource, city } = require('../tests/helpers/publication-source.cjs');
const { accountPageDefaults } = require('../apps/api/dist/account-page-defaults.js');
const { ACCOUNT_PAGE_SLUG } = require('../apps/api/dist/account-page-model.js');
const suffix = randomUUID().slice(0, 8);
const name = `astro-publication-runtime-${suffix}`;
const image = `astro-publication-runtime:fixture-${suffix}`;
const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url));
await mkdir(temporary, { recursive: true });
const root = await mkdtemp(join(temporary, 'publication-runtime-'));
const safeRoot = await realpath(root);
const token = 'runtime-fixture-machine-token-'.repeat(2);
const rotatedToken = 'rotated-runtime-fixture-machine-token-'.repeat(2);
const commit = 'c'.repeat(40);
// This is a fixture observation budget, not a production activation timeout.
// Docker Desktop bind-mounted builds compete with other rehearsals on Windows.
// Record elapsed time so a delayed automatic completion is distinguishable from
// a manual retry. Keep the Linux/CI budget unchanged and every integrity check.
const codeWaitMs = process.platform === 'win32' ? 240000 : 120000;
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
let api, nextApi, diagnosticRequest, diagnosticRenderer; let providerReads = 0; let originalError;
let currentToken = token; let deploymentId = 'deployment-1'; let deploymentStatus = 'in_progress';
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
  const accountSource = structuredClone(source);
  accountSource.globalPages.push({ id: 'page-account-runtime', type: 'ACCOUNT', slug: ACCOUNT_PAGE_SLUG, title: 'Личный кабинет Дом.ру', status: 'PUBLISHED', content: accountPageDefaults(), blocks: [] });
  accountSource.seoTemplates.push({ kind: 'ACCOUNT', titleTemplate: 'Личный кабинет Дом.ру — вход и инструкции', descriptionTemplate: 'Вход, восстановление доступа, оплата и приложение.', indexState: 'INDEX' });
  candidate.catalog = new SiteCatalogService({}).renderSource(accountSource, new Date('2026-10-06T00:00:00Z'));
  assert.equal(candidate.catalog.routes.length, catalog.routes.length + 1);
  candidate.catalog.seoByPath['/kazan'].title = 'Контент опубликован без deployment'; candidate.catalogDigest = sha(candidate.catalog);
  snapshots.set(candidate.publicationId, candidate);
  api = createServer((request, response) => {
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (request.url === '/api/v1/serving-probe') { send(200, { backend: 'original', publicationId: request.headers['x-site-publication-id'], tokenDigest: sha(request.headers['x-site-publication-token']) }); return; }
    if (request.url === '/api/v1/applications/application-1') { providerReads++; send(200, { uuid: 'application-1', status: 'running:healthy' }); return; }
    if (request.url === '/api/v1/deployments/applications/application-1?take=10') { providerReads++; send(200, { deployments: [{ deployment_uuid: deploymentId, status: deploymentStatus, commit }] }); return; }
    const match = request.url.match(/^\/api\/v1\/internal\/site-publications\/domru-site\/snapshots\/(publication-[ab])$/);
    if (match && request.headers['x-admin-token'] === currentToken) { send(200, snapshots.get(match[1])); return; }
    send(404, { error: 'Fixture endpoint unavailable' });
  });
  await new Promise(done => api.listen(0, '0.0.0.0', done));
  const apiPort = api.address().port;
  const oldSource = join(root, 'releases', 'legacy-current'); await mkdir(oldSource, { recursive: true });
  for (const route of catalog.routes.filter(route => route.path !== '/')) {
    const page = join(oldSource, route.path.slice(1), 'index.html'); await mkdir(resolve(page, '..'), { recursive: true });
    await writeFile(page, `<h1>Old ${route.path}</h1>`);
  }
  await writeFile(join(oldSource, 'index.html'), '<h1>Previously served HTML</h1>');
  await writeFile(join(oldSource, '404.html'), '<h1>404</h1>');
  await writeFile(join(oldSource, 'old.js'), 'console.log("retained")');
  const legacyDigest = htmlInventoryDigest(await artifactInventory(oldSource));
  const user = process.platform === 'linux' ? ['--user', `${process.getuid()}:${process.getgid()}`]
    : process.argv.includes('--non-root') ? ['--user', '1001:1001'] : [];
  docker(['run', '--rm', '--name', `${name}-link`, ...user, '-v', `${resolve(root)}:/publication`, image,
    'node', '-e', "require('node:fs').symlinkSync('releases/legacy-current', '/publication/current')"]);
  const start = (upstreamPort, testMode = true) => docker(['run', '-d', '--name', name, ...user, '--add-host', 'host.docker.internal:host-gateway', '-v', `${resolve(root)}:/publication`,
    '-p', '127.0.0.1::80', '-p', '127.0.0.1::8081', '-e', `ADMIN_API_TOKEN=${currentToken}`,
    '-e', 'PUBLICATION_LEGACY_PUBLICATION_ID=publication-a', '-e', 'PUBLICATION_LEGACY_SITE_ID=site-1', '-e', 'PUBLICATION_LEGACY_SITE_REVISION=7',
    '-e', `PUBLICATION_LEGACY_CATALOG_DIGEST=${sha(catalog)}`, '-e', `PUBLICATION_LEGACY_HTML_DIGEST=${legacyDigest}`,
    '-e', `PUBLICATION_LEGACY_CODE_COMMIT=${'d'.repeat(40)}`, '-e', 'PUBLICATION_LEGACY_DEPLOYMENT_ID=legacy-deployment',
    '-e', `PUBLIC_TEST_MODE=${testMode}`,
    '-e', `SOURCE_COMMIT=${commit}`,
    '-e', 'PUBLIC_SITE_URL=https://partner.example.test', '-e', 'PUBLIC_API_URL=https://partner.example.test/api/v1', '-e', `PUBLIC_SITE_SLUG=${source.site.slug}`,
    '-e', `SITE_DATA_API_URL=http://host.docker.internal:${apiPort}/api/v1`, '-e', `API_UPSTREAM=host.docker.internal:${upstreamPort}`,
    '-e', `COOLIFY_API_URL=http://host.docker.internal:${apiPort}/api/v1`, '-e', 'COOLIFY_API_TOKEN=fixture-provider', '-e', 'COOLIFY_RESOURCE_UUID=application-1', image]);
  start(apiPort);
  const port = service => Number(docker(['port', name, service]).match(/:(\d+)\s*$/)[1]);
  let publicUrl = `http://127.0.0.1:${port('80/tcp')}`; let privateUrl = `http://127.0.0.1:${port('8081/tcp')}`;
  const request = async (path, body) => {
    const response = await fetch(`${privateUrl}${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'x-admin-token': currentToken, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
    return { status: response.status, body: await response.json() };
  };
  diagnosticRequest = request;
  await until(async () => (await request('/active')).status === 200, 'Runtime did not become ready');
  const baseline = (await request('/active')).body;
  assert.equal(await fetch(publicUrl).then(response => response.text()), '<h1>Previously served HTML</h1>');
  assert.equal((await fetch(`${publicUrl}/renderer`)).status, 404, 'Private controller was exposed on public HTTP');
  assert.equal((await fetch(`${privateUrl}/active`)).status, 401);
  docker(['exec', name, 'test', '!', '-e', '/workspace/.codex-tmp']);
  const job = { publicationId: 'publication-b', siteId: 'site-1', siteSlug: source.site.slug, rebuildId: 'cms-b', rebuildRevision: 1 };
  assert.equal((await request('/publish', job)).status, 202, 'CMS used the unreleased renderer');
  const renderer = (await request('/renderer')).body;
  diagnosticRenderer = renderer;
  deploymentStatus = 'finished';
  const initialCodeStart = Date.now();
  await until(async () => (await request('/active')).body.rendererId === renderer.rendererId, 'Automatic CODE did not finish', codeWaitMs);
  console.log(`Runtime timing CODE A: ${Date.now() - initialCodeStart}ms (budget ${codeWaitMs}ms)`);
  const release = (await request('/active')).body;
  assert.equal(release.publicationId, 'publication-a');
  assert.equal(release.catalogDigest, baseline.catalogDigest); assert.equal(release.rendererId, renderer.rendererId);
  assert.equal((await fetch(`${publicUrl}/${ACCOUNT_PAGE_SLUG}`)).status, 404, 'CODE added ACCOUNT to an old snapshot');
  assert.ok(providerReads >= 4); const beforeCms = providerReads;
  assert.equal((await fetch(`${publicUrl}/old.js`)).status, 200, 'CODE dropped a legacy unversioned asset');
  const published = await request('/publish', job);
  assert.equal(published.status, 200, JSON.stringify(published.body)); assert.equal(published.body.publicationId, 'publication-b');
  assert.equal(providerReads, beforeCms, 'CMS publication consulted the deployment provider');
  const html = await fetch(`${publicUrl}/kazan`).then(response => response.text()); assert.ok(html.includes(candidate.catalog.seoByPath['/kazan'].title));
  const accountResponse = await fetch(`${publicUrl}/${ACCOUNT_PAGE_SLUG}`); assert.equal(accountResponse.status, 200);
  const accountHtml = await accountResponse.text(); assert.equal((accountHtml.match(/data-account-image=/g) || []).length, 14);
  const accountAsset = accountHtml.match(/<img[^>]*data-account-image="heroLogin"[^>]*src="([^"]+)"/)?.[1]; assert.ok(accountAsset);
  assert.equal((await fetch(`${publicUrl}${accountAsset}`)).status, 200, 'Linux ACCOUNT asset was not served from the immutable artifact');
  const retained = `${publicUrl}/__publication_assets/${baseline.artifactId}/old.js`;
  assert.equal((await fetch(retained)).status, 200);
  assert.equal((await request('/publish', job)).body.artifactId, published.body.artifactId);

  // A configuration-only deployment must release the new context after terminal
  // provider confirmation, even when the renderer source files are unchanged.
  const oldAsset = html.match(/(?:src|href)="(\/__publication_assets\/[^" ]+\.(?:js|css))"/)?.[1]; assert.ok(oldAsset);
  nextApi = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ backend: 'updated', publicationId: request.headers['x-site-publication-id'], tokenDigest: sha(request.headers['x-site-publication-token']) }));
  });
  await new Promise(done => nextApi.listen(0, '0.0.0.0', done));
  docker(['rm', '-f', name]); currentToken = rotatedToken; deploymentId = 'deployment-2'; deploymentStatus = 'in_progress';
  start(nextApi.address().port, false);
  publicUrl = `http://127.0.0.1:${port('80/tcp')}`; privateUrl = `http://127.0.0.1:${port('8081/tcp')}`;
  await until(async () => (await request('/active')).body.publicationId === 'publication-b', 'Configuration rollout did not resume B');
  const contextRenderer = (await request('/renderer')).body;
  assert.notEqual(contextRenderer.rendererId, renderer.rendererId, 'Changed serving options were invisible to CODE identity');
  assert.equal(await fetch(`${publicUrl}/kazan`).then(response => response.text()), html);
  assert.equal((await fetch(`${publicUrl}/kazan`)).headers.get('x-robots-tag'), 'noindex, nofollow');
  const probe = () => fetch(`${publicUrl}/api/v1/serving-probe`).then(response => response.json());
  const proxyDigest = value => sha(createHmac('sha256', value).update('serving-publication:v1').digest('hex'));
  assert.deepEqual(await probe(), { backend: 'original', publicationId: 'publication-b', tokenDigest: proxyDigest(token) });
  const pendingJob = { ...job, rebuildId: 'cms-after-context', rebuildRevision: 2 };
  assert.equal((await request('/publish', pendingJob)).status, 202, 'CMS changed serving config before CODE release');
  const contextInput = { ...contextRenderer, deploymentId, expectedCommit: commit };
  assert.equal((await request('/release-code', contextInput)).status, 202, 'Nonterminal deployment released new context');
  assert.deepEqual(await probe(), { backend: 'original', publicationId: 'publication-b', tokenDigest: proxyDigest(token) });
  deploymentStatus = 'finished';
  const contextCodeStart = Date.now();
  await until(async () => (await request('/active')).body.rendererId === contextRenderer.rendererId, 'Automatic context CODE did not finish', codeWaitMs);
  console.log(`Runtime timing context CODE: ${Date.now() - contextCodeStart}ms (budget ${codeWaitMs}ms)`);
  const contextRelease = (await request('/active')).body;
  assert.equal(contextRelease.publicationId, 'publication-b'); assert.equal(contextRelease.siteRevision, 8);
  assert.equal(contextRelease.catalogDigest, candidate.catalogDigest); assert.equal(contextRelease.rendererId, contextRenderer.rendererId);
  assert.deepEqual(await probe(), { backend: 'updated', publicationId: 'publication-b', tokenDigest: proxyDigest(rotatedToken) });
  assert.equal((await fetch(`${publicUrl}/kazan`)).headers.get('x-robots-tag'), null);
  assert.equal((await fetch(`${publicUrl}${oldAsset}`)).status, 200);
  assert.equal((await fetch(`${publicUrl}/old.js`)).status, 200);
  const contextHtml = await fetch(`${publicUrl}/kazan`).then(response => response.text());
  assert.ok(contextHtml.includes(candidate.catalog.seoByPath['/kazan'].title));
  await new Promise(done => { api.closeAllConnections(); api.close(done); }); api = null;
  await new Promise(done => { nextApi.closeAllConnections(); nextApi.close(done); }); nextApi = null;
  docker(['restart', name]);
  publicUrl = `http://127.0.0.1:${port('80/tcp')}`; privateUrl = `http://127.0.0.1:${port('8081/tcp')}`;
  await until(async () => (await request('/active')).body.publicationId === 'publication-b', 'Runtime did not resume B without API');
  assert.equal(await fetch(`${publicUrl}/kazan`).then(response => response.text()), contextHtml);
  assert.equal((await request('/active')).body.rendererId, contextRenderer.rendererId);
  assert.equal((await fetch(`${publicUrl}/__publication_assets/${baseline.artifactId}/old.js`)).status, 200);
  assert.equal((await fetch(`${publicUrl}/old.js`)).status, 200);
  // Stop only the owned Caddy child: its supervisor must stop too, rather than serve a misleading controller state.
  docker(['exec', name, 'sh', '-c', 'kill -TERM $(pidof caddy)']);
  await until(async () => docker(['inspect', '--format', '{{.State.Running}}', name]) === 'false', 'Caddy exit did not stop its supervisor');
  assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', name]), '1');
  console.log('Runtime proof passed: CODE preserves serving A; CMS publishes B without provider; ACCOUNT14 assets decode and serve on Linux/non-root; changed serving context waits for terminal CODE and preserves B; restart retains B/assets without API; Caddy exit stops supervisor');
} catch (error) {
  originalError = error; console.error(error.stack || error.message);
  // The automatic reconciler deliberately hides retryable errors. Surface the
  // same guarded CODE operation in this isolated fixture before cleanup, rather
  // than losing its cause among Caddy's polling diagnostics. Never change gates.
  if (diagnosticRequest && diagnosticRenderer) {
    try {
      const result = await diagnosticRequest('/release-code', { deploymentId, expectedCommit: commit, rendererId: diagnosticRenderer.rendererId, instanceId: diagnosticRenderer.instanceId });
      console.error('CODE diagnostic:', JSON.stringify(result).split(token).join('[redacted]').split(rotatedToken).join('[redacted]'));
    } catch (detail) { console.error('CODE diagnostic unavailable:', detail.message); }
  }
  let logs = docker(['logs', '--tail', '60', name], true) || '';
  // Docker writes Caddy/Node diagnostics to stderr as well as stdout.
  const observed = spawnSync('docker', ['logs', '--tail', '60', name], { encoding: 'utf8', timeout: 10000 });
  logs += observed.stderr || '';
  console.error(logs.split(token).join('[redacted]').split(rotatedToken).join('[redacted]').split('fixture-provider').join('[redacted]'));
  process.exitCode = 1;
}
finally {
  const failures = [];
  if (api) { api.closeAllConnections(); await new Promise(done => api.close(done)); }
  if (nextApi) { nextApi.closeAllConnections(); await new Promise(done => nextApi.close(done)); }
  docker(['rm', '-f', name], true); docker(['rm', '-f', `${name}-link`], true);
  try {
    if (await realpath(root) !== safeRoot || !safeRoot.startsWith(`${await realpath(temporary)}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('Unsafe runtime fixture cleanup');
    // Remove the Linux symlink with the filesystem that created it. Windows
    // cannot unlink the reparse point exposed by a Docker bind mount.
    docker(['run', '--rm', '--name', `${name}-cleanup`, '-v', `${resolve(root)}:/publication`, image,
      'node', '-e', "const fs=require('node:fs'); try { fs.unlinkSync('/publication/current'); } catch(e) { if(e.code!=='ENOENT') throw e; }"]);
    await rm(root, { recursive: true, force: true });
  } catch (error) { failures.push(error); }
  docker(['rm', '-f', `${name}-cleanup`], true); docker(['image', 'rm', image], true);
  if (!originalError && failures.length) throw new AggregateError(failures, 'Runtime fixture cleanup failed');
}

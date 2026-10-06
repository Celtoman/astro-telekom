import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readArtifact } from './artifact-store.mjs';
import { createServingConfig, activePublication, servingOptionsDigest } from './serving-config.mjs';
import { CaddyActivation } from './caddy-activation.mjs';
import { StaticArtifactBuilder } from './static-builder.mjs';
import { PublicationController, createPublicationServer } from './publication-controller.mjs';
import { createCodeDeploymentVerifier } from './code-deployment.mjs';
import { AutomaticCodeRelease } from './automatic-code-release.mjs';
import { adoptLegacyBaseline, readLegacyBaseline } from './legacy-baseline.mjs';

const missing = error => { if (error.code !== 'ENOENT') throw error; return null; };

export async function prepareLegacyBaseline(root, environment) {
  const existing = await readLegacyBaseline(root);
  if (existing || !environment.PUBLICATION_LEGACY_PUBLICATION_ID) return existing;
  const proof = { publicationId: environment.PUBLICATION_LEGACY_PUBLICATION_ID, siteId: environment.PUBLICATION_LEGACY_SITE_ID,
    siteSlug: environment.PUBLIC_SITE_SLUG, siteRevision: Number(environment.PUBLICATION_LEGACY_SITE_REVISION),
    catalogDigest: environment.PUBLICATION_LEGACY_CATALOG_DIGEST, htmlDigest: environment.PUBLICATION_LEGACY_HTML_DIGEST,
    codeCommit: environment.PUBLICATION_LEGACY_CODE_COMMIT, deploymentId: environment.PUBLICATION_LEGACY_DEPLOYMENT_ID };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proof.siteSlug || '') || !/^[a-zA-Z0-9_-]{1,200}$/.test(proof.publicationId || '')) throw new Error('Invalid legacy snapshot lookup identity');
  const base = new URL(environment.SITE_DATA_API_URL || 'http://api:3000/api/v1').href.replace(/\/$/, '');
  const response = await fetch(`${base}/internal/site-publications/${proof.siteSlug}/snapshots/${proof.publicationId}`, {
    headers: { 'x-admin-token': environment.ADMIN_API_TOKEN }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Verified legacy publication snapshot is unavailable');
  return adoptLegacyBaseline({ publicationRoot: root, snapshot: await response.json(), proof });
}

export async function initialServing({ root, environment, options }) {
  const autosave = join(root, 'state', 'caddy', 'autosave.json');
  const saved = await readFile(autosave, 'utf8').catch(missing);
  if (saved !== null) {
    const active = activePublication(JSON.parse(saved));
    if (active) {
      const artifact = await readArtifact(root, active.artifactId);
      if (['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'rendererId', 'catalogDigest', 'manifestDigest'].some(key => artifact[key] !== active[key])) throw new Error('Saved serving state does not match its sealed artifact');
    }
    return { resume: true };
  }
  let artifact = null;
  if (environment.PUBLICATION_BASELINE_ARTIFACT_ID) {
    // The migration coordinator must have verified/sealed the actual old HTML.
    artifact = await readArtifact(root, environment.PUBLICATION_BASELINE_ARTIFACT_ID);
  } else {
    const legacy = await lstat(join(root, 'current')).catch(missing);
    const releases = await readdir(join(root, 'releases')).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
    if (environment.PUBLICATION_BOOTSTRAP_EMPTY !== 'true' || legacy || releases.length) throw new Error('Serving requires a verified baseline; unknown legacy state is not EMPTY');
  }
  await mkdir(join(root, 'state'), { recursive: true });
  const path = join(root, 'state', 'initial-serving.json');
  await writeFile(path, JSON.stringify(createServingConfig(artifact, options)), { mode: 0o600 });
  return { resume: false, path };
}

export async function startPublicationRuntime(environment = process.env) {
  const root = resolve(environment.PUBLICATION_ROOT || '/publication');
  if (root !== '/publication') throw new Error('Runtime PUBLICATION_ROOT must be /publication');
  const token = environment.ADMIN_API_TOKEN;
  if (!token || token.length < 32) throw new Error('Runtime requires a machine token');
  const legacy = await prepareLegacyBaseline(root, environment);
  const options = { apiUpstream: environment.API_UPSTREAM || 'api:3000',
    publicationToken: createHmac('sha256', token).update('serving-publication:v1').digest('hex'), testMode: environment.PUBLIC_TEST_MODE !== 'false',
    legacyAssetsArtifactId: legacy?.artifactId || null };
  const initial = await initialServing({ root, environment: legacy ? { ...environment, PUBLICATION_BASELINE_ARTIFACT_ID: legacy.artifactId } : environment, options });
  const builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl: environment.SITE_DATA_API_URL || 'http://api:3000/api/v1', adminToken: token,
    publicEnv: environment, servingContextDigest: servingOptionsDigest(options) });
  await builder.renderer;
  const activation = new CaddyActivation({ publicationRoot: root, servingOptions: options });
  const verifier = environment.COOLIFY_API_URL && environment.COOLIFY_API_TOKEN && environment.COOLIFY_RESOURCE_UUID
    ? createCodeDeploymentVerifier({ apiUrl: environment.COOLIFY_API_URL, token: environment.COOLIFY_API_TOKEN, resourceId: environment.COOLIFY_RESOURCE_UUID }) : undefined;
  const controller = new PublicationController({ publicationRoot: root, builder, activation, verifyCodeRelease: verifier });
  const automaticCode = new AutomaticCodeRelease({ controller, verifier, expectedCommit: environment.SOURCE_COMMIT });
  controller.automaticCode = automaticCode;
  const child = spawn('caddy', ['run', ...(initial.resume ? ['--resume'] : ['--config', initial.path])], {
    stdio: ['ignore', 'inherit', 'inherit'], env: { PATH: environment.PATH, XDG_CONFIG_HOME: join(root, 'state'), XDG_DATA_HOME: join(root, 'data') },
  });
  let stopped = false; let server; let stopReconciliation;
  const exited = new Promise(resolveExit => {
    child.once('error', error => resolveExit({ error }));
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    stopReconciliation?.();
    if (server) { server.closeAllConnections(); server.close(); }
    child.kill('SIGTERM');
    const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited; clearTimeout(deadline);
  };
  try {
    const ready = async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        try { await activation.current(); return; } catch { await new Promise(done => setTimeout(done, 100)); }
      }
      throw new Error('Caddy did not become ready');
    };
    await Promise.race([ready(), exited.then(() => { throw new Error('Caddy exited before readiness'); })]);
    const { active } = await activation.current();
    if (active) await activation.reconcile(active);
    server = createPublicationServer({ adminToken: token, controller, onError: error => {
      let diagnostic = [error, error.cause].filter(Boolean).map(value => value.stack || value.message || String(value)).join('\n');
      for (const secret of [token, environment.COOLIFY_API_TOKEN].filter(Boolean)) diagnostic = diagnostic.split(secret).join('[redacted]');
      console.error(diagnostic);
    } });
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(8081, '0.0.0.0', accept); });
    console.log('Publication runtime ready; Caddy control API is loopback-only');
    stopReconciliation = automaticCode.start();
    return { controller, stop, exited };
  } catch (error) { await stop(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const runtime = await startPublicationRuntime();
    let stopping = false;
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopping = true; void runtime.stop(); });
    const result = await runtime.exited;
    await runtime.stop();
    if (!stopping) { console.error('Caddy exited; publication runtime is stopping'); process.exitCode = result.code || 1; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rm, lstat, cp, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArtifact, sealArtifact } from './artifact-store.mjs';
import { verifyPublication } from '../verify-publication.mjs';
import { resolvePublicApiUrl, resolvePublicSiteUrl } from '../public-site-url.mjs';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const id = /^[a-zA-Z0-9_-]{1,200}$/;
const publicKeys = ['PUBLIC_SITE_URL', 'PUBLIC_API_URL', 'PUBLIC_SITE_SLUG', 'PUBLIC_YANDEX_METRIKA_ID', 'PUBLIC_CONNECTION_PHONE', 'PUBLIC_SUPPORT_PHONE'];

export class SnapshotUnavailableError extends Error {
  constructor(status) { super(`Exact snapshot unavailable (${status})`); this.httpStatus = status; }
}

async function sourceIdentity(publicEnv, servingContextDigest) {
  const hash = createHash('sha256').update(JSON.stringify({ node: process.version, publicEnv, servingContextDigest }));
  async function visit(path) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('Renderer source cannot contain symlinks');
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(join(path, name));
    } else if (stat.isFile()) {
      hash.update(JSON.stringify([relative(workspace, path).split(sep).join('/'), sha(await readFile(path))]));
    } else throw new Error('Invalid renderer source');
  }
  for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web/package.json', 'apps/web/astro.config.mjs', 'apps/web/src', 'apps/web/public', 'apps/web/scripts', 'apps/api/src', 'scripts', 'deploy/coolify-web.Caddyfile']) await visit(join(workspace, path));
  return hash.digest('hex');
}

function buildAstro(environment, project) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [join(workspace, 'apps/web/node_modules/astro/bin/astro.mjs'), 'build'], {
      cwd: project, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    const collect = chunk => { output = (output + chunk.toString()).slice(-16000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timeout = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); code === 0 ? accept(output) : reject(new Error(`Static Astro build failed (${code}): ${output}`)); });
  });
}

async function validateAssets(directory, artifactId) {
  const prefix = `/__publication_assets/${artifactId}/`;
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /\.(html|css|js)$/.test(entry.name)) {
        const content = await readFile(file, 'utf8');
        for (const match of content.matchAll(/\/__publication_assets\/[a-f0-9]{64}\/[^\s"'<>`)?,;]+/g)) {
          if (!match[0].startsWith(prefix)) throw new Error('Build references a different artifact');
          const assetPath = decodeURIComponent(match[0].slice(prefix.length));
          const target = resolve(directory, assetPath);
          if (!target.startsWith(`${resolve(directory)}${sep}`) || !(await lstat(target)).isFile()) throw new Error('Build references an invalid or missing versioned asset');
        }
      }
    }
  }
  await visit(directory);
}

export class StaticArtifactBuilder {
  constructor({ publicationRoot, apiUrl, adminToken, publicEnv, servingContextDigest = null, fetchImpl = fetch }) {
    if (!adminToken) throw new Error('Builder requires a private API token');
    this.root = resolve(publicationRoot);
    this.apiUrl = new URL(apiUrl).href.replace(/\/$/, '');
    this.adminToken = adminToken; this.fetchImpl = fetchImpl;
    this.publicEnv = Object.fromEntries(publicKeys.map(key => [key, String(publicEnv[key] || '')]));
    this.publicEnv.PUBLIC_SITE_URL = resolvePublicSiteUrl(this.publicEnv);
    this.publicEnv.PUBLIC_API_URL = resolvePublicApiUrl(this.publicEnv);
    if (servingContextDigest !== null && !/^[a-f0-9]{64}$/.test(servingContextDigest)) throw new Error('Invalid serving context digest');
    this.servingContextDigest = servingContextDigest;
    this.renderer = sourceIdentity(this.publicEnv, this.servingContextDigest);
    this.pending = Promise.resolve();
  }

  build(job) {
    const operation = this.pending.then(() => this.buildSerial(job));
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async fetchSnapshot(job) {
    for (const field of ['publicationId', 'siteId', 'rebuildId']) if (!id.test(job[field] || '')) throw new Error(`Invalid ${field}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(job.siteSlug || '') || job.siteSlug !== this.publicEnv.PUBLIC_SITE_SLUG) throw new Error('Invalid snapshot site slug');
    if (!Number.isSafeInteger(job.rebuildRevision) || job.rebuildRevision < 1) throw new Error('Invalid rebuild revision');
    const response = await this.fetchImpl(`${this.apiUrl}/internal/site-publications/${job.siteSlug}/snapshots/${job.publicationId}`, {
      headers: { 'x-admin-token': this.adminToken }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new SnapshotUnavailableError(response.status);
    const snapshot = await response.json();
    if (['publicationId', 'siteId', 'siteSlug'].some(field => snapshot[field] !== job[field])
      || !Number.isSafeInteger(snapshot.siteRevision) || snapshot.siteRevision < 0
      || !snapshot.catalog || snapshot.catalog.site?.slug !== job.siteSlug
      || sha(JSON.stringify(snapshot.catalog)) !== snapshot.catalogDigest) throw new Error('Exact snapshot identity/digest mismatch');
    return snapshot;
  }

  async buildSerial(job) {
    const snapshot = await this.fetchSnapshot(job);
    const rendererId = await this.renderer;
    if (await sourceIdentity(this.publicEnv, this.servingContextDigest) !== rendererId) throw new Error('Released renderer source changed');
    const identity = { publicationId: job.publicationId, siteId: job.siteId, siteSlug: job.siteSlug,
      siteRevision: snapshot.siteRevision, rebuildId: job.rebuildId, rebuildRevision: job.rebuildRevision,
      rendererId, catalogDigest: snapshot.catalogDigest,
      redirects: (snapshot.catalog.redirects || []).map(({ id, sourcePath }) => ({ id, sourcePath })) };
    identity.artifactId = sha(JSON.stringify(identity));
    const existing = await readArtifact(this.root, identity.artifactId).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (existing) return existing;
    const builds = join(this.root, 'builds'); await mkdir(builds, { recursive: true });
    if (!(await lstat(builds)).isDirectory()) throw new Error('Private build directory cannot be a symlink');
    const operationRoot = join(builds, randomUUID()); await mkdir(operationRoot, { mode: 0o700 });
    const output = join(operationRoot, 'public');
    try {
      const snapshotPath = join(operationRoot, 'snapshot.json');
      await writeFile(snapshotPath, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
      // Astro writes prerender/type files inside its project root. Give every build
      // a private copy of the released sources while sharing installed dependencies.
      const projectRoot = join(operationRoot, 'renderer');
      for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web/package.json', 'apps/web/astro.config.mjs', 'apps/web/src', 'apps/web/public', 'apps/web/scripts', 'apps/api/src', 'scripts']) {
        const target = join(projectRoot, path); await mkdir(resolve(target, '..'), { recursive: true });
        await cp(join(workspace, path), target, { recursive: true, errorOnExist: true, force: false });
      }
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      await symlink(join(workspace, 'node_modules'), join(projectRoot, 'node_modules'), linkType);
      await symlink(join(workspace, 'apps/web/node_modules'), join(projectRoot, 'apps/web/node_modules'), linkType);
      const environment = {};
      for (const key of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'SYSTEMROOT', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'LANG']) {
        if (process.env[key]) environment[key] = process.env[key];
      }
      const buildLog = await buildAstro({ ...environment, ...this.publicEnv, ALLOW_DEMO_DATA: 'false', NODE_ENV: 'production',
        ASTRO_TELEMETRY_DISABLED: '1', XDG_CONFIG_HOME: join(operationRoot, 'config'),
        XDG_CACHE_HOME: join(operationRoot, 'cache'), APPDATA: join(operationRoot, 'appdata'),
        PUBLIC_STATIC_ARTIFACT_ID: identity.artifactId, PUBLICATION_BUILD_OUT_DIR: output,
        PUBLICATION_BUILD_CACHE_DIR: join(operationRoot, 'cache'),
        SITE_DATA_SNAPSHOT_FILE: snapshotPath, SITE_DATA_PUBLICATION_ID: job.publicationId }, join(projectRoot, 'apps/web'));
      try { await verifyPublication({ distDirectory: output, publicSiteUrl: this.publicEnv.PUBLIC_SITE_URL, allowDemoData: false, artifactId: identity.artifactId }); }
      catch (error) { throw new Error(`Static publication validation failed: ${error.message}\n${buildLog}`, { cause: error }); }
      await validateAssets(output, identity.artifactId);
      if (await sourceIdentity(this.publicEnv, this.servingContextDigest) !== rendererId) throw new Error('Released renderer changed during build');
      return await sealArtifact({ publicationRoot: this.root, sourceDirectory: output, identity });
    } finally {
      if (resolve(operationRoot, '..') !== resolve(builds)) throw new Error('Unsafe private build cleanup');
      await rm(operationRoot, { recursive: true, force: true });
    }
  }
}

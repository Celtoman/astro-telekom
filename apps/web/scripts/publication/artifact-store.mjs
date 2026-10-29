import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, readdir, open, lstat, rename, link, readFile, rm } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9_-]{1,200}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => Buffer.from(JSON.stringify(value));

export function requireArtifactId(value) {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error('Invalid artifact ID');
  return value;
}

function normalizeIdentity(input) {
  for (const field of ['artifactId', 'rendererId', 'catalogDigest']) requireArtifactId(input[field]);
  for (const field of ['siteId', 'publicationId', 'rebuildId']) {
    if (typeof input[field] !== 'string' || !ID.test(input[field])) throw new Error(`Invalid ${field}`);
  }
  if (!SLUG.test(input.siteSlug || '')) throw new Error('Invalid site slug');
  for (const field of ['siteRevision', 'rebuildRevision']) {
    if (!Number.isSafeInteger(input[field]) || input[field] < (field === 'siteRevision' ? 0 : 1)) throw new Error(`Invalid ${field}`);
  }
  if (!Array.isArray(input.redirects)) throw new Error('Redirect inventory is required');
  const paths = new Set();
  const redirects = input.redirects.map(({ id, sourcePath }) => {
    if (!ID.test(id || '') || !/^\/[a-z0-9._~/-]+$/.test(sourcePath || '')
      || sourcePath.endsWith('/') || sourcePath.includes('//') || sourcePath.split('/').some((part) => part === '.' || part === '..')
      || /^\/(?:api|_astro|__publication_assets)(?:\/|$)/.test(sourcePath) || paths.has(sourcePath)) {
      throw new Error('Invalid redirect inventory');
    }
    paths.add(sourcePath);
    return { id, sourcePath };
  });
  return {
    formatVersion: 1, artifactId: input.artifactId, rendererId: input.rendererId, catalogDigest: input.catalogDigest,
    siteId: input.siteId, siteSlug: input.siteSlug, siteRevision: input.siteRevision,
    publicationId: input.publicationId, rebuildId: input.rebuildId, rebuildRevision: input.rebuildRevision, redirects,
  };
}

async function fileBytes(path) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Artifact contains a non-regular file');
    return await handle.readFile();
  } finally { await handle.close(); }
}

async function inventory(root, directory = root) {
  if (!(await lstat(directory)).isDirectory()) throw new Error('Artifact contains a symbolic directory');
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) throw new Error('Artifact contains a private/hidden path');
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Artifact contains a symbolic link');
    if (entry.isDirectory()) files.push(...await inventory(root, path));
    else if (entry.isFile()) {
      const name = relative(root, path).split(sep).join('/');
      if (name === 'redirects.caddy') continue;
      const data = await fileBytes(path);
      files.push({ path: name, size: data.length, sha256: sha256(data) });
    } else throw new Error('Artifact contains a non-regular path');
  }
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export { inventory as artifactInventory };

async function syncDirectory(directory) {
  // Windows cannot fsync directory handles; production publication runs on Linux.
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory()) throw new Error('Publication directory must not be a symlink');
}

export async function writeImmutableJson(directory, name, value) {
  if (!/^[a-zA-Z0-9_-]+\.json$/.test(name)) throw new Error('Invalid immutable record name');
  await ensureDirectory(directory);
  await syncDirectory(resolve(directory, '..'));
  const target = join(directory, name);
  const data = bytes(value);
  const temporary = join(directory, `.pending-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
  try {
    // An atomic hard-link publishes the complete synced record without replacing a winner.
    try { await link(temporary, target); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await fileBytes(target)).equals(data)) throw new Error('Immutable publication record collision');
    }
    await syncDirectory(directory);
  } finally { await rm(temporary, { force: true }); }
}

export async function readManifest(publicationRoot, artifactId) {
  requireArtifactId(artifactId);
  const root = resolve(publicationRoot);
  const raw = JSON.parse((await fileBytes(join(root, 'manifests', `${artifactId}.json`))).toString('utf8'));
  const { manifestDigest, ...content } = raw;
  if (raw.artifactId !== artifactId || sha256(bytes(content)) !== manifestDigest) throw new Error('Artifact manifest integrity mismatch');
  const identity = normalizeIdentity(raw);
  if (!Array.isArray(raw.files) || !Number.isFinite(Date.parse(raw.sealedAt))) throw new Error('Artifact manifest integrity mismatch');
  const paths = new Set();
  for (const file of raw.files) {
    if (typeof file.path !== 'string' || !file.path || file.path.includes('\\') || file.path.split('/').some(part => !part || part.startsWith('.'))
      || !Number.isSafeInteger(file.size) || file.size < 0 || !HASH.test(file.sha256 || '') || paths.has(file.path)) throw new Error('Artifact manifest inventory mismatch');
    paths.add(file.path);
  }
  return { ...identity, sealedAt: raw.sealedAt, files: raw.files, manifestDigest };
}

export async function readIntegrityRecord(directory, name, digestField = 'recordDigest') {
  const raw = JSON.parse((await fileBytes(join(directory, name))).toString('utf8'));
  const { [digestField]: recordDigest, ...content } = raw;
  if (sha256(bytes(content)) !== recordDigest) throw new Error('Publication record integrity mismatch');
  return raw;
}

export function verifyArtifactReceipt(artifact, receipt) {
  if (receipt.status !== 'SUCCEEDED' || ['artifactId', 'publicationId', 'siteId', 'siteRevision', 'rendererId', 'catalogDigest', 'rebuildId', 'rebuildRevision', 'manifestDigest']
    .some(field => receipt[field] !== artifact[field])) throw new Error('Publication receipt integrity mismatch');
  return receipt;
}

export async function readRetirement(publicationRoot, artifact) {
  const root = resolve(publicationRoot);
  const state = await readIntegrityRecord(join(root, 'gc'), `${artifact.artifactId}.json`).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (!state) return null;
  const archive = await readIntegrityRecord(join(root, 'archives'), `${artifact.artifactId}.json`);
  if (state.artifactId !== artifact.artifactId || state.manifestDigest !== artifact.manifestDigest || state.archiveRecordDigest !== archive.recordDigest
    || archive.artifactId !== artifact.artifactId || archive.manifestDigest !== artifact.manifestDigest || archive.restoreVerified !== true) throw new Error('Archived artifact integrity mismatch');
  verifyArtifactReceipt(artifact, await readReceipt(root, artifact.artifactId));
  const restored = await readIntegrityRecord(join(root, 'gc-restored'), `${artifact.artifactId}.json`).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (restored) {
    if (restored.artifactId !== artifact.artifactId || restored.manifestDigest !== artifact.manifestDigest
      || restored.gcRecordDigest !== state.recordDigest) throw new Error('Restored artifact integrity mismatch');
    return null;
  }
  return state;
}

export async function readArtifact(publicationRoot, artifactId) {
  const artifact = await readManifest(publicationRoot, artifactId);
  if (await readRetirement(publicationRoot, artifact)) throw Object.assign(new Error('Artifact is archived; restore the complete sealed tree before activation'), { code: 'ARTIFACT_ARCHIVED' });
  if (JSON.stringify(await inventory(join(resolve(publicationRoot), 'releases', artifactId))) !== JSON.stringify(artifact.files)) {
    throw new Error('Artifact file digest/integrity mismatch');
  }
  return artifact;
}

// Only terminal historical operations may use metadata after HTML reclamation.
// Activation, baseline and builder reuse always require readArtifact().
export async function readHistoricalArtifact(publicationRoot, artifactId) {
  const artifact = await readManifest(publicationRoot, artifactId);
  return await readRetirement(publicationRoot, artifact) ? artifact : readArtifact(publicationRoot, artifactId);
}

export async function sealArtifact({ publicationRoot, sourceDirectory, identity: rawIdentity }) {
  const identity = normalizeIdentity(rawIdentity);
  const root = resolve(publicationRoot);
  const source = resolve(sourceDirectory);
  if (!(await lstat(source)).isDirectory()) throw new Error('Artifact source must not be a symbolic link');
  const files = await inventory(source);
  if (!files.some((file) => file.path === 'index.html') || !files.some((file) => file.path === '404.html')) throw new Error('Incomplete static artifact');
  const existing = await readArtifact(root, identity.artifactId).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
  if (existing) {
    const expected = { ...identity, sealedAt: existing.sealedAt, files };
    if (sha256(bytes(expected)) !== existing.manifestDigest) throw new Error('Immutable artifact collision');
    return existing;
  }
  const releases = join(root, 'releases'); const staging = join(root, 'staging');
  await ensureDirectory(releases); await ensureDirectory(staging);
  await syncDirectory(root);
  const targetDirectory = join(releases, identity.artifactId);
  const orphan = await lstat(targetDirectory).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
  if (orphan) {
    // A crash after the public tree rename but before manifest publication is recoverable.
    if (!orphan.isDirectory() || JSON.stringify(await inventory(targetDirectory)) !== JSON.stringify(files)) throw new Error('Immutable artifact collision');
    const content = { ...identity, sealedAt: new Date().toISOString(), files };
    await writeImmutableJson(join(root, 'manifests'), `${identity.artifactId}.json`, { ...content, manifestDigest: sha256(bytes(content)) });
    return readArtifact(root, identity.artifactId);
  }
  const temporary = join(staging, randomUUID()); await mkdir(temporary);
  try {
    for (const file of files) {
      const target = join(temporary, ...file.path.split('/'));
      await mkdir(resolve(target, '..'), { recursive: true });
      const data = await fileBytes(join(source, ...file.path.split('/')));
      if (sha256(data) !== file.sha256) throw new Error('Build artifact changed during sealing');
      const handle = await open(target, 'wx', 0o644);
      try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    }
    const directories = new Set();
    for (const file of files) {
      let directory = resolve(join(temporary, ...file.path.split('/')), '..');
      while (directory !== temporary) { directories.add(directory); directory = resolve(directory, '..'); }
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) await syncDirectory(directory);
    await syncDirectory(temporary);
    await rename(temporary, targetDirectory); await syncDirectory(releases);
    const content = { ...identity, sealedAt: new Date().toISOString(), files };
    const manifest = { ...content, manifestDigest: sha256(bytes(content)) };
    await writeImmutableJson(join(root, 'manifests'), `${identity.artifactId}.json`, manifest);
    return await readArtifact(root, identity.artifactId);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function readReceipt(publicationRoot, artifactId) {
  requireArtifactId(artifactId);
  return JSON.parse(await readFile(join(resolve(publicationRoot), 'receipts', `${artifactId}.json`), 'utf8'));
}

export async function recordReceipt(publicationRoot, artifact) {
  requireArtifactId(artifact.artifactId);
  const receipt = {
    status: 'SUCCEEDED', artifactId: artifact.artifactId, publicationId: artifact.publicationId,
    siteId: artifact.siteId, siteRevision: artifact.siteRevision, rendererId: artifact.rendererId, catalogDigest: artifact.catalogDigest,
    rebuildId: artifact.rebuildId, rebuildRevision: artifact.rebuildRevision, manifestDigest: artifact.manifestDigest,
  };
  await writeImmutableJson(join(resolve(publicationRoot), 'receipts'), `${artifact.artifactId}.json`, receipt);
  return receipt;
}

import { createHash } from 'node:crypto';
import { readdir, readFile, lstat, unlink, rmdir, realpath, mkdir, copyFile, chmod, open, link } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { artifactInventory, readManifest, readArtifact, readReceipt, readIntegrityRecord, readRetirement, verifyArtifactReceipt, requireArtifactId, writeImmutableJson } from './artifact-store.mjs';

const DAY = 86400000;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const missing = error => { if (error.code !== 'ENOENT') throw error; return null; };
async function records(root, name) {
  const directory = join(root, name);
  const st = await lstat(directory).catch(missing);
  if (!st) return [];
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe publication metadata directory');
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^\.pending-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(entry.name)) continue;
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) throw new Error('Unknown publication metadata record');
    result.push(JSON.parse(await readFile(join(directory, entry.name), 'utf8')));
  }
  return result;
}
function archiveProof(input, now) {
  const fields = ['artifactId', 'manifestDigest', 'storageId', 'objectKey', 'archiveSha256', 'archiveBytes', 'verifiedAt', 'retainUntil', 'restoreVerified'];
  if (!input || Object.keys(input).some(key => !fields.includes(key))) throw new Error('Invalid archive evidence');
  for (const field of ['artifactId', 'manifestDigest', 'archiveSha256']) if (!/^[a-f0-9]{64}$/.test(input[field] || '')) throw new Error('Invalid archive evidence digest');
  if (!Number.isSafeInteger(input.storageId) || input.storageId < 1 || !Number.isSafeInteger(input.archiveBytes) || input.archiveBytes < 1
    || input.objectKey !== `astro-telekom/publications/${input.artifactId}/${input.manifestDigest}.tar.gz`
    || input.restoreVerified !== true || !Number.isFinite(Date.parse(input.verifiedAt)) || Date.parse(input.verifiedAt) > +now + 300000
    || !Number.isFinite(Date.parse(input.retainUntil)) || Date.parse(input.retainUntil) <= +now
    || Date.parse(input.retainUntil) < Date.parse(input.verifiedAt) + 90 * DAY) throw new Error('Invalid restored off-server archive evidence');
  return Object.fromEntries(fields.map(key => [key, input[key]]));
}
export async function acknowledgeArchive(root, proof, now = new Date()) {
  const content = archiveProof(proof, now);
  const artifact = await readManifest(root, content.artifactId);
  if (artifact.manifestDigest !== content.manifestDigest) throw new Error('Archive manifest mismatch');
  verifyArtifactReceipt(artifact, await readReceipt(root, artifact.artifactId));
  const existing = await readIntegrityRecord(join(root, 'archives'), `${artifact.artifactId}.json`).catch(missing);
  if (existing) {
    if (fieldsMismatch(existing, content, ['artifactId', 'manifestDigest', 'storageId', 'objectKey', 'archiveSha256', 'archiveBytes'])) throw new Error('Archive immutable identity mismatch');
  } else {
    await readArtifact(root, artifact.artifactId);
    await writeImmutableJson(join(root, 'archives'), `${artifact.artifactId}.json`, { ...content, recordDigest: sha(content) });
  }
  const record = { ...content, recordDigest: sha(content) };
  await writeImmutableJson(join(root, 'archive-verifications', artifact.artifactId), `${record.recordDigest}.json`, record);
  return existing || record;
}
async function verifiedArchive(root, artifactId, now) {
  const original = await readIntegrityRecord(join(root, 'archives'), `${artifactId}.json`).catch(missing);
  if (!original) throw new Error('A restored off-server archive is required before GC');
  const checks = [original, ...await records(root, 'archive-verifications/' + artifactId)];
  for (const record of checks) {
    const { recordDigest, ...content } = record;
    if (sha(content) !== recordDigest || fieldsMismatch(record, original, ['artifactId', 'manifestDigest', 'storageId', 'objectKey', 'archiveSha256', 'archiveBytes'])) throw new Error('Archive verification integrity mismatch');
    archiveProof(content, new Date(content.verifiedAt));
  }
  checks.sort((a, b) => Date.parse(b.verifiedAt) - Date.parse(a.verifiedAt));
  const { recordDigest: verificationDigest, ...proof } = checks[0];
  archiveProof(proof, now);
  return { original, verificationDigest };
}
function fieldsMismatch(left, right, fields) { return fields.some(key => left[key] !== right[key]); }
function servingRoots(value, output = new Set()) {
  if (typeof value === 'string' && value.startsWith('/publication/releases/')) {
    const id = value.slice('/publication/releases/'.length);
    requireArtifactId(id); output.add(id);
  } else if (value && typeof value === 'object') for (const child of Object.values(value)) servingRoots(child, output);
  return output;
}
async function allocatedInventory(root) {
  const files = new Map(); let allocatedBytes = 0; let pending = [root];
  while (pending.length) {
    const path = pending.pop(); const st = await lstat(path);
    if ((!st.isDirectory() && !st.isFile() && !st.isSymbolicLink()) || (path === root && st.isSymbolicLink())) throw new Error('Unsafe symbolic publication path');
    // Windows lacks allocated blocks; round conservatively there, including directories.
    const allocated = st.blocks > 0 ? st.blocks * 512 : Math.max(4096, Math.ceil(st.size / 4096) * 4096);
    allocatedBytes += allocated;
    // The retained legacy current link is metadata, never an instruction to traverse.
    // Candidate HTML still passes the strict ownedFile/readArtifact symlink guards.
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) for (const name of await readdir(path)) pending.push(join(path, name));
    else files.set(path, allocated);
  }
  return { allocatedBytes, files };
}
export async function planRetention({ root, serving, now = new Date(), budgetBytes = 8 * 1024 ** 3 }) {
  if (!Number.isFinite(+now) || !Number.isSafeInteger(budgetBytes) || budgetBytes < 1 || !serving?.active) throw new Error('Serving state and valid budget are required for retention');
  requireArtifactId(serving.active.artifactId);
  const manifests = await records(root, 'manifests');
  const artifacts = await Promise.all(manifests.map(m => readManifest(root, m.artifactId)));
  const byId = new Map(artifacts.map(a => [a.artifactId, a]));
  const protectedIds = new Map();
  const protect = (id, reason) => {
    requireArtifactId(id);
    if (!byId.has(id)) throw new Error('Protected artifact has no sealed manifest');
    protectedIds.set(id, [...new Set([...(protectedIds.get(id) || []), reason])]);
  };
  protect(serving.active.artifactId, 'active');
  for (const id of servingRoots(serving.config)) protect(id, 'serving');
  const baseline = await readIntegrityRecord(join(root, 'baselines'), 'legacy.json').catch(missing);
  if (baseline) protect(baseline.artifactId, 'baseline');
  const successful = [];
  for (const a of artifacts) {
    const receipt = await readReceipt(root, a.artifactId).catch(missing);
    if (receipt) { verifyArtifactReceipt(a, receipt); successful.push(a); }
    else protect(a.artifactId, 'unconfirmed');
    if (Date.parse(a.sealedAt) > +now + 300000) protect(a.artifactId, 'clock-uncertain');
  }
  successful.sort((a, b) => b.sealedAt.localeCompare(a.sealedAt) || a.artifactId.localeCompare(b.artifactId));
  for (const a of successful.filter(a => a.artifactId !== serving.active.artifactId).slice(0, 2)) protect(a.artifactId, 'rollback');
  for (const name of ['operations', 'code-operations']) for (const record of await records(root, name)) {
    const { operationDigest, ...content } = record;
    if (operationDigest !== sha(content)) throw new Error('Publication intent integrity mismatch');
    const artifact = byId.get(record.artifactId);
    if (!artifact || fieldsMismatch(artifact, record.job || {}, ['publicationId', 'siteId', 'siteSlug', 'rebuildId', 'rebuildRevision'])) throw new Error('Publication intent identity mismatch');
    if (!(await readReceipt(root, artifact.artifactId).catch(missing))) {
      protect(record.artifactId, 'unresolved');
      protect(record.expectedActiveArtifactId, 'unresolved-previous');
    }
  }
  const eligible = [];
  const inventory = await allocatedInventory(root);
  for (const a of artifacts) {
    const retired = await readRetirement(root, a);
    const restored = await readIntegrityRecord(join(root, 'gc-restored'), `${a.artifactId}.json`).catch(missing);
    if (restored) protect(a.artifactId, 'restored');
    if (retired && protectedIds.has(a.artifactId)) throw new Error('Protected artifact was archived');
    const deleted = await readIntegrityRecord(join(root, 'gc-deleted'), `${a.artifactId}.json`).catch(missing);
    if (deleted && ((!retired && !restored) || deleted.manifestDigest !== a.manifestDigest)) throw new Error('GC completion integrity mismatch');
    if (protectedIds.has(a.artifactId) || deleted) continue;
    const htmlAllocatedBytes = a.files.filter(f => f.path.endsWith('.html'))
      .reduce((sum, f) => sum + (inventory.files.get(join(root, 'releases', a.artifactId, f.path)) || 0), 0);
    eligible.push({ artifactId: a.artifactId, manifestDigest: a.manifestDigest, sealedAt: a.sealedAt,
      htmlAllocatedBytes,
      htmlBytes: a.files.filter(f => f.path.endsWith('.html')).reduce((s, f) => s + f.size, 0),
      archive: await readIntegrityRecord(join(root, 'archives'), `${a.artifactId}.json`).catch(missing), resuming: !!retired });
  }
  // Account for all retained assets, metadata, directory overhead and mandatory HTML.
  // Empty directories may later disappear, but never assume that saving before GC.
  const requiredBytes = inventory.allocatedBytes - eligible.reduce((sum, a) => sum + a.htmlAllocatedBytes, 0);
  let projectedBytes = requiredBytes; let additional = 0;
  for (const a of [...eligible].sort((a, b) => b.sealedAt.localeCompare(a.sealedAt) || a.artifactId.localeCompare(b.artifactId))) {
    if (a.resuming || Date.parse(a.sealedAt) < +now - DAY || additional === 2) continue;
    if (projectedBytes + a.htmlAllocatedBytes > budgetBytes) continue;
    protect(a.artifactId, 'recent'); projectedBytes += a.htmlAllocatedBytes; additional++;
  }
  const candidates = eligible.filter(a => !protectedIds.has(a.artifactId));
  return { activeArtifactId: serving.active.artifactId, candidates: candidates.sort((a, b) => a.sealedAt.localeCompare(b.sealedAt)),
    policy: { budgetBytes, recentHours: 24, maxAdditionalVersions: 2 },
    usage: { allocatedBytes: inventory.allocatedBytes, requiredBytes, projectedBytes, mandatoryOverBudget: requiredBytes > budgetBytes },
    protected: [...protectedIds].map(([artifactId, reasons]) => ({ artifactId, reasons })) };
}
async function ownedFile(root, artifactId, path) {
  const releaseRoot = resolve(root, 'releases');
  const artifactRoot = join(releaseRoot, requireArtifactId(artifactId));
  if (await realpath(releaseRoot) !== releaseRoot) throw new Error('Unsafe releases directory');
  const artifactStat = await lstat(artifactRoot);
  if (!artifactStat.isDirectory() || artifactStat.isSymbolicLink()) throw new Error('Unsafe artifact directory');
  const pieces = path.split('/');
  if (pieces.some(p => !p || p.startsWith('.') || p.includes('\\'))) throw new Error('Unsafe artifact file path');
  let current = artifactRoot;
  for (let i = 0; i < pieces.length - 1; i++) {
    current = join(current, pieces[i]);
    const st = await lstat(current).catch(missing);
    if (!st) return null;
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe artifact directory');
  }
  const target = resolve(artifactRoot, path);
  if (!target.startsWith(artifactRoot + sep)) throw new Error('Unsafe artifact file path');
  const st = await lstat(target).catch(missing);
  if (!st) return null;
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('Unsafe artifact file');
  return target;
}
export async function collectArtifact({ root, servingReader, artifactId, now = new Date(), afterDelete = async () => {} }) {
  requireArtifactId(artifactId);
  const artifact = await readManifest(root, artifactId);
  const plan = await planRetention({ root, serving: await servingReader(), now });
  if (plan.protected.some(p => p.artifactId === artifactId)) throw new Error('Artifact is protected from GC');
  const completed = await readIntegrityRecord(join(root, 'gc-deleted'), `${artifactId}.json`).catch(missing);
  if (completed) return { status: 'DELETED', artifactId, deletedFiles: completed.deletedFiles };
  if (!plan.candidates.some(a => a.artifactId === artifactId)) throw new Error('Artifact is not eligible for GC');
  const { original: archive, verificationDigest } = await verifiedArchive(root, artifactId, now);
  const { recordDigest } = archive;
  if (archive.manifestDigest !== artifact.manifestDigest) throw new Error('Archive manifest mismatch');
  verifyArtifactReceipt(artifact, await readReceipt(root, artifactId));
  let marker = await readRetirement(root, artifact);
  if (!marker) {
    await readArtifact(root, artifactId);
    const content = { artifactId, manifestDigest: artifact.manifestDigest, archiveRecordDigest: recordDigest, archiveVerificationDigest: verificationDigest, createdAt: now.toISOString() };
    marker = { ...content, recordDigest: sha(content) };
    await writeImmutableJson(join(root, 'gc'), `${artifactId}.json`, marker);
  }
  const html = artifact.files.filter(f => f.path.endsWith('.html'));
  const parents = new Set();
  for (const file of html) {
    const target = await ownedFile(root, artifactId, file.path);
    if (target) { await unlink(target); await afterDelete(file.path); }
    const parts = file.path.split('/'); parts.pop();
    while (parts.length) { parents.add(parts.join('/')); parts.pop(); }
  }
  // Only empty directories inside this exact artifact; assets are never unlinked.
  for (const relative of [...parents].sort((a, b) => b.length - a.length)) {
    const probe = await ownedFile(root, artifactId, relative + '/__gc_nonexistent_probe');
    if (probe) throw new Error('Unexpected GC probe file');
    await rmdir(join(root, 'releases', artifactId, relative)).catch(error => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
    });
  }
  for (const relative of [...parents].sort((a, b) => b.length - a.length)) {
    await syncDirectory(join(root, 'releases', artifactId, relative)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  await syncDirectory(join(root, 'releases', artifactId));
  const content = { artifactId, manifestDigest: artifact.manifestDigest, gcRecordDigest: marker.recordDigest,
    deletedFiles: html.length, logicalBytes: html.reduce((sum, f) => sum + f.size, 0), completedAt: now.toISOString() };
  await writeImmutableJson(join(root, 'gc-deleted'), `${artifactId}.json`, { ...content, recordDigest: sha(content) });
  return { status: 'DELETED', ...content };
}

// Operator stages a downloaded, restore-verified archive in private restores/<id>.
// The controller calls this under the same serial queue as GC and activation.
async function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function restoreArtifact({ root, artifactId, now = new Date(), afterRestoreFile = async () => {} }) {
  requireArtifactId(artifactId);
  const artifact = await readManifest(root, artifactId);
  let marker = await readRetirement(root, artifact);
  const savedRestore = await readIntegrityRecord(join(root, 'gc-restored'), `${artifactId}.json`).catch(missing);
  if (!marker) {
    if (!savedRestore || savedRestore.artifactId !== artifactId || savedRestore.manifestDigest !== artifact.manifestDigest) throw new Error('Artifact is not archived');
    try { await readArtifact(root, artifactId); return { status: 'RESTORED', artifactId }; }
    catch { marker = await readIntegrityRecord(join(root, 'gc'), `${artifactId}.json`); }
  }
  const parent = resolve(root, 'restores');
  const source = join(parent, artifactId);
  if (await realpath(parent) !== parent || await realpath(source) !== source) throw new Error('Unsafe restore staging directory');
  if (JSON.stringify(await artifactInventory(source)) !== JSON.stringify(artifact.files)) throw new Error('Restore inventory integrity mismatch');
  const release = join(resolve(root, 'releases'), artifactId);
  const expected = new Map(artifact.files.map(file => [file.path, file]));
  for (const file of await artifactInventory(release)) {
    if (JSON.stringify(file) !== JSON.stringify(expected.get(file.path))) throw new Error('Existing artifact integrity mismatch');
  }
  const pendingBase = join(resolve(root), 'restore-pending');
  const pending = join(pendingBase, artifactId);
  for (const directory of [pendingBase, pending]) {
    await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const st = await lstat(directory);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe restore pending directory');
  }
  const directories = new Set([release]);
  for (const file of artifact.files) {
    const target = join(release, ...file.path.split('/'));
    await mkdir(resolve(target, '..'), { recursive: true });
    const existing = await ownedFile(root, artifactId, file.path);
    if (!existing) {
      const temporary = join(pending, sha(file.path));
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await copyFile(join(source, ...file.path.split('/')), temporary, constants.COPYFILE_EXCL);
      await chmod(temporary, 0o644);
      const handle = await open(temporary, 'r+');
      try { await handle.sync(); } finally { await handle.close(); }
      await link(temporary, target);
      await unlink(temporary);
    } else {
      const handle = await open(target, constants.O_RDWR | (constants.O_NOFOLLOW || 0));
      try { await handle.sync(); } finally { await handle.close(); }
    }
    let parentPath = resolve(target, '..');
    while (parentPath.startsWith(release + sep)) { directories.add(parentPath); parentPath = resolve(parentPath, '..'); }
    await afterRestoreFile(file.path);
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) await syncDirectory(directory);
  await syncDirectory(pending);
  if (JSON.stringify(await artifactInventory(release)) !== JSON.stringify(artifact.files)) throw new Error('Restored artifact integrity mismatch');
  const content = { artifactId, manifestDigest: artifact.manifestDigest, gcRecordDigest: marker.recordDigest, restoredAt: now.toISOString() };
  if (!savedRestore) await writeImmutableJson(join(root, 'gc-restored'), `${artifactId}.json`, { ...content, recordDigest: sha(content) });
  await readArtifact(root, artifactId);
  return { status: 'RESTORED', artifactId };
}

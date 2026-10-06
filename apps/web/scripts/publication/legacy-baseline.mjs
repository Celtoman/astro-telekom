import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { artifactInventory, readArtifact, sealArtifact, writeImmutableJson } from './artifact-store.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hash = /^[a-f0-9]{64}$/;
const id = /^[a-zA-Z0-9_-]{1,200}$/;
export function htmlInventoryDigest(files) {
  return sha(files.filter(file => file.path.endsWith('.html')).map(({ path, size, sha256 }) => ({ path, size, sha256 }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function validateProof(proof, snapshot) {
  const keys = ['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'catalogDigest', 'htmlDigest', 'codeCommit', 'deploymentId'];
  if (!proof || Object.keys(proof).some(key => !keys.includes(key))) throw new Error('Unsupported legacy proof fields');
  for (const key of ['publicationId', 'siteId', 'deploymentId']) if (!id.test(proof?.[key] || '')) throw new Error('Invalid legacy proof identity');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proof.siteSlug || '') || !/^[a-f0-9]{40}$/.test(proof.codeCommit || '')
    || !hash.test(proof.catalogDigest || '') || !hash.test(proof.htmlDigest || '') || !Number.isSafeInteger(proof.siteRevision) || proof.siteRevision < 0) throw new Error('Invalid legacy proof');
  if (['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'catalogDigest'].some(key => snapshot[key] !== proof[key])
    || snapshot.catalog?.site?.slug !== proof.siteSlug || sha(snapshot.catalog) !== proof.catalogDigest) throw new Error('Legacy proof does not match the exact publication snapshot');
}

export async function readLegacyBaseline(publicationRoot) {
  const record = await readFile(join(publicationRoot, 'baselines', 'legacy.json'), 'utf8').then(JSON.parse)
    .catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (!record) return null;
  const { recordDigest, ...content } = record;
  if (sha(content) !== recordDigest) throw new Error('Legacy baseline record integrity mismatch');
  const artifact = await readArtifact(publicationRoot, record.artifactId);
  if (['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'catalogDigest'].some(key => artifact[key] !== record.proof[key])
    || htmlInventoryDigest(artifact.files) !== record.proof.htmlDigest) throw new Error('Legacy baseline manifest/proof mismatch');
  return artifact;
}

export async function adoptLegacyBaseline({ publicationRoot, snapshot, proof }) {
  validateProof(proof, snapshot);
  const existing = await readLegacyBaseline(publicationRoot);
  if (existing) {
    if (['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'catalogDigest'].some(key => existing[key] !== proof[key])
      || htmlInventoryDigest(existing.files) !== proof.htmlDigest) throw new Error('A different legacy baseline has already been adopted');
    return existing;
  }
  const root = await realpath(publicationRoot);
  const source = await realpath(join(root, 'current'));
  if (!source.startsWith(`${resolve(root, 'releases')}${sep}`) || !(await lstat(source)).isDirectory()) throw new Error('Legacy current must resolve inside the owned releases directory');
  const files = await artifactInventory(source);
  if (htmlInventoryDigest(files) !== proof.htmlDigest) throw new Error('Legacy HTML changed since the verified external preflight');
  const paths = snapshot.catalog.routes.map(route => route.path === '/' ? 'index.html' : `${route.path.slice(1)}/index.html`).concat('404.html').sort();
  if (JSON.stringify(files.filter(file => file.path.endsWith('.html')).map(file => file.path).sort()) !== JSON.stringify(paths)) throw new Error('Legacy HTML inventory does not match the publication routes');
  const identity = { publicationId: proof.publicationId, siteId: proof.siteId, siteSlug: proof.siteSlug, siteRevision: proof.siteRevision,
    catalogDigest: proof.catalogDigest, rendererId: sha({ kind: 'verified-legacy-renderer', codeCommit: proof.codeCommit, files }),
    rebuildId: `legacy-${proof.publicationId}`, rebuildRevision: 1,
    redirects: (snapshot.catalog.redirects || []).map(({ id, sourcePath }) => ({ id, sourcePath })) };
  identity.artifactId = sha({ ...identity, files });
  const artifact = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity });
  if (htmlInventoryDigest(artifact.files) !== proof.htmlDigest) throw new Error('Sealed legacy HTML does not match its external proof');
  const content = { artifactId: artifact.artifactId, proof };
  await writeImmutableJson(join(root, 'baselines'), 'legacy.json', { ...content, recordDigest: sha(content) });
  return artifact;
}

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StaticArtifactBuilder } from '../apps/web/scripts/publication/static-builder.mjs';
import { htmlInventoryDigest } from '../apps/web/scripts/publication/legacy-baseline.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const catalogDigest = value => sha(JSON.stringify(value));
const snapshotKeys = ['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'catalogDigest'];

// The public controller omits diagnostics. Its response cannot stand in for
// the immutable SQL snapshot used by the runtime's migration proof.
export function bindMigrationSnapshot({ publication, snapshot, publicCatalog }) {
  for (const key of ['publicationId', 'siteId', 'siteSlug', 'siteRevision']) {
    if (snapshot?.[key] !== publication?.[key]) throw new Error('Migration snapshot identity mismatch');
  }
  if (!snapshot.catalog || snapshot.catalog.site?.slug !== publication.siteSlug
    || snapshot.catalogDigest !== catalogDigest(snapshot.catalog)) throw new Error('Migration snapshot digest mismatch');
  const { variableUsages: _usages, variableSources: _sources, variableWarnings: _warnings, seoWarnings: _seoWarnings, variableUsageVersion: _version, ...projection } = snapshot.catalog;
  if (catalogDigest(projection) !== catalogDigest(publicCatalog)) throw new Error('Public catalog differs from the exact migration snapshot');
  return { snapshot, publicCatalogDigest: catalogDigest(publicCatalog) };
}
const decode = value => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[name]);
const text = value => decode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}

// Compare rendered content, SEO and destinations independently from generated
// asset hashes and Astro scopes. Actual legacy bytes are fingerprinted separately.
export function migrationHtmlContract(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (body === undefined) throw new Error('Migration HTML lacks a body');
  const visible = body.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  return {
    title: text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''),
    description: meta.find(item => item.name === 'description')?.content || '',
    canonical: links.find(item => item.rel === 'canonical')?.href || '',
    robots: meta.find(item => item.name === 'robots')?.content || '',
    h1: [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => text(match[1])),
    text: text(visible),
    destinations: [...visible.matchAll(/<a\b[^>]*>/gi)].map(match => attributes(match[0]).href).filter(Boolean),
  };
}

export async function verifyLegacyMigration({ snapshot, publicationRoot, publicEnv, origin, headers, readState, onProgress = () => {}, fetchImpl = fetch }) {
  const before = await readState();
  if (snapshot.catalogDigest !== catalogDigest(snapshot.catalog) || snapshotKeys.some(key => before[key] !== snapshot[key])) {
    throw new Error('Migration state must identify the full immutable snapshot');
  }
  const builder = new StaticArtifactBuilder({ publicationRoot, apiUrl: 'http://verified-snapshot.invalid/api/v1', adminToken: 'preflight-fixture-only', publicEnv,
    fetchImpl: async () => ({ ok: true, json: async () => structuredClone(snapshot) }) });
  onProgress({ stage: 'build', routes: snapshot.catalog.routes.length });
  const artifact = await builder.build({ publicationId: snapshot.publicationId, siteId: snapshot.siteId, siteSlug: snapshot.siteSlug, rebuildId: `preflight-${snapshot.publicationId}`, rebuildRevision: 1 });
  const routes = snapshot.catalog.routes.map(route => ({ path: route.path, file: route.path === '/' ? 'index.html' : `${route.path.slice(1)}/index.html`, status: 200 }));
  routes.push({ path: `/__migration_unknown_${snapshot.publicationId}`, file: '404.html', status: 404 });
  const files = []; const mismatches = []; let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < routes.length) {
      const route = routes[next++];
      const response = await fetchImpl(`${origin}${route.path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (response.status !== route.status) throw new Error(`Migration route ${route.path} returned ${response.status}`);
      if (!response.headers.get('content-type')?.includes('text/html')) throw new Error(`Migration route ${route.path} is not HTML`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const candidate = await readFile(join(publicationRoot, 'releases', artifact.artifactId, route.file), 'utf8');
      const actualContract = migrationHtmlContract(bytes.toString('utf8'));
      const expectedContract = migrationHtmlContract(candidate);
      if (JSON.stringify(actualContract) !== JSON.stringify(expectedContract)) mismatches.push({ path: route.path,
        fields: Object.keys(expectedContract).filter(key => JSON.stringify(actualContract[key]) !== JSON.stringify(expectedContract[key])) });
      files.push({ path: route.file, size: bytes.length, sha256: sha(bytes) });
      onProgress({ stage: 'read', completed: files.length, total: routes.length });
    }
  }));
  if (mismatches.length) throw new Error(`Legacy HTML differs from the published snapshot: ${JSON.stringify(mismatches.slice(0, 10))} (${mismatches.length} routes)`);
  const after = await readState();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Publication/provider state changed during migration preflight');
  const htmlDigest = htmlInventoryDigest(files);
  const proof = Object.fromEntries(snapshotKeys.map(key => [key, snapshot[key]]));
  Object.assign(proof, { htmlDigest, codeCommit: before.codeCommit, deploymentId: before.deploymentId });
  return { checkedAt: new Date().toISOString(), state: before, proof, routes: routes.length, htmlDigest, artifactId: artifact.artifactId,
    files: files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
}

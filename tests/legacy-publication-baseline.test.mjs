import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { artifactInventory } from '../apps/web/scripts/publication/artifact-store.mjs';
import { adoptLegacyBaseline, readLegacyBaseline, htmlInventoryDigest } from '../apps/web/scripts/publication/legacy-baseline.mjs';

test('legacy adoption preserves actual HTML/assets and binds exact publication/proof without trusting working state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacy-publication-'));
  try {
    const source = join(root, 'releases', 'old'); await mkdir(source, { recursive: true });
    await writeFile(join(source, 'index.html'), '<h1>Actual old HTML</h1>'); await writeFile(join(source, '404.html'), 'Old 404');
    await writeFile(join(source, 'old.js'), 'Old client'); await writeFile(join(source, 'redirects.caddy'), 'Private legacy redirects');
    await symlink(source, join(root, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
    const catalog = { site: { slug: 'domru-site' }, routes: [{ path: '/' }], redirects: [] };
    const digest = createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
    const snapshot = { publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7, catalogDigest: digest, catalog };
    const { catalog: _catalog, ...identity } = snapshot;
    const proof = { ...identity, codeCommit: 'c'.repeat(40), deploymentId: 'deployment-old', htmlDigest: htmlInventoryDigest(await artifactInventory(source)) };
    await assert.rejects(adoptLegacyBaseline({ publicationRoot: root, snapshot, proof: { ...proof, publicationId: 'working-b' } }), /exact publication/);
    await assert.rejects(adoptLegacyBaseline({ publicationRoot: root, snapshot, proof: { ...proof, htmlDigest: '0'.repeat(64) } }), /HTML changed/);
    const artifact = await adoptLegacyBaseline({ publicationRoot: root, snapshot, proof });
    assert.equal(artifact.siteRevision, 7); assert.equal(artifact.catalogDigest, digest);
    assert.equal(await readFile(join(root, 'releases', artifact.artifactId, 'index.html'), 'utf8'), '<h1>Actual old HTML</h1>');
    assert.equal(await readFile(join(root, 'releases', artifact.artifactId, 'old.js'), 'utf8'), 'Old client');
    assert.ok(!artifact.files.some(file => file.path.endsWith('.caddy')));
    assert.deepEqual(await readLegacyBaseline(root), artifact);
    assert.deepEqual(await adoptLegacyBaseline({ publicationRoot: root, snapshot, proof }), artifact);
    await writeFile(join(root, 'baselines', 'legacy.json'), '{}');
    await assert.rejects(readLegacyBaseline(root), /integrity/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('legacy adoption rejects HTML outside the published route inventory and current outside owned releases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacy-publication-'));
  const outside = await mkdtemp(join(tmpdir(), 'legacy-outside-'));
  try {
    await writeFile(join(outside, 'index.html'), 'Unknown'); await writeFile(join(outside, '404.html'), '404');
    await symlink(outside, join(root, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
    const catalog = { site: { slug: 'domru-site' }, routes: [{ path: '/' }], redirects: [] };
    const snapshot = { publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7,
      catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), catalog };
    const { catalog: _catalog, ...identity } = snapshot;
    const proof = { ...identity, codeCommit: 'c'.repeat(40), deploymentId: 'deployment-old', htmlDigest: htmlInventoryDigest(await artifactInventory(outside)) };
    await assert.rejects(adoptLegacyBaseline({ publicationRoot: root, snapshot, proof }), /owned releases/);
    await rm(join(root, 'current')); const source = join(root, 'releases', 'old'); await mkdir(source, { recursive: true });
    await writeFile(join(source, 'index.html'), 'Unknown'); await writeFile(join(source, '404.html'), '404'); await writeFile(join(source, 'extra.html'), 'Unexpected route');
    await symlink(source, join(root, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
    proof.htmlDigest = htmlInventoryDigest(await artifactInventory(source));
    await assert.rejects(adoptLegacyBaseline({ publicationRoot: root, snapshot, proof }), /route/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

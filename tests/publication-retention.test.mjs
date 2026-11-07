import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat, cp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sealArtifact, recordReceipt, readArtifact, writeImmutableJson } from '../apps/web/scripts/publication/artifact-store.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = new Date('2026-10-29T14:00:00Z');
async function fixture(t, count = 6) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'publication-retention-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = [];
  for (let index = 1; index <= count; index++) {
    const source = join(root, 'fixture-source'); await mkdir(source, { recursive: true });
    await writeFile(join(source, 'index.html'), 'Home ' + index);
    await writeFile(join(source, '404.html'), 'Not found ' + index);
    await writeFile(join(source, 'style.css'), '.old{color:red}');
    let a = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: {
      artifactId: index.toString(16).padStart(64, '0'), rendererId: 'a'.repeat(64), catalogDigest: 'b'.repeat(64),
      publicationId: 'pub-' + index, siteId: 'site-1', siteSlug: 'domru-site', siteRevision: index,
      rebuildId: 'build-' + index, rebuildRevision: 1, redirects: [],
    } });
    const { manifestDigest: _, ...body } = a; body.sealedAt = new Date(now - (40 - index) * 86400000).toISOString();
    a = { ...body, manifestDigest: hash(body) };
    await writeFile(join(root, 'manifests', a.artifactId + '.json'), JSON.stringify(a));
    await recordReceipt(root, a); artifacts.push(a);
  }
  const baseline = { artifactId: artifacts[0].artifactId, proof: { fixture: true } };
  await writeImmutableJson(join(root, 'baselines'), 'legacy.json', { ...baseline, recordDigest: hash(baseline) });
  const active = artifacts.at(-1);
  const serving = async () => ({ active, config: { root: '/publication/releases/' + active.artifactId, fallback: '/publication/releases/' + artifacts[0].artifactId } });
  return { root, artifacts, serving };
}
async function api() { return import('../apps/web/scripts/publication/artifact-retention.mjs'); }
async function makeRecent(f) {
  for (const [index, a] of f.artifacts.entries()) {
    const { manifestDigest: _, ...body } = a;
    body.sealedAt = new Date(+now - (f.artifacts.length - index) * 3600000).toISOString();
    const updated = { ...body, manifestDigest: hash(body) };
    await writeFile(join(f.root, 'manifests', a.artifactId + '.json'), JSON.stringify(updated));
    const receipt = JSON.parse(await readFile(join(f.root, 'receipts', a.artifactId + '.json')));
    await writeFile(join(f.root, 'receipts', a.artifactId + '.json'), JSON.stringify({ ...receipt, manifestDigest: updated.manifestDigest }));
    f.artifacts[index] = updated;
  }
}
test('frequent releases retain only two extra recent versions beyond mandatory roots', async t => {
  const f = await fixture(t, 10); await makeRecent(f);
  const { planRetention } = await api();
  const p = await planRetention({ root: f.root, serving: await f.serving(), now });
  assert.deepEqual(p.candidates.map(a => a.artifactId), f.artifacts.slice(1, 5).map(a => a.artifactId));
  assert.deepEqual(p.protected.filter(a => a.reasons.includes('recent')).map(a => a.artifactId).sort(),
    f.artifacts.slice(5, 7).map(a => a.artifactId).sort());
  assert.equal(p.policy.budgetBytes, 8 * 1024 ** 3);
});
test('budget counts retained assets and preserves mandatory versions even when they exceed it', async t => {
  const f = await fixture(t, 10); await makeRecent(f);
  const { planRetention } = await api();
  const p = await planRetention({ root: f.root, serving: await f.serving(), now, budgetBytes: 1 });
  assert.equal(p.protected.length, 4);
  assert.equal(p.usage.mandatoryOverBudget, true);
  assert.equal(p.protected.some(a => a.reasons.includes('recent')), false);
  assert.ok(p.usage.requiredBytes > 1);
  const extra = p.candidates.find(a => a.artifactId === f.artifacts[6].artifactId);
  const exact = await planRetention({ root: f.root, serving: await f.serving(), now,
    budgetBytes: p.usage.requiredBytes + extra.htmlAllocatedBytes });
  assert.deepEqual(exact.protected.filter(a => a.reasons.includes('recent')).map(a => a.artifactId), [extra.artifactId]);
  assert.equal(exact.usage.projectedBytes, exact.policy.budgetBytes);
  await mkdir(join(f.root, 'data'), { recursive: true });
  await writeFile(join(f.root, 'data', 'retained-assets.bin'), Buffer.alloc(65536));
  const assets = await planRetention({ root: f.root, serving: await f.serving(), now,
    budgetBytes: exact.policy.budgetBytes });
  assert.equal(assets.protected.some(a => a.reasons.includes('recent')), false);
  assert.equal(assets.usage.mandatoryOverBudget, true);
});
test('unresolved candidate and previous version cannot be evicted by the byte budget', async t => {
  const f = await fixture(t, 10); await makeRecent(f); const { planRetention } = await api();
  const a = f.artifacts[1]; await rm(join(f.root, 'receipts', a.artifactId + '.json'));
  const content = { artifactId: a.artifactId, expectedActiveArtifactId: f.artifacts[2].artifactId,
    job: { publicationId: a.publicationId, siteId: a.siteId, siteSlug: a.siteSlug, rebuildId: a.rebuildId, rebuildRevision: 1 } };
  await writeImmutableJson(join(f.root, 'operations'), 'a'.repeat(64) + '.json', { ...content, operationDigest: hash(content) });
  const p = await planRetention({ root: f.root, serving: await f.serving(), now, budgetBytes: 1 });
  assert.equal(p.protected.length, 6);
  assert.ok(p.protected.find(x => x.artifactId === a.artifactId).reasons.includes('unresolved'));
  assert.ok(p.protected.find(x => x.artifactId === f.artifacts[2].artifactId).reasons.includes('unresolved-previous'));
});
test('budget preserves the legacy current link without following or counting its external target', async t => {
  const f = await fixture(t); const { planRetention } = await api();
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'retention-external-')));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'outside.bin'), Buffer.alloc(1024 * 1024));
  const before = await planRetention({ root: f.root, serving: await f.serving(), now });
  await symlink(outside, join(f.root, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
  const after = await planRetention({ root: f.root, serving: await f.serving(), now });
  assert.ok(after.usage.allocatedBytes - before.usage.allocatedBytes < 65536);
  assert.equal((await lstat(join(f.root, 'current'))).isSymbolicLink(), true);
});
function archive(a) {
  return { artifactId: a.artifactId, manifestDigest: a.manifestDigest, storageId: 1,
    objectKey: 'astro-telekom/publications/' + a.artifactId + '/' + a.manifestDigest + '.tar.gz',
    archiveSha256: 'c'.repeat(64), archiveBytes: 100, verifiedAt: now.toISOString(),
    retainUntil: new Date(+now + 90 * 86400000).toISOString(), restoreVerified: true };
}
test('retention protects serving, baseline and exactly two previous successful versions', async t => {
  const f = await fixture(t); const { planRetention } = await api();
  const p = await planRetention({ root: f.root, serving: await f.serving(), now });
  assert.deepEqual(p.candidates.map(x => x.artifactId), f.artifacts.slice(1, 3).map(a => a.artifactId));
  assert.ok(p.protected.some(x => x.artifactId === f.artifacts[0].artifactId && x.reasons.includes('baseline')));
});
test('recent versions, unresolved candidate and its previous artifact survive GC', async t => {
  const f = await fixture(t, 8); const { planRetention } = await api();
  const a = f.artifacts[1];
  await rm(join(f.root, 'receipts', a.artifactId + '.json'));
  const content = { artifactId: a.artifactId, expectedActiveArtifactId: f.artifacts[2].artifactId,
    job: { publicationId: a.publicationId, siteId: a.siteId, siteSlug: a.siteSlug, rebuildId: a.rebuildId, rebuildRevision: 1 } };
  await writeImmutableJson(join(f.root, 'operations'), 'a'.repeat(64) + '.json', { ...content, operationDigest: hash(content) });
  const recent = f.artifacts[3]; const { manifestDigest: _, ...body } = recent; body.sealedAt = now.toISOString();
  await writeFile(join(f.root, 'manifests', recent.artifactId + '.json'), JSON.stringify({ ...body, manifestDigest: hash(body) }));
  const { status, ...r } = JSON.parse(await readFile(join(f.root, 'receipts', recent.artifactId + '.json')));
  await writeFile(join(f.root, 'receipts', recent.artifactId + '.json'), JSON.stringify({ status, ...r, manifestDigest: hash(body) }));
  const p = await planRetention({ root: f.root, serving: await f.serving(), now });
  assert.ok(!p.candidates.some(x => [a.artifactId, f.artifacts[2].artifactId, recent.artifactId].includes(x.artifactId)));
});
test('GC refuses deletion without an independently restored off-server archive or for a protected version', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive } = await api(); const a = f.artifacts[1];
  await assert.rejects(collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now }), /archive/i);
  await assert.rejects(acknowledgeArchive(f.root, { ...archive(a), restoreVerified: false }, now), /archive/i);
  await assert.rejects(acknowledgeArchive(f.root, { ...archive(a),
    verifiedAt: new Date(+now - 91 * 86400000).toISOString(),
    retainUntil: new Date(+now - 86400000).toISOString() }, now), /archive/i);
  await acknowledgeArchive(f.root, archive(f.artifacts[0]), now);
  await assert.rejects(collectArtifact({ root: f.root, servingReader: f.serving, artifactId: f.artifacts[0].artifactId, now }), /protected/i);
  assert.equal(await readFile(join(f.root, 'releases', a.artifactId, 'index.html'), 'utf8'), 'Home 2');
});
test('archived HTML is deleted, assets and sealed metadata remain, strict activation rejects it', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive } = await api(); const a = f.artifacts[1];
  await acknowledgeArchive(f.root, archive(a), now);
  const result = await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now });
  assert.equal(result.status, 'DELETED'); assert.equal(result.deletedFiles, 2);
  await assert.rejects(lstat(join(f.root, 'releases', a.artifactId, 'index.html')), { code: 'ENOENT' });
  assert.equal(await readFile(join(f.root, 'releases', a.artifactId, 'style.css'), 'utf8'), '.old{color:red}');
  const store = await import('../apps/web/scripts/publication/artifact-store.mjs');
  assert.equal((await store.readHistoricalArtifact(f.root, a.artifactId)).manifestDigest, a.manifestDigest);
  await assert.rejects(readArtifact(f.root, a.artifactId), /archived/i);
  assert.equal((await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now })).status, 'DELETED');
});
test('crash halfway through deletion resumes only from a verified durable marker', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive } = await api(); const a = f.artifacts[1];
  await acknowledgeArchive(f.root, archive(a), now);
  await assert.rejects(collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now,
    afterDelete: () => { throw new Error('simulated crash'); } }), /simulated crash/);
  await assert.rejects(readArtifact(f.root, a.artifactId), /archived/i);
  assert.equal((await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now })).status, 'DELETED');
});
test('fresh S3 restore evidence renews an old archive without rewriting its immutable identity', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive } = await api(); const a = f.artifacts[1];
  await acknowledgeArchive(f.root, archive(a), now);
  const original = await readFile(join(f.root, 'archives', a.artifactId + '.json'), 'utf8');
  const later = new Date(+now + 91 * 86400000);
  await acknowledgeArchive(f.root, { ...archive(a), verifiedAt: later.toISOString(),
    retainUntil: new Date(+later + 90 * 86400000).toISOString() }, later);
  assert.equal(await readFile(join(f.root, 'archives', a.artifactId + '.json'), 'utf8'), original);
  assert.equal((await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now: later })).status, 'DELETED');
});
test('a crash leaving a regular immutable-write temporary file does not block future plans or verification', async t => {
  const f = await fixture(t); const { planRetention, acknowledgeArchive, collectArtifact } = await api(); const a = f.artifacts[1];
  const pending = '.pending-00000000-0000-4000-8000-000000000000';
  await writeFile(join(f.root, 'manifests', pending), '{incomplete');
  await mkdir(join(f.root, 'operations'), { recursive: true });
  await writeFile(join(f.root, 'operations', pending), '{incomplete');
  assert.ok((await planRetention({ root: f.root, serving: await f.serving(), now })).candidates.some(c => c.artifactId === a.artifactId));
  await acknowledgeArchive(f.root, archive(a), now);
  await writeFile(join(f.root, 'archive-verifications', a.artifactId, pending), '{incomplete');
  assert.equal((await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now })).status, 'DELETED');
  await writeFile(join(f.root, 'manifests', 'unknown'), 'unexpected');
  await assert.rejects(planRetention({ root: f.root, serving: await f.serving(), now }), /Unknown publication/);
});
test('a changed serving pointer aborts collection, corrupt records fail closed, symlink cannot escape', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive, planRetention } = await api(); const a = f.artifacts[1];
  await acknowledgeArchive(f.root, archive(a), now);
  const changed = async () => ({ active: a, config: { root: '/publication/releases/' + a.artifactId } });
  await assert.rejects(collectArtifact({ root: f.root, servingReader: changed, artifactId: a.artifactId, now }), /protected/i);
  await writeFile(join(f.root, 'manifests', f.artifacts[2].artifactId + '.json'), '{}');
  await assert.rejects(planRetention({ root: f.root, serving: await f.serving(), now }), /manifest|integrity|Invalid artifact/i);
  await assert.rejects(collectArtifact({ root: f.root, servingReader: f.serving, artifactId: '../outside', now }), /Invalid artifact/);
});
test('GC does not follow a symlink replacing a sealed HTML file', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive } = await api(); const a = f.artifacts[1];
  await acknowledgeArchive(f.root, archive(a), now);
  const outside = join(f.root, 'outside.html'); await writeFile(outside, 'preserve');
  const html = join(f.root, 'releases', a.artifactId, 'index.html'); await rm(html);
  try { await symlink(outside, html); } catch (error) { if (error.code === 'EPERM') { t.skip('Symlink privilege unavailable; Linux rehearsal covers this guard'); return; } throw error; }
  await assert.rejects(collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now }), /symbolic|Unsafe|regular/i);
  assert.equal(await readFile(outside, 'utf8'), 'preserve');
});
test('completed CMS receipt is readable after GC and retry never rolls serving back', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive } = await api(); const a = f.artifacts[1];
  const job = { publicationId: a.publicationId, siteId: a.siteId, siteSlug: a.siteSlug, rebuildId: a.rebuildId, rebuildRevision: 1 };
  const intent = { job, artifactId: a.artifactId, expectedActiveArtifactId: f.artifacts[0].artifactId };
  await writeImmutableJson(join(f.root, 'operations'), hash([job.rebuildId, 1]) + '.json', { ...intent, operationDigest: hash(intent) });
  await acknowledgeArchive(f.root, archive(a), now); await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now });
  const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  const controller = new PublicationController({ publicationRoot: f.root, builder: { build: () => { throw new Error('must not rebuild'); } }, activation: {
    current: f.serving, activate: () => { throw new Error('must not reactivate'); } } });
  assert.equal((await controller.receipt(job.rebuildId, 1)).status, 'SUCCEEDED');
  assert.equal((await controller.publish(job)).artifactId, a.artifactId);
});
test('completed CODE retry reads archived evidence without rebuilding or reactivation', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive } = await api(); const a = f.artifacts[1];
  const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  const release = { deploymentId: 'deployment-archive', expectedCommit: 'd'.repeat(40), rendererId: a.rendererId };
  const job = { publicationId: a.publicationId, siteId: a.siteId, siteSlug: a.siteSlug, rebuildId: a.rebuildId, rebuildRevision: 1 };
  const content = { release, job, artifactId: a.artifactId, expectedActiveArtifactId: f.artifacts[0].artifactId };
  await writeImmutableJson(join(f.root, 'code-operations'), hash(release) + '.json', { ...content, operationDigest: hash(content) });
  await acknowledgeArchive(f.root, archive(a), now);
  await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now });
  const controller = new PublicationController({ publicationRoot: f.root, builder: {
    renderer: Promise.resolve(a.rendererId), build: () => { throw new Error('must not rebuild'); } }, verifyCodeRelease: async () => {},
    activation: { current: f.serving, reconcile: async () => null, activate: () => { throw new Error('must not reactivate'); } } });
  assert.equal((await controller.releaseCode({ ...release, instanceId: controller.instanceId })).artifactId, a.artifactId);
  assert.equal((await f.serving()).active.artifactId, f.artifacts.at(-1).artifactId);
});
test('controller GC shares the CMS/CODE serial queue', async t => {
  const f = await fixture(t); const { PublicationController } = await import('../apps/web/scripts/publication/publication-controller.mjs');
  let release; const block = new Promise(r => { release = r; });
  const controller = new PublicationController({ publicationRoot: f.root, builder: {}, activation: { current: f.serving } });
  controller.pending = block;
  let finished = false;
  const p = controller.retentionPlan({ now }).then(() => { finished = true; });
  await new Promise(r => setTimeout(r, 20)); assert.equal(finished, false);
  release(); await p; assert.equal(finished, true);
});
test('an archived version can be restored only from its complete sealed tree and is pinned after restore', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive, restoreArtifact, planRetention } = await api(); const a = f.artifacts[1];
  const stage = join(f.root, 'restores', a.artifactId);
  await cp(join(f.root, 'releases', a.artifactId), stage, { recursive: true });
  await acknowledgeArchive(f.root, archive(a), now); await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now });
  await writeFile(join(stage, 'index.html'), 'corruption');
  await assert.rejects(restoreArtifact({ root: f.root, artifactId: a.artifactId, now }), /integrity|inventory/i);
  await writeFile(join(stage, 'index.html'), 'Home 2');
  await restoreArtifact({ root: f.root, artifactId: a.artifactId, now });
  assert.equal((await restoreArtifact({ root: f.root, artifactId: a.artifactId, now })).status, 'RESTORED');
  assert.equal((await readArtifact(f.root, a.artifactId)).manifestDigest, a.manifestDigest);
  const p = await planRetention({ root: f.root, serving: await f.serving(), now });
  assert.ok(p.protected.some(p => p.artifactId === a.artifactId && p.reasons.includes('restored')));
});
test('interrupted restore resumes complete files and repairs missing HTML after a confirmed restore', async t => {
  const f = await fixture(t); const { collectArtifact, acknowledgeArchive, restoreArtifact } = await api(); const a = f.artifacts[1];
  await cp(join(f.root, 'releases', a.artifactId), join(f.root, 'restores', a.artifactId), { recursive: true });
  await acknowledgeArchive(f.root, archive(a), now);
  await collectArtifact({ root: f.root, servingReader: f.serving, artifactId: a.artifactId, now });
  await assert.rejects(restoreArtifact({ root: f.root, artifactId: a.artifactId, now,
    afterRestoreFile: () => { throw new Error('interrupted restore'); } }), /interrupted restore/);
  await restoreArtifact({ root: f.root, artifactId: a.artifactId, now });
  await rm(join(f.root, 'releases', a.artifactId, 'index.html'));
  await restoreArtifact({ root: f.root, artifactId: a.artifactId, now });
  assert.equal((await readArtifact(f.root, a.artifactId)).manifestDigest, a.manifestDigest);
});

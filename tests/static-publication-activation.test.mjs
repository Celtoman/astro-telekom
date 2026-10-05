import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const identity = (suffix = 'a') => ({
  artifactId: suffix.repeat(64), rendererId: 'f'.repeat(64), catalogDigest: 'e'.repeat(64),
  siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 1,
  publicationId: 'publication-1', rebuildId: 'rebuild-1', rebuildRevision: 1,
  redirects: [{ id: 'redirect-1', sourcePath: '/old-city' }],
});

test('sealed artifacts cannot be overwritten, modified unnoticed or escape the public tree', async () => {
  const { sealArtifact, readArtifact } = await import('../apps/web/scripts/publication/artifact-store.mjs');
  const root = await mkdtemp(join(tmpdir(), 'astro-artifact-test-'));
  try {
    const source = join(root, 'build'); await mkdir(source);
    await writeFile(join(source, 'index.html'), '<h1>Version A</h1>');
    await writeFile(join(source, '404.html'), '<h1>Not found</h1>');
    await writeFile(join(source, 'redirects.caddy'), 'internal configuration');
    const sealed = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: identity() });
    assert.equal(sealed.files.some(({ path }) => path === 'redirects.caddy'), false);
    assert.equal((await readArtifact(root, sealed.artifactId)).publicationId, 'publication-1');
    assert.deepEqual(await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: identity() }), sealed);
    await writeFile(join(source, 'index.html'), '<h1>Different version</h1>');
    await assert.rejects(sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: identity() }), /immutable|collision/i);
    await writeFile(join(root, 'releases', sealed.artifactId, 'index.html'), 'corrupt');
    await assert.rejects(readArtifact(root, sealed.artifactId), /digest|integrity/i);
    await assert.rejects(readArtifact(root, '../manifests/private'), /artifact/i);
    await writeFile(join(source, '.env'), 'secret');
    await assert.rejects(sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: identity('b') }), /private|hidden/i);
    await rm(join(source, '.env'));
    await symlink(join(source, 'index.html'), join(source, 'alias.html'), 'file').catch((error) => { if (error.code !== 'EPERM') throw error; });
    if (await readFile(join(source, 'alias.html')).then(() => true, () => false)) {
      await assert.rejects(sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: identity('b') }), /symbolic|symlink/i);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Caddy serving protocol survives rejection, lost reply, retry, stale writer and restart with old assets intact', { timeout: 180000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/rehearse-static-activation.mjs'], {
    encoding: 'utf8', timeout: 180000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /atomic serving, lost response reconciled, stale writer rejected, restart resumed, previous assets retained/);
});

test('publication records remain write-once under concurrent writers and interrupted sealing resumes', async () => {
  const { writeImmutableJson, sealArtifact } = await import('../apps/web/scripts/publication/artifact-store.mjs');
  const root = await mkdtemp(join(tmpdir(), 'astro-artifact-test-'));
  try {
    const writers = await Promise.allSettled([
      writeImmutableJson(root, 'receipt.json', { id: 'a' }),
      writeImmutableJson(root, 'receipt.json', { id: 'b' }),
    ]);
    assert.equal(writers.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(writers.filter(({ status }) => status === 'rejected').length, 1);
    const source = join(root, 'build'); await mkdir(source);
    await writeFile(join(source, 'index.html'), '<h1>A</h1>'); await writeFile(join(source, '404.html'), '<h1>404</h1>');
    const target = join(root, 'releases', identity().artifactId); await mkdir(target, { recursive: true });
    await writeFile(join(target, 'index.html'), '<h1>A</h1>'); await writeFile(join(target, '404.html'), '<h1>404</h1>');
    const resumed = await sealArtifact({ publicationRoot: root, sourceDirectory: source, identity: { ...identity(), siteRevision: 0 } });
    assert.equal(resumed.siteRevision, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

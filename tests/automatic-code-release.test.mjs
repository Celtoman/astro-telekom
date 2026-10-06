import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticCodeRelease } from '../apps/web/scripts/publication/automatic-code-release.mjs';
import { ActivationUncertainError } from '../apps/web/scripts/publication/caddy-activation.mjs';

function fixture() {
  const rendererId = 'b'.repeat(64), expectedCommit = 'c'.repeat(40);
  let active = { rendererId: 'a'.repeat(64), publicationId: 'published-only', siteRevision: 13 };
  const calls = []; let unavailable = false;
  const controller = { builder: { renderer: Promise.resolve(rendererId) }, instanceId: 'fixture-instance',
    active: async () => active, eligible: async artifact => calls.push(['snapshot', artifact.publicationId]),
    releaseCode: async input => { calls.push(['release', input]); active = { ...active, rendererId }; },
    releaseCodeSerial: async input => { calls.push(['serial', input]); active = { ...active, rendererId }; } };
  const verifier = { latest: async commit => { assert.equal(commit, expectedCommit); if (unavailable) throw new ActivationUncertainError('not ready'); return { deploymentId: 'latest-deployment', expectedCommit }; } };
  const release = new AutomaticCodeRelease({ controller, verifier, expectedCommit });
  return { release, calls, controller, setUnavailable: value => { unavailable = value; } };
}
test('automatic CODE release uses the serving snapshot and runtime commit, once, without publishing drafts', async () => {
  const f = fixture(); await f.release.run(); await f.release.run();
  assert.equal(f.release.state, 'READY'); assert.equal(f.calls.filter(x => x[0] === 'release').length, 1);
  assert.deepEqual(f.calls[0], ['snapshot', 'published-only']);
  assert.equal(f.calls[1][1].expectedCommit, 'c'.repeat(40));
  assert.equal(f.calls[1][1].deploymentId, 'latest-deployment');
});
test('provider uncertainty preserves serving HTML and CMS retries reconcile inside the existing serial operation', async () => {
  const f = fixture(); f.setUnavailable(true);
  await assert.rejects(f.release.run(), ActivationUncertainError);
  assert.equal(f.calls.length, 0); assert.equal(f.release.state, 'WAITING_DEPLOYMENT');
  f.setUnavailable(false); await f.release.run({ insideSerial: true });
  assert.equal(f.calls[1][0], 'serial'); assert.equal(f.release.state, 'READY');
});
test('missing or invalid deployed SOURCE_COMMIT cannot authorize automatic CODE activation', async () => {
  const f = fixture();
  for (const expectedCommit of [undefined, 'unknown', 'master', 'c'.repeat(39)]) {
    const release = new AutomaticCodeRelease({ controller: f.controller, verifier: { latest: async () => assert.fail('must not query') }, expectedCommit });
    await assert.rejects(release.run(), ActivationUncertainError); assert.equal(release.state, 'CODE_UNAVAILABLE');
  }
  assert.equal(f.calls.length, 0);
});

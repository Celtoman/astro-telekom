import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyGhcrRelease } from '../scripts/verify-ghcr-release.mjs';

const source = 'a'.repeat(40);
const signer = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const runId = '45768953392';
const repository = 'Celtoman/astro-telekom';
const workflow = '.github/workflows/ghcr-release.yml';
const predicateType = 'https://github.com/Celtoman/astro-telekom/attestation/ghcr-image/v1';
const roles = { migrate: 'migration', api: 'api', worker: 'worker', web: 'web', admin: 'admin' };

function release() {
  const images = Object.fromEntries(Object.entries(roles).map(([service, role], index) =>
    [service, `ghcr.io/celtoman/astro-telekom-release-${role}@sha256:${String(index).repeat(64)}`]));
  images['bootstrap-seed'] = images.api;
  images['serving-projection-warmer'] = images.api;
  images.postgres = `postgres@sha256:${'d'.repeat(64)}`;
  images.redis = `redis@sha256:${'e'.repeat(64)}`;
  const compose = `services:\r\n  migrate:\r\n    exclude_from_hc: true\r\n`;
  const manifest = { source, images, imageBuildRun: runId,
    composeSha256: createHash('sha256').update(compose.replace(/\r\n/g, '\n').trim()).digest('hex') };
  const config = {
    'x-astro-release': { 'source-commit': source },
    services: Object.fromEntries(Object.entries(images).map(([name, image]) =>
      [name, { image, environment: { APP_SOURCE_COMMIT: source } }])),
  };
  const run = { id: Number(runId), path: workflow, head_branch: 'master', head_sha: signer,
    head_repository: { full_name: repository }, event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
  return { manifest, compose, directory: 'release', config, run };
}

function verifier(fixture, adjust = results => results) {
  const checked = [];
  function execute(command, args, { input }) {
    if (command === 'docker') {
      assert.equal(input, 'services:\n  migrate:\n\n');
      assert.ok(args.includes('--no-interpolate') && args.includes('--no-env-resolution'));
      return JSON.stringify(fixture.config);
    }
    assert.equal(command, 'gh');
    if (args[0] === 'api') {
      if (args.at(-1) === `repos/${repository}/actions/runs/${runId}`) return JSON.stringify(fixture.run);
      assert.equal(args.at(-1), `repos/${repository}/git/commits/${source}`);
      return JSON.stringify({ tree: { sha: tree } });
    }
    assert.deepEqual(args.slice(0, 2), ['attestation', 'verify']);
    assert.deepEqual(args.slice(3), ['--hostname', 'github.com', '--repo', repository,
      '--signer-workflow', `${repository}/${workflow}`, '--signer-digest', signer, '--source-ref', 'refs/heads/master',
      '--deny-self-hosted-runners', '--predicate-type', predicateType, '--format', 'json']);
    const [name, sha256] = args[2].slice('oci://'.length).split('@sha256:');
    const role = name.split('-').at(-1);
    checked.push(role);
    const statement = { predicateType, subject: [{ name, digest: { sha256 } }],
      predicate: { sourceSha: source, sourceTree: tree, runId, role } };
    return JSON.stringify(adjust([{ verificationResult: { statement } }], role));
  }
  return { execute, checked };
}

test('verifies every promoted digest against the built source and the separate signing workflow SHA', () => {
  const fixture = release();
  const { execute, checked } = verifier(fixture);
  verifyGhcrRelease(fixture, execute);
  assert.deepEqual(checked, Object.values(roles));
});

test('rejects mismatched Compose image references and unexpected run metadata', () => {
  const fixture = release();
  const { execute, checked } = verifier(fixture);
  assert.throws(() => verifyGhcrRelease({ ...fixture, compose: 'services: {}' }, execute), /Compose content/);
  fixture.config.services.web.image = fixture.manifest.images.api;
  assert.throws(() => verifyGhcrRelease(fixture, execute), /Compose image references/);
  fixture.config.services.web.image = fixture.manifest.images.web;
  fixture.run.path = '.github/workflows/ci.yml';
  assert.throws(() => verifyGhcrRelease(fixture, execute), /successful dispatch/);
  assert.deepEqual(checked, []);
});

test('rejects a missing attestation or a verified statement for a different source, role, digest or run', () => {
  for (const adjust of [
    () => [],
    statement => { statement.predicate.sourceSha = signer; },
    statement => { statement.predicate.sourceTree = signer; },
    statement => { statement.predicate.role = 'worker'; },
    statement => { statement.predicate.runId = '100'; },
    statement => { statement.subject[0].digest.sha256 = 'f'.repeat(64); },
    statement => { statement.subject[0].name += '-foreign'; },
  ]) {
    const fixture = release();
    const { execute } = verifier(fixture, (results, role) => {
      if (role !== 'web') return results;
      return adjust(results[0].verificationResult.statement) ?? results;
    });
    assert.throws(() => verifyGhcrRelease(fixture, execute), /web has no verified attestation/);
  }
});

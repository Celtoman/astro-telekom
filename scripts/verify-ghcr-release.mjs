import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repository = 'Celtoman/astro-telekom';
const workflow = '.github/workflows/ghcr-release.yml';
const predicateType = 'https://github.com/Celtoman/astro-telekom/attestation/ghcr-image/v1';
const imageRoles = { migrate: 'migration', api: 'api', worker: 'worker', web: 'web', admin: 'admin' };
const apiServices = ['bootstrap-seed', 'serving-projection-warmer'];
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;

export function verifyGhcrRelease({ manifest, compose, directory }, execute = execFileSync) {
  const { source, images, composeSha256, imageBuildRun } = manifest;
  const runId = String(imageBuildRun ?? '');
  const normalizedCompose = compose.replace(/\r\n/g, '\n');
  assert.match(source, shaPattern, 'release.json must contain the full built source SHA');
  assert.match(runId, /^[1-9]\d*$/, 'release.json must identify the image build run');
  assert.equal(createHash('sha256').update(normalizedCompose.trim()).digest('hex'), composeSha256,
    'Compose content does not match release.json');

  const readJson = (command, args, input) => JSON.parse(execute(command, args, {
    input, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  }));

  // Only the parser input omits the Coolify-specific health aggregation key.
  const config = readJson('docker', ['compose', '--project-directory', directory, '-f', '-', 'config',
    '--no-interpolate', '--no-env-resolution', '--format', 'json'],
    normalizedCompose.replace(/^ {4}exclude_from_hc: (?:true|false)[ \t]*$/gm, ''));
  assert.equal(config['x-astro-release']?.['source-commit'], source, 'Compose source SHA differs from release.json');
  const services = Object.entries(config.services);
  assert.deepEqual(Object.fromEntries(services.map(([name, service]) => [name, service.image])), images,
    'Compose image references differ from release.json');
  assert.deepEqual(Object.keys(images).sort(), [...Object.keys(imageRoles), ...apiServices, 'postgres', 'redis'].sort(),
    'Unexpected release services');

  for (const [name, service] of services) {
    assert.equal(service.build, undefined, `${name} must use a published image`);
  }
  for (const name of apiServices) {
    assert.equal(images[name], images.api, `${name} must use the attested API image`);
  }
  for (const name of [...Object.keys(imageRoles), ...apiServices]) {
    assert.equal(config.services[name].environment?.APP_SOURCE_COMMIT, source, `${name} source SHA is incorrect`);
  }

  const api = path => readJson('gh', ['api', '--hostname', 'github.com', `repos/${repository}/${path}`]);
  const run = api(`actions/runs/${runId}`);
  assert.ok(String(run.id) === runId && run.path === workflow && run.head_branch === 'master'
    && run.head_repository?.full_name === repository && run.event === 'workflow_dispatch'
    && run.status === 'completed' && run.conclusion === 'success' && shaPattern.test(run.head_sha),
    'Image build run must be a successful dispatch of the GHCR workflow on master');
  const tree = api(`git/commits/${source}`).tree?.sha;
  assert.match(tree, shaPattern, 'Cannot identify the Git tree of the built source');

  for (const [service, role] of Object.entries(imageRoles)) {
    const image = images[service];
    const name = `ghcr.io/${repository.toLowerCase()}-release-${role}`;
    const prefix = `${name}@sha256:`;
    assert.ok(typeof image === 'string' && image.startsWith(prefix) && digestPattern.test(image.slice(prefix.length)),
      `${role} must reference its GHCR repository by SHA-256 digest`);
    const digest = image.slice(prefix.length);
    const verified = readJson('gh', ['attestation', 'verify', `oci://${image}`, '--hostname', 'github.com',
      '--repo', repository, '--signer-workflow', `${repository}/${workflow}`, '--signer-digest', run.head_sha,
      '--source-ref', 'refs/heads/master', '--deny-self-hosted-runners', '--predicate-type', predicateType, '--format', 'json']);

    assert.ok(verified.some(({ verificationResult }) => {
      const statement = verificationResult?.statement;
      const predicate = statement?.predicate;
      return statement?.predicateType === predicateType
        && statement.subject?.some(subject => subject.name === name && subject.digest?.sha256 === digest)
        && predicate?.sourceSha === source && predicate.sourceTree === tree
        && predicate.role === role && predicate.runId === runId;
    }), `${role} has no verified attestation for this digest, source and build run`);
  }
}

if (import.meta.main) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: node scripts/verify-ghcr-release.mjs <path/to/release.json>');
    const path = resolve(process.argv[2]);
    const directory = dirname(path);
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    const compose = readFileSync(join(directory, 'docker-compose.coolify.yml'), 'utf8');
    verifyGhcrRelease({ manifest, compose, directory });
    console.log(`Verified attestations for all five release images from ${manifest.source}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

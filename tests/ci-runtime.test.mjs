import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = join(import.meta.dirname, '..');
const root = join(repositoryRoot, '.github', 'workflows');
const exactTestBaselinePattern = /(?:baseline(?=\s*(?:[:—–-]|\d)|\s+тестов(?![\p{L}\p{N}_]))(?: тестов)?|pnpm test)[^.\r\n]{0,100}\b(?:\d+\/\d+|\d+\s+тест(?:ов|а)?)(?![\p{L}\p{N}_])/iu;

test('GitHub workflows use Node 24 actions without weakening the release gate', () => {
  const ci = readFileSync(join(root, 'ci.yml'), 'utf8');
  const release = readFileSync(join(root, 'release.yml'), 'utf8');

  assert.match(ci, /actions\/checkout@[a-f0-9]{40} # v7/);
  assert.match(ci, /pnpm\/action-setup@[a-f0-9]{40} # v6/);
  assert.match(ci, /actions\/setup-node@[a-f0-9]{40} # v7/);
  assert.match(release, /actions\/checkout@[a-f0-9]{40} # v7/);
  assert.match(ci, /node-version:\s*["']22\.23\.4["']/);
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /pnpm check/);
  assert.match(readFileSync(join(repositoryRoot, '.gitattributes'), 'utf8'), /^\*\.sh text eol=lf$/m);
  assert.doesNotMatch(readFileSync(join(repositoryRoot, 'scripts', 'pnpm-install-retry.sh'), 'utf8'), /\r/);
  assert.doesNotMatch(`${ci}\n${release}`, /(?:actions\/(?:checkout|setup-node)|pnpm\/action-setup)@v4/);
});

test('release Actions are pinned and GHCR write permission is isolated from the build', () => {
  const ghcr = readFileSync(join(root, 'ghcr-release.yml'), 'utf8');
  const release = readFileSync(join(root, 'release.yml'), 'utf8');
  const ci = readFileSync(join(root, 'ci.yml'), 'utf8');

  for (const [, action] of `${ci}\n${ghcr}\n${release}`.matchAll(/^\s*- uses: (\S+)/gm)) {
    assert.match(action, /^[^@]+@[a-f0-9]{40}$/);
  }

  const [build, publish, attest] = ghcr.split(/^  (?:publish-images|attest-images):\r?$/m);
  assert.match(build, /^permissions: \{\}$/m);
  assert.match(build, /^  build-images:/m);
  assert.doesNotMatch(build, /packages: write|GHCR_TOKEN|docker (?:login|push)| --push|secrets\./);
  assert.match(build, /openssl cms -encrypt -aes-256-gcm/);
  assert.match(build, /path: \$\{\{ runner\.temp \}\}\/image\.tar\.cms/);
  assert.match(publish, /needs: \[verify-source, build-images\]/);
  assert.match(publish, /environment: ghcr-release/);
  assert.match(publish, /permissions:\s+packages: write\s+runs-on:/);
  assert.match(publish, /openssl cms -decrypt/);
  assert.doesNotMatch(publish, /actions\/checkout|docker (?:buildx build|build|run)(?=\s)/);
  assert.match(publish, /name: Publish the image and read back its digest\s+shell: bash\s+env:\s+GHCR_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(publish, /docker push "\$image" \| tee/);
  assert.match(publish, /published="\$repo@\$digest"/);
  assert.match(publish, /docker buildx imagetools inspect [^\r\n]+"\$published"/);
  assert.doesNotMatch(`${build}\n${publish}`, /(?:id-token|attestations): write|actions\/attest@/);
  assert.match(attest, /needs: \[verify-source, publish-images\]/);
  assert.match(attest, /permissions:\s+attestations: write\s+id-token: write\s+runs-on:/);
  assert.match(attest, /SOURCE_SHA: \$\{\{ needs\.verify-source\.outputs\.sha \}\}/);
  assert.match(attest, /SOURCE_TREE: \$\{\{ needs\.verify-source\.outputs\.tree \}\}/);
  assert.match(attest, /actions\/attest@[a-f0-9]{40}/);
  assert.doesNotMatch(attest, /packages: write|actions\/checkout|push-to-registry: true|GHCR_TOKEN/);
  assert.match(release, /^permissions: \{\}[\s\S]*?^  release:\s+permissions:\s+contents: write/m);
  assert.match(release, /softprops\/action-gh-release@[a-f0-9]{40}/);
});

test('the exact test baseline has docs/TEST_COVERAGE.md as its only source of truth', () => {
  const canonicalPath = join('docs', 'TEST_COVERAGE.md');
  const canonical = readFileSync(join(repositoryRoot, canonicalPath), 'utf8');
  const markdownPaths = [
    ...readdirSync(repositoryRoot).filter((path) => path.endsWith('.md')),
    ...readdirSync(join(repositoryRoot, 'docs'), { recursive: true })
      .filter((path) => path.endsWith('.md'))
      .map((path) => join('docs', path)),
  ].filter((path) => path !== canonicalPath);

  assert.match(canonical, /Baseline:\s*\d+\/\d+ passing/);

  for (const path of markdownPaths) {
    const mirror = readFileSync(join(repositoryRoot, path), 'utf8');
    assert.doesNotMatch(
      mirror,
      exactTestBaselinePattern,
      `${path} must not duplicate the exact test baseline`,
    );
  }
});

test('task management derives milestone composition from GitHub instead of a fixed count', () => {
  const taskManagement = readFileSync(join(repositoryRoot, 'docs', 'task-management.md'), 'utf8');

  assert.match(taskManagement, /GitHub автоматически/);
  assert.match(taskManagement, /--state all --milestone/);
  assert.doesNotMatch(
    taskManagement,
    /(?:milestone|MVP)[^.\r\n]{0,100}\b\d+\s+(?:Task issues?|задач|issues?)/i,
  );
});


test('baseline guard does not treat Figma occurrence evidence in the next sentence as a test count', () => {

  assert.doesNotMatch('Размеры совпали с baseline. Все instance-ссылки разрешены: 144/142/142 occurrences.', exactTestBaselinePattern);
  assert.doesNotMatch('Composite snapshots строятся от serving baseline, сохраняют чужие drafts и legacy CMS 29/29.', exactTestBaselinePattern);
  for (const text of ['Baseline: 854/854 passing', 'baseline тестов — 854/854', 'baseline 854/854 passing', 'pnpm test: 854 теста']) assert.match(text, exactTestBaselinePattern);
});

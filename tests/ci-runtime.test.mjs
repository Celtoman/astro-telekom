import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = join(import.meta.dirname, '..');
const root = join(repositoryRoot, '.github', 'workflows');
const exactTestBaselinePattern = /(?:baseline(?: тестов)?|pnpm test)[^.\r\n]{0,100}\b(?:\d+\/\d+|\d+\s+тест(?:ов|а)?)(?![\p{L}\p{N}_])/iu;

test('GitHub workflows use Node 24 actions without weakening the release gate', () => {
  const ci = readFileSync(join(root, 'ci.yml'), 'utf8');
  const release = readFileSync(join(root, 'release.yml'), 'utf8');

  assert.match(ci, /actions\/checkout@v7/);
  assert.match(ci, /pnpm\/action-setup@v6/);
  assert.match(ci, /actions\/setup-node@v7/);
  assert.match(release, /actions\/checkout@v7/);
  assert.match(ci, /node-version:\s*["']22\.23\.2["']/);
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /pnpm check/);
  assert.doesNotMatch(`${ci}\n${release}`, /(?:actions\/(?:checkout|setup-node)|pnpm\/action-setup)@v4/);
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
  for (const text of ['Baseline: 854/854 passing', 'baseline тестов — 854/854', 'pnpm test: 854 теста']) assert.match(text, exactTestBaselinePattern);
});

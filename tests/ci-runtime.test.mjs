import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '.github', 'workflows');

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

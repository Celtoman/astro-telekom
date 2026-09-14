import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = join(import.meta.dirname, '..');
const source = (relativePath) => readFileSync(join(repositoryRoot, ...relativePath.split('/')), 'utf8');

test('publication card exposes exact scheduling and cancellation without browser-side credentials', () => {
  const component = source('apps/admin/src/components/PublicationStatusCard.tsx');

  assert.match(component, /type=["']datetime-local["']/);
  assert.match(component, /\/admin\/sites\/\$\{siteId\}\/publication-schedules/);
  assert.match(component, /expectedWorkingRevision:\s*state\.workingRevision/);
  assert.match(component, /scheduledFor:\s*new Date/);
  assert.match(component, /method:\s*["']DELETE["']/);
  assert.match(component, /точн|точную/i);
  assert.doesNotMatch(component, /localStorage|sessionStorage|x-admin-token|innerHTML/);
});

test('worker registers a minute scheduler that calls only the protected due-publication endpoint', () => {
  const worker = source('services/worker/src/index.mjs');

  assert.match(worker, /publication-schedules-every-minute/);
  assert.match(worker, /pattern:\s*['"]\* \* \* \* \*['"]/);
  assert.match(worker, /\/internal\/site-publications\/release-due/);
  assert.match(worker, /job\.name === ['"]publication-schedules['"]/);
  assert.match(worker, /x-admin-token/);
});

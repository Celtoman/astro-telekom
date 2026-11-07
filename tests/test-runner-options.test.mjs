import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('pnpm runner applies concurrency before file patterns and propagates failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'node-test-options-'));
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  try {
    const lock = JSON.stringify(join(root, 'exclusive-lock'));
    for (let i = 0; i < 3; i++) await writeFile(join(root, `${i}.test.mjs`), `import{openSync,closeSync,unlinkSync}from'node:fs';const f=openSync(${lock},'wx');await new Promise(r=>setTimeout(r,200));closeSync(f);unlinkSync(${lock});`);
    const result = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--test-concurrency=1', '--', join(root, '*.test.mjs')], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await writeFile(join(root, 'failure.test.mjs'), 'throw Error("fixture failure");');
    const failed = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--', join(root, 'failure.test.mjs')], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(failed.status, 1); assert.match(failed.stdout, /fixture failure/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

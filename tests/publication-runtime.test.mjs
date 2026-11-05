import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialServing } from '../apps/web/scripts/publication/runtime.mjs';

test('runtime cannot turn unknown legacy serving into EMPTY or resume an unrecognized config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-baseline-'));
  try {
    const options = { publicationToken: 's'.repeat(32) };
    await assert.rejects(initialServing({ root, environment: {}, options }), /verified baseline/);
    await mkdir(join(root, 'releases')); await mkdir(join(root, 'releases', 'old-release'));
    await assert.rejects(initialServing({ root, environment: { PUBLICATION_BOOTSTRAP_EMPTY: 'true' }, options }), /unknown legacy/);
    await mkdir(join(root, 'state', 'caddy'), { recursive: true });
    await writeFile(join(root, 'state', 'caddy', 'autosave.json'), '{}');
    await assert.rejects(initialServing({ root, environment: { PUBLICATION_BOOTSTRAP_EMPTY: 'true' }, options }), /not initialized/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real Node/Caddy image separates CODE/CMS and resumes static HTML/assets without API', { timeout: 900000 }, async (context) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/rehearse-publication-runtime.mjs', import.meta.url)), '--non-root'], { windowsHide: true });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); });
  assert.equal(code, 0, output);
  assert.match(output, /CODE preserves serving A; CMS publishes B without provider/);
  assert.match(output, /ACCOUNT14 assets decode and serve on Linux\/non-root/);
  for (const line of output.split('\n').filter(line => line.startsWith('Runtime timing '))) context.diagnostic(line);
});

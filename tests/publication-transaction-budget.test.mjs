import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('real PostgreSQL publication capture and concurrent catalog reads exceed default budget without losing revision guards', { timeout: 180000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/rehearse-publication-transaction-budget.mjs', import.meta.url))], { windowsHide: true });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); });
  assert.equal(code, 0, output);
  assert.match(output, /Real SQL capture beyond 5 seconds prepares and retries/);
  assert.match(output, /Real SQL concurrent review and preview exceed 5 seconds/);
});

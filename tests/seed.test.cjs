const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
test('seed matches fresh PostgreSQL schema, is idempotent and requires complete FAQ before publication', { timeout: 240000 }, async () => {
  const child = spawn(process.execPath, [join(__dirname, '..', 'scripts', 'rehearse-seed.mjs')], { windowsHide: true });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  assert.equal(code, 0, output);
  assert.match(output, /fresh bootstrap, explicit FAQ readiness, publication preflight, exact idempotence, preserved edits, imported catalog, credentials and atomic rollback passed/);
});

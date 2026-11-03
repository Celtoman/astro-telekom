import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('host archiver restores every sealed file and rejects corruption/traversal/missing files', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'publication_retention_test.py'],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
});

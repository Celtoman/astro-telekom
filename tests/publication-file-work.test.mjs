import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFiles } from '../apps/web/scripts/publication/file-work.mjs';

test('file work bounds pressure, preserves order and drains writes before rejecting', async () => {
  let active = 0, peak = 0, finished = 0;
  const output = await mapFiles(Array.from({ length: 24 }, (_, i) => i), async i => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--; return i;
  }, 4);
  assert.deepEqual(output, Array.from({ length: 24 }, (_, i) => i));
  assert.equal(peak, 4); assert.equal(active, 0);
  await assert.rejects(mapFiles([0, 1, 2, 3, 4, 5], async i => {
    active++;
    try { if (i === 1) throw new Error('write failed'); await new Promise(resolve => setTimeout(resolve, 10)); finished++; }
    finally { active--; }
  }, 3), /write failed/);
  assert.equal(active, 0); assert.ok(finished > 0 && finished < 5);
});

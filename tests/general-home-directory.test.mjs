import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directorySelection } from '../apps/web/src/lib/general-home-directory.mjs';
const cities = [{ name: 'Берёзовский', region: { name: 'Свердловская область' } }, { name: 'Москва', region: { name: 'Москва' } }, { name: 'Казань', region: { name: 'Татарстан' } }];

test('directory combines normalized search and letter filters, keeps full filtered counts and reveals the whole remainder', () => {
  const many = Array.from({ length: 31 }, (_, index) => ({ name: `Город ${index}`, region: { name: 'Регион' } }));
  for (const [width, count] of [[1440, 24], [834, 18], [390, 12], [320, 12]]) {
    const selected = directorySelection(many, { width });
    assert.equal(selected.visible.length, count);
    assert.equal(selected.remaining, 31 - count);
    assert.equal(directorySelection(many, { width, expanded: true }).visible.length, 31);
  }
  assert.deepEqual(directorySelection(cities, { query: '  БЕРЕЗ  ', width: 390 }).matches, [cities[0]]);
  assert.deepEqual(directorySelection(cities, { query: 'Татарстан', letter: 'К', width: 390 }).matches, [cities[2]]);
  assert.equal(directorySelection(cities, { query: 'Татарстан', letter: 'М', width: 390 }).matches.length, 0);
  assert.equal(directorySelection([], { width: 390 }).remaining, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTariffCollections } from '../apps/web/src/scripts/tariff-collection-client.mjs';

function collection() {
  let focused = false;
  const overflow = Array.from({ length: 4 }, () => ({ hidden: false, querySelector: () => ({ focus: () => { focused = true; } }) }));
  const status = { textContent: '' }, listeners = [];
  const button = { hidden: true, disabled: false, addEventListener: (_name, listener, options) => { assert.equal(options.once, true); listeners.push(listener); } };
  const section = { dataset: {}, querySelector: selector => selector === '[data-collection-more]' ? button : status, querySelectorAll: selector => selector === '[data-collection-overflow]' ? overflow : Array(10) };
  return { root: { querySelectorAll: () => [section] }, button, status, listeners, overflow, focused: () => focused };
}
test('one activation opens the whole remainder; reinitialization preserves expanded state and order', () => {
  const fixture = collection();
  initializeTariffCollections(fixture.root);
  assert.equal(fixture.button.hidden, false);
  assert.ok(fixture.overflow.every(card => card.hidden));
  initializeTariffCollections(fixture.root);
  assert.equal(fixture.listeners.length, 1);
  fixture.listeners[0]({ detail: 1 });
  assert.ok(fixture.overflow.every(card => !card.hidden));
  assert.equal(fixture.button.hidden, true);
  assert.equal(fixture.status.textContent, 'Показаны все тарифы: 10.');
  assert.equal(fixture.focused(), false);
  initializeTariffCollections(fixture.root);
  assert.ok(fixture.overflow.every(card => !card.hidden));
});
test('keyboard activation moves focus into the newly available cards', () => {
  const fixture = collection(); initializeTariffCollections(fixture.root);
  fixture.listeners[0]({ detail: 0 });
  assert.equal(fixture.focused(), true);
});

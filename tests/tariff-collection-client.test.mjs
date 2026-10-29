import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTariffCollections } from '../apps/web/src/scripts/tariff-collection-client.mjs';
import { prepareCollectionScript } from '../apps/web/src/lib/tariff-collection-prepaint.mjs';
import vm from 'node:vm';

function control(dataset = {}) {
  const listeners = {};
  return { dataset, hidden: false, textContent: '', focused: false, attrs: {}, addEventListener: (type, fn) => { listeners[type] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; }, focus() { this.focused = true; }, click(detail = 1) { listeners.click({ detail }); } };
}
function collection() {
  const cards = Array.from({ length: 8 }, (_, i) => {
    const button = control();
    return { hidden: false, dataset: { serviceType: i < 4 ? 'INTERNET' : 'INTERNET_TV', speed: '500', gaming: 'false', cinemas: String(i >= 4) }, querySelector: () => button, button };
  });
  const more = control({ moreLabel: 'Ещё предложения' }), status = control(), count = control(), empty = control(), grid = { scrollLeft: 70 };
  const categories = ['ALL', 'INTERNET', 'INTERNET_TV'].map(collectionCategory => control({ collectionCategory }));
  const quick = ['gaming', 'cinemas', 'fast'].map(collectionQuick => control({ collectionQuick })), resets = [control(), control()];
  const singles = { '[data-collection-more]': more, '[data-collection-status]': status, '[data-collection-count]': count, '[data-collection-empty]': empty, '.collection-grid': grid };
  const lists = { '[data-collection-card]': cards, '[data-collection-category]': categories, '[data-collection-quick]': quick, '[data-collection-reset]': resets };
  const section = { dataset: { initialCount: '3' }, querySelector: key => singles[key], querySelectorAll: key => lists[key] || [] };
  return { root: { querySelectorAll: () => [section] }, more, status, empty, grid, categories, quick, resets, cards, visible: () => cards.filter(card => !card.hidden).length };
}
test('show more reveals all; changing filters resets to the configured count without moving filter focus', () => {
  const f = collection(); initializeTariffCollections(f.root);
  assert.equal(f.visible(), 3); assert.equal(f.more.textContent, 'Ещё предложения · 5');
  f.more.click(); assert.equal(f.visible(), 8); assert.equal(f.more.hidden, true);
  initializeTariffCollections(f.root); assert.equal(f.visible(), 8);
  f.categories[2].focus(); f.categories[2].click();
  assert.equal(f.visible(), 3); assert.equal(f.more.hidden, false); assert.equal(f.grid.scrollLeft, 0); assert.equal(f.categories[2].focused, true);
  f.more.click(0); assert.equal(f.visible(), 4); assert.equal(f.cards[7].button.focused, true);
});
test('all tariffs resets only the category; explicit reset clears the full empty intersection', () => {
  const f = collection(); initializeTariffCollections(f.root);
  f.quick[1].click(); f.categories[1].click();
  assert.equal(f.visible(), 0); assert.equal(f.empty.hidden, false); assert.equal(f.more.hidden, true);
  f.categories[0].click(); assert.equal(f.visible(), 3); assert.equal(f.quick[1].attrs['aria-pressed'], 'true');
  f.quick[0].click(); assert.equal(f.visible(), 0);
  f.resets[1].click(); assert.equal(f.visible(), 3); assert.equal(f.empty.hidden, true);
  assert.ok(f.quick.every(button => button.attrs['aria-pressed'] === 'false')); assert.equal(f.categories[0].focused, true);
});

test('parser initializer applies URL category and configured limit before module loading and binds controls once', () => {
  const f = collection();
  const section = f.root.querySelectorAll()[0];
  const context = { document: { currentScript: { previousElementSibling: section } }, URLSearchParams, location: { search: '?category=INTERNET_TV' } };
  vm.runInNewContext(prepareCollectionScript, context);
  assert.equal(f.visible(), 3);
  assert.equal(f.cards[0].hidden, true);
  assert.equal(f.categories[2].attrs['aria-pressed'], 'true');
  assert.equal(section.dataset.collectionPrepared, 'true');
  assert.equal(f.more.textContent, 'Ещё предложения · 1');
  f.more.click(); assert.equal(f.visible(), 4);
  initializeTariffCollections(f.root);
  assert.equal(f.visible(), 4, 'module initialization must preserve the expanded parser-time state');
  f.resets[0].click(); assert.equal(f.visible(), 3);
});

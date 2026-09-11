import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourcePublicationRecommendation, tariffConnectionLabel } from '../apps/admin/src/lib/tariff-display.ts';

test('source publication recommendation has explicit text and semantic color for every state', () => {
  const recommended = sourcePublicationRecommendation({ show_on_site: true });
  const discouraged = sourcePublicationRecommendation({ show_on_site: false });
  const missing = sourcePublicationRecommendation(null);

  assert.equal(recommended.label, 'Рекомендуется показывать');
  assert.match(recommended.className, /emerald/);
  assert.equal(discouraged.label, 'Рекомендуется не показывать');
  assert.match(discouraged.className, /amber/);
  assert.equal(missing.label, 'Не указана');
  assert.match(missing.className, /slate/);
});

test('admin connection fee distinguishes free, paid and missing values', () => {
  assert.equal(tariffConnectionLabel(0), 'Бесплатно');
  assert.equal(tariffConnectionLabel('1500'), '1 500 ₽');
  assert.equal(tariffConnectionLabel(null), 'Не указано');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourcePublicationRecommendation, tariffConnectionLabel } from '../apps/admin/src/lib/tariff-display.ts';

test('source publication recommendation has explicit text and semantic color for every state', () => {
  const recommended = sourcePublicationRecommendation({ show_on_site: true });
  const discouraged = sourcePublicationRecommendation({ show_on_site: false });
  const missing = sourcePublicationRecommendation(null);

  assert.equal(recommended.label, 'Рекомендуется показывать');
  assert.equal(recommended.tone, 'success');
  assert.equal(discouraged.label, 'Рекомендуется не показывать');
  assert.equal(discouraged.tone, 'warning');
  assert.equal(missing.label, 'Не указана');
  assert.equal(missing.tone, 'neutral');
});

test('admin connection fee distinguishes free, paid and missing values', () => {
  assert.equal(tariffConnectionLabel(0), 'Бесплатно');
  assert.equal(tariffConnectionLabel('1500'), '1 500 ₽');
  assert.equal(tariffConnectionLabel(null), 'Не указано');
});

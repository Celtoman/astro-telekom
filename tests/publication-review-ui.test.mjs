import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const helperPath = join(import.meta.dirname, '..', 'apps/admin/src/lib/publication-review.mjs');
async function helpers() {
  assert.equal(existsSync(helperPath), true, 'review readiness guard is missing');
  return import(pathToFileURL(helperPath).href);
}

test('publish needs a current successful review and disables stale, blocked, unavailable or busy work', async () => {
  const { canPublishReviewedRevision } = await helpers();
  const state = { siteId: 'site1', workingRevision: 9, publishedRevision: 7, hasUnpublishedChanges: true, latestPublication: null, rebuild: null };
  const review = { siteId: 'site1', workingRevision: 9, publishedRevision: 7, validation: { outcome: 'PASSED' } };
  assert.equal(canPublishReviewedRevision(state, review), true);
  assert.equal(canPublishReviewedRevision(state, { ...review, validation: { outcome: 'PASSED_WITH_WARNINGS' } }), true);
  assert.equal(canPublishReviewedRevision(state, { ...review, workingRevision: 8 }), false);
  assert.equal(canPublishReviewedRevision(state, { ...review, validation: { outcome: 'BLOCKED' } }), false);
  assert.equal(canPublishReviewedRevision(state, null), false);
  assert.equal(canPublishReviewedRevision(state, review, { unavailable: true }), false);
  assert.equal(canPublishReviewedRevision(state, review, { busy: true }), false);
  assert.equal(canPublishReviewedRevision({ ...state, hasUnpublishedChanges: false }, review), false);
  assert.equal(canPublishReviewedRevision({ ...state, latestPublication: { status: 'RUNNING' } }, review), false);
  assert.equal(canPublishReviewedRevision({ ...state, publishedRevision: 8 }, { ...review, publishedRevision: 7 }), false);
  assert.equal(canPublishReviewedRevision({ ...state, siteId: 'a' }, { ...review, siteId: 'b' }), false);
});

test('change descriptions use editorial names and do not turn a save record into a published claim', async () => {
  const { publicationChangeLabel } = await helpers();
  assert.equal(publicationChangeLabel({ entityType: 'SITE', changedFields: ['seoTemplate'] }), 'SEO-шаблоны');
  assert.equal(publicationChangeLabel({ entityType: 'CITY' }), 'Город');
  assert.equal(publicationChangeLabel({ entityType: 'PAGE_TEMPLATE' }), 'Шаблон страницы');
  assert.equal(publicationChangeLabel({ entityType: 'UNKNOWN_DATABASE_ENUM' }), 'Содержимое сайта');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('incomplete HOME preview exposes its exact editable field without substituting demo content', async () => {
  const { previewContentIssue } = await import('../apps/admin/src/lib/preview-content-issue.mjs');
  const api = previewContentIssue({ payload: { block: 'home.faq', field: 'items', reason: 'REQUIRED' } }, 'site-1');
  assert.match(api.heading, /FAQ|Вопрос/);
  assert.ok(api.field);
  const url = new URL(api.href, 'https://admin.example.test');
  assert.equal(url.pathname, '/templates/home'); assert.equal(url.searchParams.get('siteId'), 'site-1');
  assert.equal(url.searchParams.get('kind'), 'HOME'); assert.equal(url.searchParams.get('block'), 'home.faq'); assert.equal(url.searchParams.get('field'), 'items');
  const renderer = previewContentIssue({ block: 'home.provider_about', field: 'evidence.research.sourceUrl' }, 'site-1');
  assert.equal(new URL(renderer.href, 'https://admin.example.test').searchParams.get('field'), 'evidence.research.sourceUrl');
  for (const raw of [null, {}, new Error('Сеть недоступна'), { payload: { field: 'items' } }]) assert.equal(previewContentIssue(raw, 'site-1'), null);
  const unknown = previewContentIssue({ block: 'invented.block', field: 'javascript:alert(1)' }, 'site-1');
  assert.equal(unknown, null);
});

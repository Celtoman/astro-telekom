import { test } from 'node:test';
import assert from 'node:assert/strict';

test('editor links select only an authorized site and preserve honest multi-site selection', async () => {
  const { editorSiteId } = await import('../apps/admin/src/lib/editor-context.mjs');
  const sites = [{ id: 'site-a' }, { id: 'site-b' }];
  assert.equal(editorSiteId(sites, '?kind=CITY_HOME&siteId=site-b'), 'site-b');
  assert.equal(editorSiteId(sites, '?siteId=foreign-site'), '');
  assert.equal(editorSiteId(sites, ''), '');
  assert.equal(editorSiteId([sites[0]], '?siteId=foreign-site'), 'site-a');
  assert.equal(editorSiteId([], '?siteId=site-a'), '');
});

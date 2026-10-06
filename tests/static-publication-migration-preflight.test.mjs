import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationHtmlContract } from '../scripts/static-publication-migration-preflight.mjs';

const html = '<html><head><title>Тариф</title><meta name="description" content="Интернет"><link rel="canonical" href="https://example.test/kazan"></head><body><h1>Интернет</h1><a href="/kazan">Казань</a><p>700 &#8381;</p><script>private()</script></body></html>';
test('migration compares complete rendered content, SEO and links while ignoring code asset scopes', () => {
  assert.deepEqual(migrationHtmlContract(html), migrationHtmlContract(html.replace('<h1>', '<h1 class="astro-new">').replace('private()', 'newCode()')));
  for (const [oldValue, newValue] of [['700', '9999'], ['content="Интернет"', 'content="Другое"'], ['href="/kazan"', 'href="/moscow"'], ['<title>Тариф', '<title>Черновик']]) {
    assert.notDeepEqual(migrationHtmlContract(html), migrationHtmlContract(html.replace(oldValue, newValue)));
  }
  assert.throws(() => migrationHtmlContract('<html></html>'), /body/);
});

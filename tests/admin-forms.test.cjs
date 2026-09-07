const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

test('admin forms reset successfully after the browser clears event.currentTarget', async () => {
  const source = readFileSync(join(__dirname, '..', 'apps', 'admin', 'src', 'pages', 'index.astro'), 'utf8');
  const script = source.match(/<script define:vars=\{\{ apiUrl \}\}>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const calls = [];
  const document = { createElement: () => ({ append() {} }), querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, { textContent: '', className: '', dataset: {}, querySelector() { return { textContent: 'Добавить' }; }, click() {}, append() {} });
    return elements.get(selector);
  } };
  vm.runInNewContext(script, {
    document, apiUrl: 'http://example.invalid',
    localStorage: { getItem: () => '', setItem() {} },
    FormData: class { entries() { return [['name', 'Тест'], ['slug', 'test'], ['seoTitle', ' Новый Title '], ['seoDescription', '']]; } },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: 'created' }) }; },
  });
  for (const selector of ['#cityForm', '#regionForm', '#pageForm', '#tariffForm']) {
    let resets = 0;
    document.querySelector(selector).reset = () => { resets++; };
    const event = { preventDefault() {}, currentTarget: document.querySelector(selector) };
    const submitted = document.querySelector(selector).onsubmit(event);
    event.currentTarget = null;
    await submitted;
    assert.equal(resets, 1, selector);
    assert.equal(document.querySelector('#status').className, 'status success', selector);
    assert.equal(calls.at(-1).options.method, 'POST');
    if (selector !== '#regionForm') {
      const payload = JSON.parse(calls.at(-1).options.body);
      assert.deepEqual(payload.seo, { title: 'Новый Title' });
      assert.equal(payload.seoTitle, undefined);
      assert.equal(payload.seoDescription, undefined);
    }
    document.querySelector(selector).dataset.recordId = 'existing';
    await document.querySelector(selector).onsubmit({ preventDefault() {} });
    assert.equal(calls.at(-1).options.method, 'PATCH');
    assert.ok(calls.at(-1).url.endsWith('/existing'));
    assert.equal(document.querySelector(selector).dataset.recordId, undefined);
  }
});


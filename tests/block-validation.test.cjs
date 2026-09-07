const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateBlock } = require('../apps/api/dist/block-validation.js');
const base = { blockType: 'hero', position: 10, data: { title: 'Заголовок' } };
test('valid blocks and partial visibility updates are accepted', () => {
  validateBlock(base);
  validateBlock({ visible: false }, true);
  for (const ctaHref of ['/kazan/', '#tariffs', 'https://example.com/']) validateBlock({ ...base, data: { ctaHref } });
});
test('invalid block shape and attempts to change its parent are rejected', () => {
  for (const body of [null, [], { ...base, pageId: 'another-page' }, { ...base, position: 1.5 }, { ...base, blockType: 'unknown' }, { ...base, data: null }, { ...base, data: { title: {} } }]) {
    assert.throws(() => validateBlock(body), error => error.getStatus() === 400);
  }
});
test('executable and protocol-relative CTA links are rejected', () => {
  for (const ctaHref of ['javascript:alert(1)', 'data:text/html,test', '//example.com/', '/\\example.com', 'java\nscript:alert(1)']) {
    assert.throws(() => validateBlock({ ...base, data: { ctaHref } }), error => error.getStatus() === 400);
  }
});

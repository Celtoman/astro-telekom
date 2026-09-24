import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordSessionPage, sessionForLead } from '../apps/web/src/lib/session-attribution.mjs';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('first touch persists across page navigation while last touch and unique path change', () => {
  const tab = storage();
  recordSessionPage(tab, 'https://example.test/?utm_source=search&token=private#part', 'https://search.test/?q=private', 1_000);
  recordSessionPage(tab, 'https://example.test/kazan?utm_source=campaign&token=private', 'https://example.test/', 31_000);
  const result = sessionForLead(tab, 'https://example.test/kazan?utm_source=campaign&token=private', 'https://example.test/', 61_000);
  assert.equal(result.firstTouch.url, 'https://example.test/?utm_source=search');
  assert.equal(result.firstTouch.referrer, 'https://search.test/');
  assert.deepEqual(result.firstTouch.utm, { utm_source: 'search' });
  assert.equal(result.lastTouch.url, 'https://example.test/kazan?utm_source=campaign');
  assert.deepEqual(result.lastTouch.utm, { utm_source: 'campaign' });
  assert.deepEqual(result.viewedPages, ['/', '/kazan']);
  assert.equal(result.timeOnSiteSeconds, 60);
  assert.deepEqual(sessionForLead(storage(), 'https://example.test/other', '', 61_000).viewedPages, ['/other']);
});

test('route list remains bounded to 50 unique paths and storage failure preserves current page', () => {
  const tab = storage();
  for (let i = 0; i < 55; i += 1) recordSessionPage(tab, `https://example.test/${i}`, '', i * 1_000);
  const result = sessionForLead(tab, 'https://example.test/54', '', 55_000);
  assert.equal(result.viewedPages.length, 50);
  assert.equal(result.viewedPages[0], '/0');
  assert.equal(result.viewedPages.at(-1), '/49');
  const failing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(sessionForLead(failing, 'https://example.test/current', '', 5_000).viewedPages, ['/current']);
});

test('oversized multibyte attribution still produces a valid lead session', () => {
  const keys = ['utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic'];
  const query = keys.map((key) => `${key}=${encodeURIComponent('Я'.repeat(256))}`).join('&');
  const tab = storage();
  const href = `https://example.test/путь?${query}`;
  const referrer = `https://source.test/${'Я'.repeat(1_000)}`;
  recordSessionPage(tab, href, referrer, 1_000);
  const result = sessionForLead(tab, href, referrer, 2_000);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).length <= 20_480);
  assert.equal(result.firstTouch.url, 'https://example.test/');
  assert.equal(result.lastTouch.url, 'https://example.test');
  assert.deepEqual(result.viewedPages, ['/%D0%BF%D1%83%D1%82%D1%8C']);
});

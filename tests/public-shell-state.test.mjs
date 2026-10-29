import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { publicShellBootstrap, applySubscriberPhone } from '../apps/web/src/lib/public-shell-state.mjs';

const cities = [{ id: 'msk', slug: 'moscow', name: 'Москва' }, { id: 'kzn', slug: 'kazan', name: 'Казань' }];
function fixture({ route = '', selected = 'kzn', expires = String(Date.now() + 60000), blocked = false } = {}) {
  const attributes = new Map(), removed = [];
  let writes = 0, text = '8-800-555-72-44';
  const value = { get textContent() { return text; }, set textContent(next) { writes++; text = next; } };
  const caption = { textContent: 'Подключение, 8:00–22:00' }, label = { textContent: 'Москва' };
  const phoneAttrs = new Map([['data-support-phone', '8-800-250-77-77'], ['data-support-phone-href', 'tel:88002507777'], ['href', 'tel:88005557244']]);
  const phone = { getAttribute: key => phoneAttrs.get(key), setAttribute: (key, val) => phoneAttrs.set(key, val), querySelector: selector => selector === '[data-phone-value]' ? value : caption };
  const service = { tagName: 'A', dataset: { cityContextService: 'internet' }, setAttribute: (key, val) => { service[key] = val; }, removeAttribute() {} };
  const header = { dataset: { routeCity: route }, hasAttribute: key => key === 'data-site-header', querySelectorAll: selector => selector === '.subscriber-phone' ? [phone] : selector === '[data-current-city-label]' ? [label] : [service] };
  const storage = val => ({ getItem() { if (blocked) throw Error('blocked'); return val; }, removeItem(key) { removed.push(key); } });
  const context = { window: {}, document: { documentElement: { setAttribute: (k, v) => attributes.set(k, v), removeAttribute: k => attributes.delete(k) } }, sessionStorage: storage(selected), localStorage: storage(expires), Date };
  runInNewContext(publicShellBootstrap(cities, 'domru-site'), context);
  return { context, attributes, header, phone, phoneAttrs, value, caption, label, service, removed, writes: () => writes };
}

test('parser-time shell preparation restores confirmed city and subscriber phone together', () => {
  const f = fixture();
  assert.equal(f.attributes.has('data-public-shell-pending'), true);
  f.context.window.__domruPublicShell.prepare(f.header);
  assert.equal(f.attributes.has('data-public-shell-pending'), false);
  assert.equal(f.label.textContent, 'Казань');
  assert.equal(f.value.textContent, '8-800-250-77-77');
  assert.equal(f.phoneAttrs.get('href'), 'tel:88002507777');
  assert.equal(f.caption.textContent, 'Техподдержка');
  assert.equal(f.service.href, '/kazan?category=INTERNET#tariffs');
  applySubscriberPhone(f.header);
  assert.equal(f.writes(), 1, 'late initialization must not rewrite already prepared text');
});

test('route context wins; expired and unavailable storage preserve safe server behavior', () => {
  const expired = fixture({ route: 'moscow', expires: '1' });
  expired.context.window.__domruPublicShell.prepare(expired.header);
  assert.equal(expired.label.textContent, 'Москва');
  assert.equal(expired.value.textContent, '8-800-555-72-44');
  assert.deepEqual(expired.removed, ['provider_subscriber_mode_expires_at']);
  const blocked = fixture({ blocked: true });
  blocked.context.window.__domruPublicShell.prepare(blocked.header);
  assert.equal(blocked.label.textContent, 'Москва');
  assert.equal(blocked.value.textContent, '8-800-555-72-44');
  assert.equal(blocked.attributes.has('data-public-shell-pending'), false);
});

test('bootstrap treats city labels as data and rejects invalid city slugs', () => {
  const script = publicShellBootstrap([{ id: 'x', slug: 'kazan', name: '</script><script>alert(1)</script>' }, { id: 'bad', slug: '../private', name: 'Bad' }], 'site');
  assert.doesNotMatch(script, /<\/script>|\.\.\/private/);
  assert.match(script, /\\u003c/);
});

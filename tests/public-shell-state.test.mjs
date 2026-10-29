import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { publicShellBootstrap, applySubscriberPhone } from '../apps/web/src/lib/public-shell-state.mjs';

const cities = [{ id: 'msk', slug: 'moscow', name: 'Москва' }, { id: 'kzn', slug: 'kazan', name: 'Казань' }];
function fixture({ route = '', selected = 'kzn', expires = String(Date.now() + 60000), blocked = false, readOnly = false, fonts, fontChoice } = {}) {
  const attributes = new Map(), removed = [];
  let writes = 0, text = '8-800-555-72-44';
  const value = { get textContent() { return text; }, set textContent(next) { writes++; text = next; } };
  const caption = { textContent: 'Подключение, 8:00–22:00' }, label = { textContent: 'Москва' };
  const phoneAttrs = new Map([['data-support-phone', '8-800-250-77-77'], ['data-support-phone-href', 'tel:88002507777'], ['href', 'tel:88005557244']]);
  const phone = { getAttribute: key => phoneAttrs.get(key), setAttribute: (key, val) => phoneAttrs.set(key, val), querySelector: selector => selector === '[data-phone-value]' ? value : caption };
  const service = { tagName: 'A', dataset: { cityContextService: 'internet' }, setAttribute: (key, val) => { service[key] = val; }, removeAttribute() {} };
  const header = { dataset: { routeCity: route }, hasAttribute: key => key === 'data-site-header', querySelectorAll: selector => selector === '.subscriber-phone' ? [phone] : selector === '[data-current-city-label]' ? [label] : [service] };
  const session = new Map([['provider:domru-site:selected-city', selected], ['provider:domru-site:shell-font', fontChoice]]);
  const local = new Map([['provider_subscriber_mode_expires_at', expires]]), timers = new Map();
  const storage = values => ({ getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) ?? null; }, removeItem(key) { removed.push(key); values.delete(key); }, setItem(key, val) { if (blocked || readOnly) throw Error('blocked'); values.set(key, val); } });
  const context = { window: {}, document: { fonts, documentElement: { setAttribute: (k, v) => attributes.set(k, v), removeAttribute: k => attributes.delete(k) } }, sessionStorage: storage(session), localStorage: storage(local), Date,
    setTimeout: fn => { timers.set(1, fn); return 1; }, clearTimeout: id => timers.delete(id) };
  runInNewContext(publicShellBootstrap(cities, 'domru-site'), context);
  return { context, attributes, header, phone, phoneAttrs, value, caption, label, service, removed, session, timers, writes: () => writes };
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

test('shell keeps prepared data hidden until its complete font family is ready', async () => {
  let resolve, calls = 0;
  const loading = new Promise(done => { resolve = done; });
  const f = fixture({ fonts: { load() { calls++; return loading; } } });
  f.context.window.__domruPublicShell.prepare(f.header);
  assert.equal(f.value.textContent, '8-800-250-77-77');
  assert.equal(f.attributes.has('data-public-shell-pending'), false);
  assert.equal(f.attributes.has('data-public-shell-fonts-pending'), true);
  f.context.window.__domruPublicShell.prepare(f.header);
  assert.equal(calls, 1);
  resolve([{}, {}]);
  await new Promise(setImmediate);
  assert.equal(f.attributes.has('data-public-shell-fonts-pending'), false);
  assert.equal(f.attributes.has('data-public-shell-fonts-fallback'), false);
  assert.equal(f.timers.size, 0);
});

test('font failure and timeout preserve the same fallback on following navigations', async () => {
  for (const failure of ['rejected', 'empty', 'timeout']) {
    let resolve;
    const loading = failure === 'rejected' ? Promise.reject(Error('unavailable'))
      : failure === 'empty' ? Promise.resolve([]) : new Promise(done => { resolve = done; });
    const f = fixture({ fonts: { load: () => loading } });
    f.context.window.__domruPublicShell.prepare(f.header);
    if (failure === 'timeout') f.timers.get(1)();
    await new Promise(setImmediate);
    assert.equal(f.attributes.has('data-public-shell-fonts-pending'), false);
    assert.equal(f.attributes.has('data-public-shell-fonts-fallback'), true);
    assert.equal(f.session.get('provider:domru-site:shell-font'), 'fallback');
    if (resolve) { resolve([{}, {}]); await new Promise(setImmediate); }
    assert.equal(f.attributes.has('data-public-shell-fonts-fallback'), true, 'late success cannot change visible metrics');
    const next = fixture({ fontChoice: 'fallback', fonts: { load() { assert.fail('fallback must stay stable for the tab'); } } });
    next.context.window.__domruPublicShell.prepare(next.header);
    assert.equal(next.attributes.has('data-public-shell-fonts-pending'), false);
    assert.equal(next.attributes.has('data-public-shell-fonts-fallback'), true);
  }
  for (const options of [{ blocked: true }, { readOnly: true }]) {
    for (let navigation = 0; navigation < 2; navigation++) {
      const f = fixture({ ...options, fonts: { load() { assert.fail('unwritable storage must use stable fallback immediately'); } } });
      f.context.window.__domruPublicShell.prepare(f.header);
      assert.equal(f.attributes.has('data-public-shell-fonts-pending'), false);
      assert.equal(f.attributes.has('data-public-shell-fonts-fallback'), true);
      assert.equal(f.timers.size, 0);
    }
  }
});

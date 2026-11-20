import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const moduleUrl = (name) => pathToFileURL(join(root, 'apps', 'admin', 'src', 'lib', name)).href;
const source = (name) => readFileSync(join(root, 'apps', 'admin', 'src', 'components', name), 'utf8');

test('editorial navigation uses one context and resets the indicator when leaving legacy workspaces', async () => {
  const {publicationScope}=await import(moduleUrl('publication-indicator.mjs'));
  for(const section of ['news','news-categories','pages-news','pages-not-found'])assert.equal(publicationScope(section),'editorial');
  for(const section of ['overview','tariffs','publication','templates'])assert.equal(publicationScope(section),'legacy');
});

test('global indicator resolves only an unambiguous site and bounds active polling', async () => {
  const { resolvePublicationSite, publicationRefreshDelay } = await import(moduleUrl('publication-indicator.mjs'));
  const site = { id: 'site-1', name: 'Дом.ру' };
  assert.equal(resolvePublicationSite([site]), site);
  assert.equal(resolvePublicationSite([]), null);
  assert.equal(resolvePublicationSite([site, { id: 'site-2' }]), null);
  assert.equal(publicationRefreshDelay(null), null);
  assert.equal(publicationRefreshDelay({ latestPublication: null }), null);
  assert.equal(publicationRefreshDelay({ latestPublication: { status: 'PENDING' } }), 3000);
  assert.equal(publicationRefreshDelay({ latestPublication: { status: 'RUNNING' } }), 3000);
  assert.equal(publicationRefreshDelay({ latestPublication: { status: 'SUCCEEDED' } }), null);
  assert.equal(publicationRefreshDelay({ latestPublication: { status: 'FAILED' } }), null);
});

test('publication presentation prioritizes failure and active work over unsaved publication gap', async () => {
  const { describePublicationState } = await import(moduleUrl('publication-display.mjs'));
  const base = { workingRevision: 8, publishedRevision: 5, hasUnpublishedChanges: true, rebuild: null };
  assert.equal(describePublicationState({ ...base, latestPublication: { id: 'old', siteRevision: 7, status: 'RUNNING' } }).kind, 'publishing');
  assert.equal(describePublicationState({ ...base, latestPublication: { id: 'old', siteRevision: 7, status: 'FAILED' }, rebuild: { status: 'RUNNING', requestedPublicationId: 'old' } }).kind, 'failed');
});

test('successful content mutations notify the shell; reads, validation, leads and failed requests do not', async () => {
  const { requestJson } = await import(moduleUrl('admin-api.mjs'));
  const events = [];
  const previousWindow = globalThis.window;
  const previousEvent = globalThis.Event;
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.Event = class { constructor(type) { this.type = type; } };
  const ok = async () => ({ ok: true, json: async () => ({ workingRevision: 7 }) });
  const failed = async () => ({ ok: false, status: 409, json: async () => ({ message: 'Конфликт' }) });
  try {
    await requestJson('https://api.example', '/admin/cities/one', { method: 'PATCH', body: {} }, ok);
    await requestJson('https://api.example', '/admin/sites/site-1/publications', { method: 'POST', body: {} }, ok);
    await requestJson('https://api.example', '/admin/sites', {}, ok);
    await requestJson('https://api.example', '/admin/cities/import/validate', { method: 'POST', body: {} }, ok);
    await requestJson('https://api.example', '/crm/leads/one/status', { method: 'PATCH', body: {} }, ok);
    await assert.rejects(requestJson('https://api.example', '/admin/tariffs/one', { method: 'PATCH', body: {} }, failed));
    assert.deepEqual(events.filter(type => type === 'admin:publication-changed'), ['admin:publication-changed', 'admin:publication-changed']);
    assert.equal(events.filter(type => type === 'admin:navigation-invalidated').length, 5, 'every completed mutation, including a failed/uncertain write, invalidates display data');
  } finally {
    globalThis.window = previousWindow;
    globalThis.Event = previousEvent;
  }
});

test('indicator lives in the common shell and exposes read-only desktop/mobile details', () => {
  const shell = source('AdminShell.tsx');
  const indicator = source('PublicationIndicator.tsx');
  assert.match(shell, /<PublicationIndicator[^>]*apiUrl=\{apiUrl\}/);
  assert.match(indicator, /\/admin\/sites/);
  const state = readFileSync(fileURLToPath(moduleUrl('publication-state.mjs')), 'utf8');
  assert.match(indicator, /usePublicationState/);
  assert.match(source('PublicationStatusCard.tsx'), /usePublicationState/);
  assert.match(state, /publication-state/);
  assert.match(indicator, /describePublicationState/);
  assert.match(indicator, /Статус публикации недоступен/);
  assert.match(indicator, /Рабочая версия/);
  assert.match(indicator, /На сайте/);
  assert.match(indicator, /lastError/);
  assert.match(indicator, /bg-background[^"\n]*text-foreground/);
  assert.match(state, /"focus", refreshVisible/);
  assert.match(state, /admin:publication-changed/);
  assert.doesNotMatch(source("PublicationStatusCard.tsx"), /setInterval/);
  assert.doesNotMatch(indicator, /method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
});


function publicationStateHarness(createPublicationStateStore) {
  const browser = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const timers = new Map();
  let nextTimer = 0;
  browser.setTimeout = (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer; };
  browser.clearTimeout = id => timers.delete(id);
  const requests = [];
  const store = createPublicationStateStore({
    browser, document,
    load: (base, siteId) => new Promise((resolve, reject) => requests.push({ base, siteId, resolve, reject })),
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const runTimer = async delay => {
    const [id, entry] = [...timers].find(([, item]) => item.delay === delay) ?? [];
    assert.ok(entry, `expected a ${delay} ms polling timer`);
    timers.delete(id);
    entry.fn();
    await flush();
  };
  return { browser, document, timers, requests, store, flush, runTimer };
}

const apiUrl = 'https://api.example';
const running = { workingRevision: 7, latestPublication: { id: 'pub-1', status: 'RUNNING' } };
const finished = { workingRevision: 7, publishedRevision: 7, latestPublication: { id: 'pub-1', status: 'SUCCEEDED' } };

test('one publication status request and timer serve the first and subsequent subscribers of a site', async () => {
  const { createPublicationStateStore } = await import(moduleUrl('publication-state.mjs'));
  const h = publicationStateHarness(createPublicationStateStore);
  const observed = [];
  const subscribe = (base = apiUrl, id = 'site-1') => h.store.subscribe(base, id, () => observed.push(h.store.getSnapshot(base, id)));
  const unmount = subscribe();
  const unmountCard = subscribe(`${apiUrl}/`);
  await h.flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0, 'no timer while an HTTP request is in flight');
  h.requests[0].resolve(running);
  await h.flush();
  assert.equal(observed.length, 2);
  assert.equal(h.timers.size, 1);

  const unmountNewCard = subscribe();
  await h.flush();
  assert.equal(h.requests.length, 1, 'mount after the first response reads the existing snapshot');
  assert.equal(h.store.getSnapshot(apiUrl, 'site-1').publication, running);

  await h.runTimer(3000);
  assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 0);
  h.browser.dispatchEvent(new Event('focus'));
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(finished);
  await h.flush();
  assert.equal(h.timers.size, 0, 'polling stops when publication succeeds');

  unmount(); unmountCard(); unmountNewCard();
  assert.equal(h.store.getSnapshot(apiUrl, 'site-1').publication, null);
});

test('publication changes invalidate older in-flight reads and coalesce follow-up refreshes', async () => {
  const { createPublicationStateStore } = await import(moduleUrl('publication-state.mjs'));
  const h = publicationStateHarness(createPublicationStateStore);
  const observed = [];
  const unsubscribe = h.store.subscribe(apiUrl, 'site-1', () => observed.push(h.store.getSnapshot(apiUrl, 'site-1')));
  await h.flush();
  h.browser.dispatchEvent(new Event('admin:publication-changed'));
  h.browser.dispatchEvent(new Event('admin:publication-refresh'));
  await h.flush();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(running);
  await h.flush();
  assert.equal(h.requests.length, 2);
  assert.ok(observed.every(next => next.publication !== running));
  h.requests[1].resolve(finished);
  await h.flush();
  assert.equal(h.store.getSnapshot(apiUrl, 'site-1').publication, finished);
  unsubscribe();
});

test('publication polling pauses in the background and retries the latest public state after a network failure', async () => {
  const { createPublicationStateStore } = await import(moduleUrl('publication-state.mjs'));
  const h = publicationStateHarness(createPublicationStateStore);
  const unsubscribe = h.store.subscribe(apiUrl, 'site-1', () => {});
  await h.flush();
  h.requests[0].resolve(running);
  await h.flush();
  h.document.visibilityState = 'hidden';
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.timers.size, 0);

  h.document.visibilityState = 'visible';
  h.document.dispatchEvent(new Event('visibilitychange'));
  h.browser.dispatchEvent(new Event('focus'));
  await h.flush();
  assert.equal(h.requests.length, 2);
  h.requests[1].reject(new Error('Сеть недоступна'));
  await h.flush();
  assert.deepEqual(h.store.getSnapshot(apiUrl, 'site-1'), { status: 'error', publication: running, error: 'Сеть недоступна' });
  await h.runTimer(5000);
  h.requests[2].resolve(finished);
  await h.flush();
  assert.equal(h.store.getSnapshot(apiUrl, 'site-1').error, null);
  assert.equal(h.timers.size, 0);

  await Promise.all([h.store.refresh(apiUrl, 'unknown'), h.store.refresh(apiUrl, 'unknown2')]);
  assert.equal(h.requests.length, 3);
  unsubscribe();
});

test('publication status is isolated by site and discarded when the operator session changes', async () => {
  const { createPublicationStateStore } = await import(moduleUrl('publication-state.mjs'));
  const h = publicationStateHarness(createPublicationStateStore);
  const unsubscribe = ['site-1', 'site-2'].map(siteId => h.store.subscribe(apiUrl, siteId, () => {}));
  await h.flush();
  assert.deepEqual(h.requests.map(item => item.siteId), ['site-1', 'site-2']);
  h.requests[0].resolve(running);
  await h.flush();
  assert.equal(h.store.getSnapshot(apiUrl, 'site-2').publication, null);
  h.browser.dispatchEvent(new Event('admin:session-changed'));
  h.requests[1].resolve(finished);
  await h.flush();
  assert.equal(h.store.getSnapshot(apiUrl, 'site-1').publication, null);
  assert.equal(h.store.getSnapshot(apiUrl, 'site-2').publication, null);
  assert.equal(h.timers.size, 0);
  unsubscribe.forEach(stop => stop());
});

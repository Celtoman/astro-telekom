import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const moduleUrl = (name) => pathToFileURL(join(root, 'apps', 'admin', 'src', 'lib', name)).href;
const source = (name) => readFileSync(join(root, 'apps', 'admin', 'src', 'components', name), 'utf8');

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
    assert.deepEqual(events, ['admin:publication-changed', 'admin:publication-changed']);
  } finally {
    globalThis.window = previousWindow;
    globalThis.Event = previousEvent;
  }
});

test('indicator lives in the common shell and exposes read-only desktop/mobile details', () => {
  const shell = source('AdminShell.tsx');
  const indicator = source('PublicationIndicator.tsx');
  assert.match(shell, /<PublicationIndicator apiUrl=\{apiUrl\}/);
  assert.match(indicator, /\/admin\/sites/);
  assert.match(indicator, /publication-state/);
  assert.match(indicator, /describePublicationState/);
  assert.match(indicator, /Статус публикации недоступен/);
  assert.match(indicator, /Рабочая версия/);
  assert.match(indicator, /На сайте/);
  assert.match(indicator, /lastError/);
  assert.match(indicator, /bg-background[^"\n]*text-foreground/);
  assert.match(indicator, /window\.addEventListener\("focus"/);
  assert.match(indicator, /admin:publication-changed/);
  assert.doesNotMatch(indicator, /method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
});

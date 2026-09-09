import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('tariffs route mounts the authenticated React workspace and is linked from the shell', () => {
  const routePath = join(adminRoot, 'pages', 'tariffs.astro');
  assert.equal(existsSync(routePath), true, 'tariffs route must exist');
  assert.match(readFileSync(routePath, 'utf8'), /<TariffsApp[^>]+client:load/);

  const shell = readFileSync(join(adminRoot, 'components', 'AdminShell.tsx'), 'utf8');
  assert.match(shell, /href=["']\/tariffs["']/);
  const tariffNavigation = shell.split('\n').find((line) => line.includes('href="/tariffs"'));
  assert.ok(tariffNavigation);
  assert.doesNotMatch(tariffNavigation, /disabled/);
});

test('tariff workspace implements list, validation report, atomic apply and rebuild status', () => {
  const source = readFileSync(join(adminRoot, 'components', 'TariffsApp.tsx'), 'utf8');
  for (const endpoint of [
    '/admin/providers',
    '/admin/tariffs',
    '/admin/tariffs/imports',
    '/admin/tariffs/import/validate',
    '/admin/tariffs/import/apply',
    '/admin/rebuilds',
  ]) assert.ok(source.includes(endpoint), `missing ${endpoint} integration`);

  assert.match(source, /accept=["']\.xlsx["']/);
  assert.match(source, /confirmWarnings/);
  assert.match(source, /report\.diff/);
  assert.match(source, /report\.issues/);
  assert.doesNotMatch(source, /x-admin-token|Authorization|sessionStorage|localStorage/);
});

test('shared admin API client always sends the cookie and preserves API errors', async () => {
  const clientPath = join(adminRoot, 'lib', 'admin-api.mjs');
  assert.equal(existsSync(clientPath), true, 'shared API client must exist');
  const { AdminApiError, requestJson } = await import(pathToFileURL(clientPath));
  const calls = [];
  const success = await requestJson('http://api.test/api/v1/', '/admin/tariffs', {}, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify([{ id: 'tariff-1' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(success, [{ id: 'tariff-1' }]);
  assert.equal(calls[0].url, 'http://api.test/api/v1/admin/tariffs');
  assert.equal(calls[0].options.credentials, 'include');

  await assert.rejects(
    requestJson('http://api.test/api/v1', '/admin/tariffs/import/apply', { method: 'POST', body: { runId: 'run-1' } }, async () => (
      new Response(JSON.stringify({ message: 'Нельзя применить импорт с ошибками' }), { status: 400, headers: { 'content-type': 'application/json' } })
    )),
    (error) => error instanceof AdminApiError && error.status === 400 && error.message === 'Нельзя применить импорт с ошибками',
  );
});

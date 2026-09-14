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

test('tariff catalog and full-snapshot import are separate nested workspaces', () => {
  const catalog = readFileSync(join(adminRoot, 'components', 'TariffsApp.tsx'), 'utf8');
  const importPath = join(adminRoot, 'components', 'TariffImportApp.tsx');
  const importRoute = join(adminRoot, 'pages', 'tariffs', 'import.astro');
  assert.equal(existsSync(importPath), true);
  assert.equal(existsSync(importRoute), true);
  assert.match(readFileSync(importRoute, 'utf8'), /<TariffImportApp[^>]+client:load/);
  assert.match(catalog, /URLSearchParams/);
  assert.match(catalog, /nextCursor/);
  assert.match(catalog, /ServerPagination/);
  assert.doesNotMatch(catalog, /import\/validate|accept=["']\.xlsx["']|confirmWarnings|report\.diff/);

  const importer = readFileSync(importPath, 'utf8');
  for (const endpoint of ['/admin/providers', '/admin/tariffs/imports', '/admin/tariffs/import/validate', '/admin/tariffs/import/apply']) {
    assert.ok(importer.includes(endpoint), `missing ${endpoint} integration`);
  }
  assert.match(importer, /PublicationStatusCard/);
  assert.match(importer, /provider\.sites|\.sites\.map/);
  assert.match(importer, /publicationRefreshKey/);
  assert.doesNotMatch(importer, /\/admin\/rebuilds/);
  assert.match(importer, /accept=["']\.xlsx["']/);
  assert.match(importer, /confirmWarnings/);
  assert.match(importer, /report\.diff/);
  assert.match(importer, /report\.issues/);
  assert.match(importer, /selectedProviderId/);
  assert.match(importer, /Выберите провайдера/);
  assert.match(importer, /const selectionGeneration = useRef\(0\)/);
  assert.match(importer, /const generation = selectionGeneration\.current/);
  assert.match(importer, /selectionGeneration\.current !== generation/);
  assert.match(importer, /const fileInput = useRef<HTMLInputElement>\(null\)/);
  assert.match(importer, /fileInput\.current\.value = ""/);
  assert.match(importer, /<Input ref=\{fileInput\} type="file"/);
  assert.match(importer, /value=\{selectedProviderId\} disabled=\{busy !== null\}/);
  assert.match(importer, /type="file" accept="\.xlsx" disabled=\{!selectedProviderId \|\| busy !== null\}/);
  assert.doesNotMatch(importer, /const provider\s*=\s*state\.data\.providers\[0\]/);
  assert.doesNotMatch(`${catalog}\n${importer}`, /x-admin-token|Authorization|sessionStorage|localStorage/);
});

test('tariff workspace provides quick detail and a separate guarded long editor', () => {
  const listSource = readFileSync(join(adminRoot, 'components', 'TariffsApp.tsx'), 'utf8');
  const editorRoute = join(adminRoot, 'pages', 'tariffs', 'edit.astro');
  const editorPath = join(adminRoot, 'components', 'TariffEditorApp.tsx');
  assert.equal(existsSync(editorRoute), true, 'tariff editor route must exist');
  assert.equal(existsSync(editorPath), true, 'tariff editor component must exist');
  assert.match(readFileSync(editorRoute, 'utf8'), /<TariffEditorApp[^>]+client:load/);
  assert.match(listSource, /\/admin\/tariffs\/\$\{id\}/);
  assert.match(listSource, /Быстрый просмотр/);
  assert.match(listSource, /Рекомендация источника/);
  assert.match(listSource, /\/tariffs\/edit\?id=/);

  const editor = readFileSync(editorPath, 'utf8');
  assert.match(editor, /method:\s*"PATCH"/);
  assert.match(editor, /confirmSensitiveChanges/);
  assert.match(editor, /hasUnsavedChanges/);
  assert.match(editor, /PublicationStatusCard/);
  assert.match(editor, /result\.workingRevision/);
  assert.match(editor, /Рабочая версия/);
  assert.match(editor, /Изменения еще не опубликованы/i);
  assert.doesNotMatch(editor, /\/admin\/rebuilds\/\$\{|setRebuildPollAttempt|result\.publication/);
  assert.match(editor, /attributeSchema/);
  assert.match(editor, /не изменяет статус публикации/);
  assert.match(editor, /form\.attributes\[field\.key\] \?\? ""/);
  for (const field of ['name', 'serviceType', 'standardPrice', 'promoPrice', 'speed', 'promoText', 'connectionFee', 'availability', 'externalId', 'dataSource', 'attributes', 'seo']) {
    assert.ok(editor.includes(field), `editor is missing ${field}`);
  }
  assert.doesNotMatch(editor, /x-admin-token|Authorization|sessionStorage|localStorage/);

  assert.match(listSource, /const detailGeneration = useRef\(0\)/);
  assert.match(listSource, /const generation = \+\+detailGeneration\.current/);
  assert.match(listSource, /detailGeneration\.current === generation/);
  assert.match(listSource, /detailGeneration\.current \+= 1/);
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('city catalog and import have separate static routes', () => {
  const routePath = join(adminRoot, 'pages', 'cities.astro');
  assert.equal(existsSync(routePath), true, 'cities route must exist');
  assert.match(readFileSync(routePath, 'utf8'), /<CitiesApp[^>]+client:load/);

  const importRoutePath = join(adminRoot, 'pages', 'cities', 'import.astro');
  assert.equal(existsSync(importRoutePath), true, 'city import route must exist');
  assert.match(readFileSync(importRoutePath, 'utf8'), /<CityImportApp[^>]+client:load/);

  const cityNavigation = adminNavigation.find((item) => item.id === 'cities');
  assert.equal(cityNavigation?.href, '/cities');
  assert.deepEqual(cityNavigation?.children?.map((item) => item.href), ['/cities', '/cities/import']);
});

test('city catalog loads management controls and links to its separate import workflow', () => {
  const source = readFileSync(join(adminRoot, 'components', 'CitiesApp.tsx'), 'utf8');
  assert.ok(source.includes('/admin/cities'));
  assert.match(source, /href=["']\/cities\/import["']/);
  assert.match(source, /method:\s*["']PATCH["']/);
  assert.match(source, /Управление городом/);
  assert.match(source, /\{selectedCity\s*\?\s*<aside aria-label="Редактирование города"/);
  assert.match(source, /Телефон подключения/);
  assert.match(source, /Техническая поддержка/);
  assert.match(source, /supportPhone:\s*cityForm\.supportPhone\.trim\(\)\s*\|\|\s*null/);
  assert.doesNotMatch(source, /\/admin\/cities\/imports|\/admin\/cities\/import\/validate|\/admin\/cities\/import\/apply|accept=["']\.xlsx["']/);
});

test('city import workspace implements validation report, guarded apply, history and explicit publication', () => {
  const componentPath = join(adminRoot, 'components', 'CityImportApp.tsx');
  assert.equal(existsSync(componentPath), true, 'city import workspace must exist');
  const source = readFileSync(componentPath, 'utf8');
  for (const endpoint of [
    '/admin/sites',
    '/admin/cities/imports',
    '/admin/cities/import/validate',
    '/admin/cities/import/apply',
  ]) assert.ok(source.includes(endpoint), `missing ${endpoint} integration`);

  assert.match(source, /accept=["']\.xlsx["']/);
  assert.match(source, /confirmWarnings/);
  assert.match(source, /report\?\.candidates/);
  assert.match(source, /report\.issues/);
  assert.match(source, /candidate\.changes/);
  assert.match(source, /<select/);
  assert.match(source, /unresolvedActionCount/);
  assert.match(source, /candidate\.key,\s*""/);
  assert.match(source, /body:\s*\{\s*runId,\s*actions,\s*confirmWarnings\s*\}/);
  assert.match(source, /sites\.length\s*!==\s*1/);
  assert.match(source, /PublicationStatusCard/);
  assert.match(source, /publicationRefreshKey/);
  assert.match(source, /canUndo/);
  assert.match(source, /\/admin\/cities\/imports\/\$\{item\.id\}\/undo/);
  assert.match(source, /Отменить импорт/);
  assert.doesNotMatch(source, /\/admin\/rebuilds/);
  assert.doesNotMatch(source, /x-admin-token|Authorization|sessionStorage|localStorage/);
});

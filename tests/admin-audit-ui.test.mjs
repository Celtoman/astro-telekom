import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statusPresentation } from '../apps/admin/src/lib/status-presentation.mjs';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('audit route mounts an authenticated React workspace and is linked from the shell', () => {
  const routePath = join(adminRoot, 'pages', 'audit.astro');
  assert.equal(existsSync(routePath), true, 'audit route must exist');
  assert.match(readFileSync(routePath, 'utf8'), /<AuditApp[^>]+client:load/);

  const item = adminNavigation.find((entry) => entry.id === 'audit');
  assert.deepEqual({ href: item?.href, label: item?.label }, { href: '/audit', label: 'История изменений' });
});

test('audit workspace uses paginated list and detail APIs without unsafe browser credentials', () => {
  const componentPath = join(adminRoot, 'components', 'AuditApp.tsx');
  assert.equal(existsSync(componentPath), true, 'audit workspace must exist');
  const source = readFileSync(componentPath, 'utf8');

  assert.match(source, /\/admin\/audit-events\?/);
  assert.match(source, /\/admin\/audit-events\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(source, /URLSearchParams/);
  assert.match(source, /nextCursor/);
  assert.match(source, /ServerPagination/);
  assert.match(source, /detailGeneration\.current === generation/);
  assert.doesNotMatch(source, /x-admin-token|Authorization|sessionStorage|localStorage|dangerouslySetInnerHTML|\.innerHTML/);
});

test('audit workspace translates entities and actions and explains before and after values', () => {
  const source = readFileSync(join(adminRoot, 'components', 'AuditApp.tsx'), 'utf8');

  for (const value of ['PROVIDER', 'SITE', 'REGION', 'CITY', 'PAGE', 'TARIFF', 'REDIRECT']) {
    assert.equal(statusPresentation('contentEntityType', value).known, true, `missing entity label: ${value}`);
  }
  for (const value of ['CREATE', 'UPDATE', 'IMPORT', 'UNDO', 'ARCHIVE', 'RESTORE']) {
    assert.equal(statusPresentation('contentRevisionAction', value).known, true, `missing action label: ${value}`);
  }
  assert.match(source, /statusPresentation/);
  assert.match(source, /StatusBadge/);
  assert.match(source, /До изменения/);
  assert.match(source, /После изменения/);
  assert.match(source, /Измененные поля/);
});

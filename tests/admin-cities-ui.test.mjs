import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('cities route mounts the authenticated React workspace and is linked from the shell', () => {
  const routePath = join(adminRoot, 'pages', 'cities.astro');
  assert.equal(existsSync(routePath), true, 'cities route must exist');
  assert.match(readFileSync(routePath, 'utf8'), /<CitiesApp[^>]+client:load/);

  const shell = readFileSync(join(adminRoot, 'components', 'AdminShell.tsx'), 'utf8');
  assert.match(shell, /href=["']\/cities["']/);
  const cityNavigation = shell.split('\n').find((line) => line.includes('href="/cities"'));
  assert.ok(cityNavigation);
  assert.doesNotMatch(cityNavigation, /disabled/);
});

test('city workspace implements list, validation report, guarded apply and rebuild status', () => {
  const componentPath = join(adminRoot, 'components', 'CitiesApp.tsx');
  assert.equal(existsSync(componentPath), true, 'city workspace must exist');
  const source = readFileSync(componentPath, 'utf8');
  for (const endpoint of [
    '/admin/sites',
    '/admin/cities',
    '/admin/cities/imports',
    '/admin/cities/import/validate',
    '/admin/cities/import/apply',
    '/admin/rebuilds',
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
  assert.doesNotMatch(source, /x-admin-token|Authorization|sessionStorage|localStorage/);
});

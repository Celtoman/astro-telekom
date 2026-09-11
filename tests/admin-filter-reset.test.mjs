import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const componentsRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src', 'components');

test('every filtered admin catalog uses the shared always-visible reset action without URL or browser persistence', () => {
  const resetPath = join(componentsRoot, 'FilterResetButton.tsx');
  assert.equal(existsSync(resetPath), true, 'shared filter reset action must exist');
  const resetSource = readFileSync(resetPath, 'utf8');
  assert.match(resetSource, /Сбросить фильтры/);
  assert.match(resetSource, /type="button"/);
  assert.match(resetSource, /size="lg"/);
  assert.match(resetSource, /disabled=\{!active\}/);
  assert.match(resetSource, /aria-hidden="true"/);

  for (const component of ['LeadsApp.tsx', 'TariffsApp.tsx', 'CitiesApp.tsx', 'RedirectsApp.tsx']) {
    const source = readFileSync(join(componentsRoot, component), 'utf8');
    assert.match(source, /FilterResetButton/, `${component} must render the shared reset action`);
    assert.match(source, /resetFilters/, `${component} must own an explicit reset handler`);
    assert.doesNotMatch(source, /new URLSearchParams\(window\.location|localStorage|sessionStorage/);
  }
});

test('server-filtered catalogs reset committed filters and cursor pagination', () => {
  const leads = readFileSync(join(componentsRoot, 'LeadsApp.tsx'), 'utf8');
  assert.match(leads, /function resetFilters\(\)\s*\{[^}]*setSearch\(""\)[^}]*setSearchQuery\(""\)[^}]*setStatusFilter\("ALL"\)[^}]*setCursorStack\(\[""\]\)[^}]*\}/);

  const tariffs = readFileSync(join(componentsRoot, 'TariffsApp.tsx'), 'utf8');
  assert.match(tariffs, /function resetFilters\(\)\s*\{[^}]*setSearch\(""\)[^}]*setSearchQuery\(""\)[^}]*setCursorStack\(\[""\]\)[^}]*\}/);
});

test('client-filtered catalogs reset search without clearing edit forms', () => {
  for (const component of ['CitiesApp.tsx', 'RedirectsApp.tsx']) {
    const source = readFileSync(join(componentsRoot, component), 'utf8');
    assert.match(source, /function resetFilters\(\)\s*\{\s*setSearch\(""\)\s*\}/);
  }
});

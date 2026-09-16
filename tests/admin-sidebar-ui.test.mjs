import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');
const navigationPath = join(adminRoot, 'lib', 'admin-navigation.mjs');

async function loadNavigation() {
  assert.equal(existsSync(navigationPath), true, 'shared admin navigation configuration must exist');
  return import(pathToFileURL(navigationPath));
}

test('admin navigation is configuration-driven and opens the active nested group', async () => {
  const { adminNavigation, activeNavigationGroup } = await loadNavigation();
  const tariffs = adminNavigation.find((item) => item.id === 'tariffs');
  const cities = adminNavigation.find((item) => item.id === 'cities');

  assert.deepEqual(tariffs.children.map((item) => item.id), ['tariffs', 'tariffs-import']);
  assert.deepEqual(cities.children.map((item) => item.id), ['cities', 'cities-import']);
  assert.equal(activeNavigationGroup(adminNavigation, 'tariffs-import'), 'tariffs');
  assert.equal(activeNavigationGroup(adminNavigation, 'cities'), 'cities');
  assert.equal(activeNavigationGroup(adminNavigation, 'leads'), null);
});

test('sidebar shortcut supports Ctrl or Cmd+B and ignores editable targets', async () => {
  const { shouldToggleSidebar } = await loadNavigation();

  assert.equal(shouldToggleSidebar({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, targetTag: 'DIV' }), true);
  assert.equal(shouldToggleSidebar({ key: 'B', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, targetTag: 'DIV' }), true);
  assert.equal(shouldToggleSidebar({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, targetTag: 'INPUT' }), false);
  assert.equal(shouldToggleSidebar({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, targetTag: 'DIV', contentEditable: true }), false);
  assert.equal(shouldToggleSidebar({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, targetTag: 'DIV' }), false);
});

test('admin shell uses accessible collapsible desktop and modal mobile navigation', () => {
  const shell = readFileSync(join(adminRoot, 'components', 'AdminShell.tsx'), 'utf8');
  const navigation = readFileSync(join(adminRoot, 'components', 'AdminNavigation.tsx'), 'utf8');
  const navigationConfig = readFileSync(navigationPath, 'utf8');
  const source = `${shell}\n${navigation}\n${navigationConfig}`;

  assert.match(source, /Collapsible/);
  assert.match(source, /Tooltip/);
  assert.match(source, /Dialog\.Root/);
  assert.match(source, /Dialog\.Title/);
  assert.match(source, /aria-label="Разделы админки"/);
  assert.match(source, /Свернуть боковую панель/);
  assert.match(source, /Открыть меню/);
  assert.match(source, /Техническая информация|Закрыть меню/);
  assert.match(source, /admin:sidebar-expanded/);
  assert.match(source, /admin:navigation-groups/);
  assert.match(source, /addEventListener\("keydown"/);
  assert.doesNotMatch(source, /lg:grid-cols-\[240px_1fr\]/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('admin routes use React authentication roots instead of the legacy prompt UI', () => {
  const indexPath = join(root, 'pages', 'index.astro');
  const loginPath = join(root, 'pages', 'login.astro');
  assert.equal(existsSync(loginPath), true, 'login route must exist');
  const index = readFileSync(indexPath, 'utf8');
  assert.match(index, /<AdminApp[^>]+client:load/);
  assert.doesNotMatch(index, /window\.prompt|sessionStorage|x-admin-token/);
  const login = readFileSync(loginPath, 'utf8');
  assert.match(login, /<AdminLogin[^>]+client:load/);
});

test('browser authentication uses credentialed cookie requests and never reads a raw token', () => {
  const authPaths = [
    join(root, 'components', 'AdminApp.tsx'),
    join(root, 'components', 'AdminLogin.tsx'),
    join(root, 'lib', 'admin-api.mjs'),
  ];
  for (const path of authPaths) assert.equal(existsSync(path), true, `${path} must exist`);
  const authSource = authPaths.map((path) => readFileSync(path, 'utf8')).join('\n');
  const shell = readFileSync(join(root, 'components', 'AdminShell.tsx'), 'utf8');
  const source = `${authSource}\n${shell}`;
  assert.match(source, /credentials:\s*["']include["']/);
  assert.match(source, /\/auth\/me/);
  assert.match(source, /\/auth\/logout/);
  assert.match(source, /body:\s*\{\}/);
  assert.match(source, /body\s*=\s*JSON\.stringify\(body\)/);
  assert.match(source, /\/auth\/login/);
  assert.doesNotMatch(authSource, /sessionStorage|localStorage|x-admin-token|Authorization|\.token\b/);

  assert.doesNotMatch(shell, /x-admin-token|Authorization|\.token\b/);
  assert.match(shell, /ADMIN_SIDEBAR_STORAGE_KEY/);
  assert.match(shell, /ADMIN_GROUPS_STORAGE_KEY/);
});

test('admin overview does not present hardcoded catalog or retired CRM state as live data', () => {
  const app = readFileSync(join(root, 'components', 'AdminApp.tsx'), 'utf8');

  assert.doesNotMatch(app, /207 городов|опубликована только Казань/);
  assert.doesNotMatch(app, /Временное CRM-приложение|выводить из эксплуатации/);
  assert.match(app, /Актуальные счетчики и состояния загружаются внутри каждого раздела/);
});

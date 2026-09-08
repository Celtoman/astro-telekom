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
  const componentPaths = [join(root, 'components', 'AdminApp.tsx'), join(root, 'components', 'AdminLogin.tsx')];
  for (const path of componentPaths) assert.equal(existsSync(path), true, `${path} must exist`);
  const source = componentPaths.map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.match(source, /credentials:\s*["']include["']/);
  assert.match(source, /\/auth\/me/);
  assert.match(source, /\/auth\/logout/);
  assert.match(source, /body:\s*JSON\.stringify\(\{\}\)/);
  assert.match(source, /\/auth\/login/);
  assert.doesNotMatch(source, /sessionStorage|localStorage|x-admin-token|Authorization|\.token\b/);
});

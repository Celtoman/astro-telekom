import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('redirects route mounts an authenticated React workspace and is linked from the shell', () => {
  const routePath = join(adminRoot, 'pages', 'redirects.astro');
  assert.equal(existsSync(routePath), true);
  assert.match(readFileSync(routePath, 'utf8'), /<AdminWorkspace[^>]+client:load/);

  const item = adminNavigation.find((entry) => entry.id === 'redirects');
  assert.deepEqual({ href: item?.href, label: item?.label }, { href: '/redirects', label: 'Редиректы' });
});

test('redirects workspace uses real CRUD endpoints and shadcn primitives', () => {
  const source = readFileSync(join(adminRoot, 'components', 'RedirectsApp.tsx'), 'utf8');

  assert.match(source, /\/auth\/me/);
  assert.match(source, /\/admin\/sites/);
  assert.match(source, /\/admin\/redirects/);
  assert.match(source, /method:\s*editingId\s*\?\s*["']PATCH["']\s*:\s*["']POST["']/);
  assert.match(source, /method:\s*["']PATCH["']/);
  assert.match(source, /method:\s*["']DELETE["']/);
  assert.match(source, /<FieldGroup>/);
  assert.match(source, /<Table>/);
  assert.match(source, /active=["']redirects["']/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|innerHTML|x-admin-token/i);
});

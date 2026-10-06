import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminNavigation } from '../apps/admin/src/lib/admin-navigation.mjs';

const adminRoot = join(import.meta.dirname, '..', 'apps', 'admin', 'src');

test('trash route mounts an authenticated React workspace and is linked from the shell', () => {
  const routePath = join(adminRoot, 'pages', 'trash.astro');
  assert.equal(existsSync(routePath), true, 'trash route must exist');
  assert.match(readFileSync(routePath, 'utf8'), /<AdminWorkspace[^>]+client:load/);

  const item = adminNavigation.find((entry) => entry.id === 'trash');
  assert.deepEqual({ href: item?.href, label: item?.label }, { href: '/trash', label: 'Корзина' });
});

test('trash workspace reuses safe entity restore contracts without a DELETE request', () => {
  const componentPath = join(adminRoot, 'components', 'TrashApp.tsx');
  assert.equal(existsSync(componentPath), true, 'trash workspace must exist');
  const source = readFileSync(componentPath, 'utf8');

  assert.match(source, /\/admin\/trash\?/);
  assert.match(source, /\/admin\/blocks\/\$\{encodeURIComponent\(item\.id\)\}\/restore/);
  assert.match(source, /\/admin\/cities\//);
  assert.match(source, /\/admin\/pages\//);
  assert.match(source, /\/admin\/tariffs\//);
  assert.match(source, /\/admin\/redirects\//);
  assert.doesNotMatch(source, /method:\s*["']DELETE["']|dangerouslySetInnerHTML|\.innerHTML|localStorage|sessionStorage|x-admin-token/i);
  assert.match(source, /\/admin\/tariffs\/purge-preview\?/);
  assert.match(source, /\/admin\/tariffs\/purge"/);
});

test('trash workspace explains draft restoration and requires an explicit confirmation', () => {
  const source = readFileSync(join(adminRoot, 'components', 'TrashApp.tsx'), 'utf8');

  for (const label of ['Город', 'Страница', 'Тариф', 'Редирект', 'Блок страницы']) {
    assert.ok(source.includes(label), `missing trash entity label: ${label}`);
  }
  assert.match(source, /Восстановить из корзины/);
  assert.match(source, /вернется как черновик/i);
  assert.match(source, /Подтвердить восстановление/);
  assert.match(source, /Подтвердить необратимую очистку/);
});

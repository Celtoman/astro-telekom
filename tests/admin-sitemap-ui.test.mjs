import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..', 'apps', 'admin', 'src');
const pagePath = join(root, 'pages', 'seo', 'sitemap.astro');
const componentPath = join(root, 'components', 'SitemapApp.tsx');

test('SEO sitemap route is a protected React workspace reachable from shared navigation', () => {
  assert.equal(existsSync(pagePath), true, 'SEO sitemap Astro route must exist');
  assert.equal(existsSync(componentPath), true, 'SitemapApp React workspace must exist');
  const page = readFileSync(pagePath, 'utf8');
  const navigation = readFileSync(join(root, 'lib', 'admin-navigation.mjs'), 'utf8');
  assert.match(page, /SitemapApp/);
  assert.match(page, /client:load/);
  assert.match(navigation, /label:\s*["']SEO["']/);
  assert.match(navigation, /href:\s*["']\/seo\/sitemap["']/);
});

test('sitemap workspace exposes diagnostics, XML preview and revisioned exclusions', () => {
  assert.equal(existsSync(componentPath), true, 'SitemapApp React workspace must exist');
  const component = readFileSync(componentPath, 'utf8');
  assert.match(component, /\/admin\/sites\/\$\{siteId\}\/sitemap/);
  assert.match(component, /\/admin\/sites\/\$\{siteId\}\/sitemap-exclusions/);
  assert.match(component, /method:\s*["']PUT["']/);
  assert.match(component, /expectedWorkingRevision/);
  assert.match(component, /PublicationStatusCard/);
  assert.match(component, /StatusBadge/);
  assert.match(component, /Текущий origin/);
  assert.match(component, /Последняя генерация/);
  assert.match(component, /XML-preview/);
  assert.match(component, /Страницы/);
  assert.match(component, /Города/);
  assert.match(component, /Тарифы/);
  assert.match(component, /Tabs/);
  assert.match(component, /Причина/);
  assert.match(component, /Checkbox/);
  assert.doesNotMatch(component, /innerHTML|x-admin-token|Authorization|service token/i);
});

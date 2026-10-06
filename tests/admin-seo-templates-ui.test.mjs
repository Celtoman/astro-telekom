import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('SEO templates have a protected admin route and cookie-auth React editor', () => {
  const route = read('apps/admin/src/pages/seo/templates.astro');
  const editor = read('apps/admin/src/components/SeoTemplatesApp.tsx');
  const picker = read('apps/admin/src/components/VariableInsertionPicker.tsx');
  const controller = read('apps/api/src/admin-seo-templates.controller.ts');
  assert.match(route, /<AdminWorkspace[^>]*client:load/);
  assert.match(route, /noindex, nofollow/);
  assert.match(controller, /@UseGuards\(AdminTokenGuard\)/);
  assert.match(controller, /@Get\(\)/);
  assert.match(controller, /@Patch\(':kind'\)/);
  assert.match(editor, /\/auth\/me/);
  assert.match(editor, /workingByPath/);
  assert.match(editor, /publishedByPath/);
  assert.match(editor, /confirmNoindexCount/);
  assert.match(editor, /Социальные сети · Open Graph/);
  assert.match(editor, /ogTitleTemplate/);
  assert.match(editor, /ogDescriptionTemplate/);
  assert.match(editor, /ogImageUrl/);
  assert.match(editor, /PublicationStatusCard/);
  assert.match(picker, /variable-catalog\/definitions/);
  assert.match(picker, /type="button"/);
  assert.match(editor, /VariableInsertionPicker/);
  assert.match(editor, /insertVariableAtSelection/);
  assert.match(editor, /setSelectionRange/);
  assert.match(editor, /activeField/);
  assert.doesNotMatch(editor, /id="seo-og-image"[^>]*onSelect/);
  assert.match(editor, /URLSearchParams\(window\.location\.search\)/);
  assert.match(editor, /setKind\(nextKind\)/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|x-admin-token/);
});

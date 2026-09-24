const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

test('draft registry covers every managed block and every programmatic tariff section', async () => {
  const { BLOCK_TYPES } = require('../apps/api/dist/block-validation.js');
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  const { tariffTemplateBlocks } = await import('../apps/admin/src/lib/tariff-template.mjs');
  const renderer = readFileSync(join(root, 'apps/web/src/components/TariffDetail.astro'), 'utf8');
  const renderedIds = [...renderer.matchAll(/data-tariff-block="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(BLOCK_PASSPORTS.filter((item) => item.kind === 'MANAGED').map((item) => item.id), BLOCK_TYPES);
  assert.deepEqual(BLOCK_PASSPORTS.filter((item) => item.kind === 'PROGRAMMATIC').map((item) => item.id),
    tariffTemplateBlocks.map((item) => `tariff.${item.id}`));
  assert.deepEqual(renderedIds, tariffTemplateBlocks.map((item) => item.id));
});

test('every passport is complete, draft-only and exposes no approval or editor mutation', () => {
  const { BLOCK_PASSPORTS, BLOCK_PASSPORT_LIFECYCLE, BLOCK_PASSPORT_TRANSITIONS } = require('../apps/api/dist/block-passports.js');
  assert.deepEqual(BLOCK_PASSPORT_LIFECYCLE, ['DRAFT', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);
  assert.deepEqual(BLOCK_PASSPORT_TRANSITIONS.DRAFT, ['APPROVED']);
  assert.deepEqual(BLOCK_PASSPORT_TRANSITIONS.ARCHIVED, []);
  assert.equal(new Set(BLOCK_PASSPORTS.map((item) => item.id)).size, BLOCK_PASSPORTS.length);
  for (const passport of BLOCK_PASSPORTS) {
    assert.equal(passport.status, 'DRAFT', passport.id);
    assert.equal(passport.passportVersion, '0-draft', passport.id);
    assert.equal(passport.approvedBy, null, passport.id);
    assert.equal(passport.replacementId, null, passport.id);
    for (const key of ['title', 'purpose', 'emptyBehavior', 'editorForm', 'implementation']) {
      assert.ok(passport[key]?.trim(), `${passport.id}: ${key}`);
    }
    for (const key of ['proposedAllowedPages', 'visualVariants', 'fields', 'previewScenarios', 'accessibility']) {
      assert.ok(passport[key]?.length, `${passport.id}: ${key}`);
    }
    assert.equal(new Set(passport.fields.map((item) => item.key)).size, passport.fields.length, passport.id);
    for (const field of passport.fields) {
      assert.ok(field.key && field.type && field.source && field.validation && field.control, passport.id);
      assert.equal(typeof field.required, 'boolean', passport.id);
      if (passport.kind === 'PROGRAMMATIC') assert.equal(field.control, 'read_only', passport.id);
    }
  }
});

test('passport API is read-only behind admin authentication and the templates screen displays it', () => {
  const { AdminBlocksController } = require('../apps/api/dist/admin-blocks.controller.js');
  const controller = new AdminBlocksController({}, {});
  assert.equal(Reflect.getMetadata('path', AdminBlocksController.prototype.passports), 'block-passports');
  assert.ok(Reflect.getMetadata('__guards__', AdminBlocksController)?.some((guard) => guard.name === 'AdminTokenGuard'));
  assert.equal(controller.passports().passports.length, 16);
  const screen = readFileSync(join(root, 'apps/admin/src/components/BlockPassportsPanel.tsx'), 'utf8');
  assert.match(screen, /requestJson<Registry>\(apiUrl, "\/admin\/block-passports"\)/);
  assert.match(screen, /Только черновики/);
  assert.doesNotMatch(screen, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
});

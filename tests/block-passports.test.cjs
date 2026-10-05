const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

test('registry covers implemented block types and the approved root first screen', async () => {
  const { BLOCK_TYPES } = require('../apps/api/dist/block-validation.js');
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  const { tariffTemplateBlocks } = await import('../apps/admin/src/lib/tariff-template.mjs');
  const renderer = readFileSync(join(root, 'apps/web/src/components/TariffDetail.astro'), 'utf8');
  const renderedIds = [...renderer.matchAll(/data-tariff-block="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(BLOCK_PASSPORTS.filter((item) => item.kind === 'MANAGED' && item.id !== 'home.hero').map((item) => item.id), BLOCK_TYPES);
  assert.deepEqual(BLOCK_PASSPORTS.filter((item) => item.id.startsWith('tariff.')).map((item) => item.id),
    tariffTemplateBlocks.map((item) => `tariff.${item.id}`));
  assert.deepEqual(BLOCK_PASSPORTS.filter((item) => !BLOCK_TYPES.includes(item.id) && !item.id.startsWith('tariff.')).map((item) => item.id),
    ['header', 'home.hero']);
  assert.deepEqual(renderedIds, tariffTemplateBlocks.map((item) => item.id));
});

test('every passport is complete and only the two owner-approved first screens leave DRAFT', () => {
  const { BLOCK_PASSPORTS, BLOCK_PASSPORT_LIFECYCLE, BLOCK_PASSPORT_TRANSITIONS } = require('../apps/api/dist/block-passports.js');
  assert.deepEqual(BLOCK_PASSPORT_LIFECYCLE, ['DRAFT', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);
  assert.deepEqual(BLOCK_PASSPORT_TRANSITIONS.DRAFT, ['APPROVED']);
  assert.deepEqual(BLOCK_PASSPORT_TRANSITIONS.ARCHIVED, []);
  assert.equal(new Set(BLOCK_PASSPORTS.map((item) => item.id)).size, BLOCK_PASSPORTS.length);
  for (const passport of BLOCK_PASSPORTS) {
    assert.equal(passport.status, ['hero', 'home.hero'].includes(passport.id) ? 'APPROVED' : 'DRAFT', passport.id);
    assert.equal(passport.passportVersion, ['hero', 'home.hero'].includes(passport.id) ? '1.0.0' : '0-draft', passport.id);
    if (passport.status === 'APPROVED') assert.match(passport.approvedBy, /Владелец.*2026-10-05/); else assert.equal(passport.approvedBy, null, passport.id);
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

test('current city HOME passports name the shared template as the editable source', () => {
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  const homeTypes = new Set(['hero', 'service_grid', 'tariff_grid', 'steps', 'feature_grid', 'faq']);
  for (const passport of BLOCK_PASSPORTS.filter((item) => homeTypes.has(item.id))) {
    assert.match(passport.implementation, /PageTemplate\(CITY_HOME\).*PageTemplateBlock\.data/, passport.id);
    assert.match(passport.implementation, /PageBlock.*legacy/, passport.id);
    assert.doesNotMatch(passport.implementation, /предложение для C2|данные пока хранятся в PageBlock/, passport.id);
    for (const field of passport.fields.filter((item) => item.control !== 'read_only')) {
      assert.match(field.source, /^PageTemplateBlock\.data\./, `${passport.id}.${field.key}`);
    }
  }

  const futureText = BLOCK_PASSPORTS.find((item) => item.id === 'rich_text');
  assert.match(futureText.implementation, /не реализован/);
  assert.doesNotMatch(futureText.implementation, /PageBlock\.data|PageTemplateBlock\.data/);
  for (const field of futureText.fields) {
    assert.doesNotMatch(field.source, /PageBlock\.data|PageTemplateBlock\.data/, field.key);
  }
});

test('passport API is read-only behind admin authentication and the templates screen displays it', () => {
  const { AdminBlocksController } = require('../apps/api/dist/admin-blocks.controller.js');
  const controller = new AdminBlocksController({}, {});
  assert.equal(Reflect.getMetadata('path', AdminBlocksController.prototype.passports), 'block-passports');
  assert.ok(Reflect.getMetadata('__guards__', AdminBlocksController)?.some((guard) => guard.name === 'AdminTokenGuard'));
  assert.equal(controller.passports().passports.length, 18);
  const screen = readFileSync(join(root, 'apps/admin/src/components/BlockPassportsPanel.tsx'), 'utf8');
  assert.match(screen, /requestJson<Registry>\(apiUrl, "\/admin\/block-passports"\)/);
  assert.match(screen, /Паспорта показывают разрешённый контент блока/);
  assert.doesNotMatch(screen, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
  assert.match(screen, /passport\.design/);
  assert.match(screen, /passport\.runtimeRules/);
  assert.match(screen, /Технические подробности/);
});

test('implemented home passports identify exact Figma component sets and device variants', () => {
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  const references = {
    header: ['79:69', ['79:3', '79:28', '79:50']],
    'home.hero': ['873:30', ['873:31', '873:57', '873:80']],
    hero: ['991:2', ['991:3', '991:17', '991:31']],
  };
  for (const [id, [nodeId, variantIds]] of Object.entries(references)) {
    const passport = BLOCK_PASSPORTS.find((item) => item.id === id);
    assert.ok(passport?.design, `${id}: missing design contract`);
    assert.equal(passport.design.fileKey, 'PiSCXYR88uqqcS6tKVfd8T');
    assert.equal(passport.design.nodeId, nodeId);
    assert.deepEqual(passport.design.variants.map((item) => item.nodeId), variantIds);
    assert.deepEqual(passport.design.variants.map((item) => item.device), ['Desktop', 'Tablet', 'Mobile']);
    assert.ok(passport.runtimeRules.length > 0);
  }
});

test('header passport records global contacts and contextual navigation without local content overrides', () => {
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  const header = BLOCK_PASSPORTS.find((item) => item.id === 'header');
  assert.ok(header);
  assert.equal(header.proposedContentScope, 'CODE');
  assert.ok(header.proposedAllowedPages.includes('HOME'));
  assert.ok(header.proposedAllowedPages.includes('CITY_TARIFF_DETAIL'));
  const fields = new Map(header.fields.map((item) => [item.key, item]));
  assert.equal(fields.get('connectionPhone').source, 'Site.connectionPhone');
  assert.equal(fields.get('supportPhone').source, 'Site.supportPhone');
  assert.match(fields.get('activeCity').source, /City.*moskva/);
  assert.match(fields.get('publishedCities').source, /loadSiteData/);
  assert.match(fields.get('callback').validation, /проверки.*телефон/);
  assert.ok(header.runtimeRules.some((rule) => /не сохраняется/.test(rule)));
  assert.ok(header.runtimeRules.some((rule) => /режим.*абонента/.test(rule)));
  for (const field of header.fields) assert.equal(field.control, 'read_only');
});

test('approved root Hero 1b defines template content and a published Moscow form context, without tariff fields', () => {
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  const rootHero = BLOCK_PASSPORTS.find((item) => item.id === 'home.hero');
  assert.ok(rootHero);
  assert.deepEqual(rootHero.proposedAllowedPages, ['HOME']);
  assert.equal(rootHero.proposedContentScope, 'TEMPLATE');
  assert.match(rootHero.emptyBehavior, /Москв.*выбора? города/);
  assert.ok(rootHero.runtimeRules.some((rule) => /не показывает тарифы/.test(rule)));
  const fields = new Map(rootHero.fields.map((item) => [item.key, item]));
  assert.equal(fields.get('title').source, 'PageTemplateBlock.data.title');
  assert.match(fields.get('city').source, /moskva/);
  assert.match(fields.get('addressForm').validation, /INTERNET/);
  assert.equal(fields.get('chips').type, 'list');
  assert.equal(rootHero.editorReadiness, 'PENDING');
  assert.match(rootHero.implementation, /PageTemplate\(HOME\).*не реализованы/);
});

test('city Hero V3 separates template content, computed catalog facts and legacy fields', () => {
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  const { validateBlock } = require('../apps/api/dist/block-validation.js');
  const hero = BLOCK_PASSPORTS.find((item) => item.id === 'hero');
  const fields = new Map(hero.fields.map((item) => [item.key, item]));
  assert.deepEqual(hero.fields.filter((item) => item.control !== 'read_only').map((item) => item.key), ['title', 'text', 'image', 'imageAlt', 'addressPlaceholder', 'checkButtonText', 'tariffsCtaText']);
  for (const key of ['eyebrow', 'ctaText', 'ctaHref']) assert.equal(fields.has(key), false);
  assert.equal(hero.editorReadiness, 'PENDING');
  for (const [key, source] of [['minimumPrice', 'priceAmount'], ['maximumSpeed', 'speedMbps'], ['maximumTvChannels', 'tvChannelsTotal']]) {
    assert.match(fields.get(key).source, new RegExp(`TariffView\\.${source}`));
    assert.equal(fields.get(key).required, false);
    assert.equal(fields.get(key).control, 'read_only');
    assert.throws(() => validateBlock({ blockType: 'hero', position: 0, data: { title: 'Заголовок', text: 'Текст', [key]: 123 } }), /неизвестное поле/);
  }
  assert.match(fields.get('tariffsCta').validation, /#tariffs/);
  assert.ok(hero.runtimeRules.some((rule) => /разным тарифам|разных тарифов/.test(rule)));
  assert.ok(hero.runtimeRules.some((rule) => /TARGET_AVAILABLE/.test(rule)));
});

 test('only the two owner-approved first screens define independent editable address copy', () => {
  const { BLOCK_PASSPORTS } = require('../apps/api/dist/block-passports.js');
  assert.deepEqual(BLOCK_PASSPORTS.filter(p => p.status === 'APPROVED').map(p => p.id), ['hero', 'home.hero']);
  for (const passport of BLOCK_PASSPORTS.filter(p => p.status === 'APPROVED')) {
    for (const key of ['addressPlaceholder', 'checkButtonText', 'image', 'imageAlt']) {
      const item = passport.fields.find(f => f.key === key);
      assert.equal(item.control, 'input');
      assert.equal(item.required, true);
      assert.equal(item.source, `PageTemplateBlock.data.${key}`);
    }
    assert.equal(passport.proposedContentScope, 'TEMPLATE');
    assert.equal(passport.editorReadiness, 'PENDING');
    assert.match(passport.fields.find(f => f.key === 'addressPlaceholder').validation, /не глобальный/);
  }
});

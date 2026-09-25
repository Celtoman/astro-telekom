const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = (name) => require(`../apps/api/dist/${name}.js`);

const definition = (code, status, fields = ['Page.title', 'PageBlock.data.title', 'Tariff.promoText', 'SeoTemplate.titleTemplate'], replacementCode) => ({
  code, status, type: 'text', scope: 'SITE', allowedContexts: ['Общая страница'], allowedFields: fields, replacementCode,
});

test('migration plan replaces exact tokens in authored fields and leaves unrelated data untouched', () => {
  const { planVariableMigration } = api('variable-migration');
  const rows = {
    pages: [{ id: 'page-1', title: '{OLD_CODE} и {OLD_CODE_SUFFIX}', content: { text: 'нет' }, seo: null,
      blocks: [{ id: 'block-1', data: { title: '{OLD_CODE}', ctaHref: '/tariffs', items: [] } }] }],
    tariffs: [{ id: 'tariff-1', promoText: '{OLD_CODE}', seo: null }],
    seoTemplates: [{ id: 'seo-1', titleTemplate: '{OLD_CODE}', descriptionTemplate: 'нет', ogTitleTemplate: null, ogDescriptionTemplate: null }],
  };
  const plan = planVariableMigration([definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE')], 'OLD_CODE', 'NEW_CODE', rows);
  assert.equal(plan.replacementCount, 4);
  assert.deepEqual(plan.changes.map(({ entityType, entityId }) => [entityType, entityId]), [['PAGE', 'page-1'], ['TARIFF', 'tariff-1'], ['SEO_TEMPLATE', 'seo-1']]);
  assert.equal(plan.changes[0].next.title, '{NEW_CODE} и {OLD_CODE_SUFFIX}');
  assert.equal(plan.changes[0].next.blocks[0].data.title, '{NEW_CODE}');
  assert.equal(plan.changes[0].next.blocks[0].data.ctaHref, '/tariffs');
  assert.equal(plan.changes.some(({ next }) => JSON.stringify(next).includes('"{OLD_CODE}"')), false);
  assert.equal(rows.pages[0].title, '{OLD_CODE} и {OLD_CODE_SUFFIX}');
});

test('migration refuses a source token left in a non-editable URL field', () => {
  const { planVariableMigration } = api('variable-migration');
  const rows = { pages: [{ id: 'page-1', title: '{OLD_CODE}', content: null, seo: null,
    blocks: [{ id: 'block-1', data: { title: 'Без кода', ctaHref: '/{OLD_CODE}' } }] }], tariffs: [], seoTemplates: [] };
  assert.throws(() => planVariableMigration([definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE')], 'OLD_CODE', 'NEW_CODE', rows), /остал/i);
});

test('migration plans the authoritative city HOME template once and ignores linked legacy copies', () => {
  const { planVariableMigration } = api('variable-migration');
  const rows = {
    pages: [1, 2].map((index) => ({
      id: `city-home-${index}`, templateId: 'template-1', title: 'Старая копия {OLD_CODE}', content: {},
      blocks: [{ id: `legacy-block-${index}`, data: { title: 'Устаревшая копия {OLD_CODE}' } }],
    })),
    pageTemplates: [{ id: 'template-1', kind: 'CITY_HOME', titleTemplate: 'Интернет в {OLD_CODE}', content: {},
      blocks: [{ id: 'template-block-1', data: { title: 'Тарифы в {OLD_CODE}' } }] }],
    tariffs: [], seoTemplates: [],
  };
  const definitions = [definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE')];
  assert.throws(() => planVariableMigration(definitions, 'OLD_CODE', 'NEW_CODE', { ...rows, pageTemplates: [] }), /шаблон/i);
  const plan = planVariableMigration(definitions, 'OLD_CODE', 'NEW_CODE', rows);
  assert.equal(plan.replacementCount, 2);
  assert.deepEqual(plan.changes.map(({ entityType, entityId }) => [entityType, entityId]), [['PAGE_TEMPLATE', 'template-1']]);
  assert.equal(plan.changes[0].next.titleTemplate, 'Интернет в {NEW_CODE}');
  assert.equal(plan.changes[0].next.blocks[0].data.title, 'Тарифы в {NEW_CODE}');
  assert.equal(rows.pages[0].title, 'Старая копия {OLD_CODE}');
});

test('migration rejects incompatible target and unknown or active source', () => {
  const { planVariableMigration } = api('variable-migration');
  const rows = { pages: [], tariffs: [], seoTemplates: [] };
  assert.throws(() => planVariableMigration([definition('OLD_CODE', 'ACTIVE', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE')], 'OLD_CODE', 'NEW_CODE', rows), /устарева/i);
  assert.throws(() => planVariableMigration([definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE', ['Page.title'])], 'OLD_CODE', 'NEW_CODE', rows), /пол/i);
  assert.throws(() => planVariableMigration([definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE')], 'OLD_CODE', 'MISSING', rows), /код/i);
  assert.throws(() => planVariableMigration([definition('OLD_CODE', 'DEPRECATING'), definition('NEW_CODE', 'ACTIVE')], 'OLD_CODE', 'NEW_CODE', rows), /назначен/i);
});

test('apply migrates a synthetic pair in one transaction and records working revisions without publishing', async () => {
  const { applyVariableMigration } = api('variable-migration');
  let revision = 8;
  const writes = [];
  const tx = {
    site: { findUnique: async () => ({ id: 'site-1', workingRevision: revision, publishedRevision: 7 }) },
    pageTemplate: { findMany: async () => [] },
    page: {
      findMany: async () => [{ id: 'page-1', title: '{OLD_CODE}', content: null, seo: null,
        blocks: [{ id: 'block-1', data: { title: '{OLD_CODE}' } }] }],
      update: async ({ where, data }) => { writes.push(['page', where.id, data]); },
    },
    pageBlock: { update: async ({ where, data }) => { writes.push(['block', where.id, data]); } },
    tariff: { findMany: async () => [{ id: 'tariff-1', promoText: '{OLD_CODE}', seo: null }], update: async ({ where, data }) => { writes.push(['tariff', where.id, data]); } },
    seoTemplate: { findMany: async () => [{ id: 'seo-1', titleTemplate: '{OLD_CODE}', descriptionTemplate: '', ogTitleTemplate: null, ogDescriptionTemplate: null }], update: async ({ where, data }) => { writes.push(['seo', where.id, data]); } },
  };
  const publications = { recordWorkingRevision: async (_tx, input) => { writes.push(['revision', input.entityType, input.changedFields]); return { siteRevision: ++revision }; } };
  const definitions = [definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE')];
  const result = await applyVariableMigration(tx, publications, definitions, {
    siteId: 'site-1', expectedWorkingRevision: 8, expectedReplacementCount: 4, sourceCode: 'OLD_CODE', targetCode: 'NEW_CODE', actorId: 'admin-1',
  });
  assert.equal(result.replacementCount, 4);
  assert.equal(result.workingRevision, 11);
  assert.deepEqual(writes.filter(([kind]) => kind === 'revision').map(([, type]) => type), ['PAGE', 'TARIFF', 'SITE']);
  assert.ok(writes.some(([kind, , data]) => kind === 'block' && data.data.title === '{NEW_CODE}'));
  assert.ok(writes.some(([kind, , data]) => kind === 'seo' && data.titleTemplate === '{NEW_CODE}'));
  assert.equal(writes.some(([kind]) => kind === 'publication'), false);
});

test('apply migrates a site template without writing obsolete linked HOME copies', async () => {
  const { applyVariableMigration } = api('variable-migration');
  const writes = [];
  const template = { id: 'template-1', kind: 'CITY_HOME', titleTemplate: 'Интернет в {OLD_CODE}', content: {},
    blocks: [{ id: 'template-block-1', data: { title: 'Тарифы в {OLD_CODE}' } }] };
  const tx = {
    site: { findUnique: async () => ({ id: 'site-1', workingRevision: 8, publishedRevision: 7 }) },
    page: { findMany: async () => [{ id: 'home-1', templateId: 'template-1', title: 'Старая копия {OLD_CODE}', content: {}, blocks: [] }],
      update: () => assert.fail('linked HOME must not be updated') },
    pageBlock: { update: () => assert.fail('legacy block must not be updated') },
    pageTemplate: { findMany: async () => [template], update: async ({ where, data }) => writes.push(['template', where.id, data]) },
    pageTemplateBlock: { update: async ({ where, data }) => writes.push(['template-block', where.id, data]) },
    tariff: { findMany: async () => [] },
    seoTemplate: { findMany: async () => [] },
  };
  const publications = { recordWorkingRevision: async (_tx, input) => { writes.push(['revision', input.entityType, input.changedFields]); return { siteRevision: 9 }; } };
  const definitions = [definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE')];
  const result = await applyVariableMigration(tx, publications, definitions, {
    siteId: 'site-1', expectedWorkingRevision: 8, expectedReplacementCount: 2, sourceCode: 'OLD_CODE', targetCode: 'NEW_CODE',
  });
  assert.equal(result.replacementCount, 2);
  assert.equal(result.workingRevision, 9);
  assert.deepEqual(writes, [
    ['template', 'template-1', { titleTemplate: 'Интернет в {NEW_CODE}' }],
    ['template-block', 'template-block-1', { data: { title: 'Тарифы в {NEW_CODE}' } }],
    ['revision', 'PAGE_TEMPLATE', ['titleTemplate', 'blocks']],
  ]);
});

test('apply rejects stale revision or changed replacement count before any write', async () => {
  const { applyVariableMigration } = api('variable-migration');
  let revision = 9;
  const tx = {
    site: { findUnique: async () => ({ id: 'site-1', workingRevision: revision, publishedRevision: 7 }) },
    pageTemplate: { findMany: async () => [] },
    page: { findMany: async () => [{ id: 'page-1', title: '{OLD_CODE}', content: null, seo: null, blocks: [] }], update: () => assert.fail('no write') },
    tariff: { findMany: async () => [], update: () => assert.fail('no write') },
    seoTemplate: { findMany: async () => [], update: () => assert.fail('no write') },
  };
  const publications = { recordWorkingRevision: () => assert.fail('no revision') };
  const definitions = [definition('OLD_CODE', 'DEPRECATING', undefined, 'NEW_CODE'), definition('NEW_CODE', 'ACTIVE')];
  const input = { siteId: 'site-1', expectedWorkingRevision: 8, expectedReplacementCount: 1, sourceCode: 'OLD_CODE', targetCode: 'NEW_CODE' };
  await assert.rejects(() => applyVariableMigration(tx, publications, definitions, input), /ревизи/i);
  revision = 8;
  await assert.rejects(() => applyVariableMigration(tx, publications, definitions, { ...input, expectedReplacementCount: 2 }), /число замен/i);
});

test('admin migration routes require auth and reject an active source before reading rows', async () => {
  const { AdminVariableMigrationController } = api('admin-variable-migration.controller');
  const controller = new AdminVariableMigrationController({ $transaction: () => assert.fail('active code must fail before transaction') }, {});
  assert.equal(Reflect.getMetadata('path', AdminVariableMigrationController), 'admin/sites/:siteId/variable-migration');
  assert.ok(Reflect.getMetadata('__guards__', AdminVariableMigrationController)?.length);
  await assert.rejects(() => controller.preview('site-1', 'CONNECTION_PHONE', 'SUPPORT_PHONE', '8'), /устарева/i);
  await assert.rejects(() => controller.apply('site-1', {
    sourceCode: 'CONNECTION_PHONE', targetCode: 'SUPPORT_PHONE', expectedWorkingRevision: 8, expectedReplacementCount: 1,
  }), /устарева/i);
});

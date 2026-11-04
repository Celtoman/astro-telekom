const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminPageTemplatesController } = require('../apps/api/dist/admin-page-templates.controller.js');
const { addressPageDefaultBlocks } = require('../apps/api/dist/address-page-defaults.js');
const { ADDRESS_PAGE_METADATA } = require('../apps/api/dist/address-page-model.js');
const { sitePublicDisplayDefaults } = require('../apps/api/dist/site-public-display.js');
test('new cities inherit ADDRESS only after this site has the independent template', async () => {
  const { ensureCityAddressPage } = require('../apps/api/dist/address-page-storage.js');
  const writes = [];
  const tx = { pageTemplate: { findUnique: async () => null }, page: { upsert: async input => { writes.push(input); return input.create; } } };
  assert.equal(await ensureCityAddressPage(tx, { id: 'new-city', siteId: 'site' }), null);
  assert.equal(writes.length, 0);
  tx.pageTemplate.findUnique = async () => ({ id: 'address-template', titleTemplate: 'Проверка в {CITY_NAME_PREPOSITIONAL}' });
  const page = await ensureCityAddressPage(tx, { id: 'new-city', siteId: 'site' });
  assert.equal(page.type, 'ADDRESS_CHECK'); assert.equal(page.templateId, 'address-template');
  assert.deepEqual(writes[0].update, {}, 'existing authored rows are preserved');
});
function workspace() {
  let template = { id: 'ct', kind: 'CITY_ADDRESS_CHECK', status: 'PUBLISHED', content: { ...ADDRESS_PAGE_METADATA },
    blocks: addressPageDefaultBlocks().map((b, index) => ({ ...b, id: `b${index}`, position: (index + 1) * 10, visible: true })) };
  const published = structuredClone(template); published.blocks[3].data.title = 'Опубликованная помощь';
  const site = { id: 's1', workingRevision: 7, publishedRevision: 6, connectionPhone: '78005557244', supportPhone: '78002507777', settings: { publicDisplay: sitePublicDisplayDefaults() } };
  const writes = [], revisions = [];
  const prisma = {
    site: { findUnique: async ({ where }) => where.id === 's1' ? structuredClone(site) : null },
    pageTemplate: { findUnique: async ({ where }) => where.siteId_kind.siteId === 's1' ? structuredClone(template) : null,
      findUniqueOrThrow: async () => structuredClone(template), update: async ({ data }) => { writes.push('template'); template = { ...template, ...data }; return structuredClone(template); } },
    pageTemplateBlock: { update: async ({ where, data }) => { writes.push(where.id); Object.assign(template.blocks.find(b => b.id === where.id), structuredClone(data)); } },
    $queryRaw: async () => [{ pageTemplates: [structuredClone(published)] }],
  };
  prisma.$transaction = async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); const before = structuredClone(template); try { return await fn(prisma); } catch (error) { template = before; throw error; } };
  const publications = { recordWorkingRevision: async (_tx, input) => { revisions.push(input); return { siteRevision: ++site.workingRevision }; } };
  return { controller: new AdminPageTemplatesController(prisma, publications), prisma, site, writes, revisions, published, current: () => structuredClone(template) };
}
test('guarded ADDRESS workspace separates working and published content and reads shared facts', async () => {
  const ctx = workspace(); assert.equal(typeof ctx.controller.addressPage, 'function');
  assert.equal(Reflect.getMetadata('path', ctx.controller.addressPage), 'address-composition');
  const result = await ctx.controller.addressPage('s1');
  assert.equal(result.version, '1.0.0'); assert.equal(result.blocks.length, 8);
  assert.equal(result.published.blocks[3].data.title, 'Опубликованная помощь');
  assert.equal(result.system.publicDisplay.connectionHours, 'Ежедневно с 8:00 до 22:00');
});
test('atomic ADDRESS save preserves identities and composition and records one working revision', async () => {
  const ctx = workspace(), before = ctx.current(), blocks = addressPageDefaultBlocks();
  blocks[3].data.title = 'Новая помощь'; blocks[7].data.items = [];
  assert.equal(typeof ctx.controller.updateAddressComposition, 'function');
  const result = await ctx.controller.updateAddressComposition('s1', { expectedWorkingRevision: 7, blocks }, { user: { id: 'editor' } });
  assert.deepEqual(result.missingFields, [{ block: 'address.faq', field: 'items' }]);
  assert.equal(result.workingRevision, 8); assert.equal(ctx.revisions.length, 1); assert.equal(ctx.revisions[0].actorId, 'editor');
  assert.deepEqual(ctx.current().blocks.map(({ id, position, visible }) => ({ id, position, visible })), before.blocks.map(({ id, position, visible }) => ({ id, position, visible })));
  assert.equal(ctx.site.publishedRevision, 6); assert.equal(ctx.published.blocks[3].data.title, 'Опубликованная помощь');
});
test('stale, unsafe, cross-site and client composition overrides fail before writes; parallel conflict is 409', async () => {
  const ctx = workspace(), blocks = addressPageDefaultBlocks(); assert.equal(typeof ctx.controller.updateAddressComposition, 'function');
  await assert.rejects(ctx.controller.updateAddressComposition('s1', { expectedWorkingRevision: 6, blocks }), e => e.getStatus() === 409);
  await assert.rejects(ctx.controller.updateAddressComposition('other', { expectedWorkingRevision: 7, blocks }), e => e.getStatus() === 404);
  await assert.rejects(ctx.controller.updateAddressComposition('s1', { expectedWorkingRevision: 7, blocks, version: '1.0.0' }), e => e.getStatus() === 400);
  blocks[6].data.supportPhone = '123';
  await assert.rejects(ctx.controller.updateAddressComposition('s1', { expectedWorkingRevision: 7, blocks }), e => e.block === 'address.help' && e.field === 'supportPhone');
  assert.equal(ctx.writes.length, 0); assert.equal(ctx.revisions.length, 0);
  ctx.prisma.$transaction = async () => { throw { code: 'P2034' }; };
  await assert.rejects(ctx.controller.updateAddressComposition('s1', { expectedWorkingRevision: 7, blocks: addressPageDefaultBlocks() }), e => e.getStatus() === 409);
});

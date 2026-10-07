const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tariffCollectionDefaults, sortCollectionTariffs, renderTariffCollection, projectCityHomeBlocks } = require('../apps/api/dist/tariff-collection-model.js');
const { validateTariffCollection } = require('../apps/api/dist/tariff-collection.js');

test('collection keeps all tariffs, prioritizes sticky before current monthly price, and sorts a copy', () => {
  const items = [
    { slug: 'regular-low', priceAmount: 100, availability: true },
    { slug: 'sticky-high', priceAmount: 1000, availability: true, attributes: { is_sticky: true } },
    { slug: 'sticky-low', priceAmount: 300, availability: true, attributes: { is_sticky: true } },
    { slug: 'regular-high', priceAmount: 800, availability: true },
  ];
  assert.deepEqual(sortCollectionTariffs(items, 'PRICE_ASC').map(t => t.slug), ['sticky-low', 'sticky-high', 'regular-low', 'regular-high']);
  assert.deepEqual(sortCollectionTariffs(items, 'PRICE_DESC').map(t => t.slug), ['sticky-high', 'sticky-low', 'regular-high', 'regular-low']);
  assert.equal(items[0].slug, 'regular-low');
  assert.equal(sortCollectionTariffs([{ slug: 'unknown', priceAmount: null }, { slug: 'known', priceAmount: 100 }], 'PRICE_DESC')[1].slug, 'unknown');
});

test('collection passport validates only editable fields and safe incomplete drafts', () => {
  const defaults = tariffCollectionDefaults();
  assert.equal(defaults.initialCount, 6);
  assert.deepEqual(validateTariffCollection(defaults), []);
  assert.deepEqual(validateTariffCollection({ ...defaults, connectButtonText: '' }, true), ['connectButtonText']);
  assert.throws(() => validateTariffCollection({ ...defaults, connectButtonText: '' }), /не готов/);
  for (const data of [{ ...defaults, initialCount: 0 }, { ...defaults, initialCount: 1.5 }, { ...defaults, title: '<script>' }, { ...defaults, limit: 3 }, { ...defaults, sort: 'SPEED' }]) assert.throws(() => validateTariffCollection(data));
});

test('only exact legacy HOME composition is projected; snapshots are not mutated', () => {
  const blocks = ['hero','service_grid','tariff_grid','steps','feature_grid','feature_grid','faq'].map((blockType, i) => ({ blockType, position: i * 10, visible: true, data: { title: `Saved ${blockType}`, limit: 2 } }));
  const before = structuredClone(blocks);
  const projected = projectCityHomeBlocks(blocks);
  assert.deepEqual(projected.map(b => b.blockType), ['hero', 'tariff_grid']);
  assert.equal(projected[1].data.title, 'Saved tariff_grid');
  assert.equal(projected[1].data.initialCount, 6);
  assert.deepEqual(blocks, before);
  assert.deepEqual(projectCityHomeBlocks(blocks.slice(0, 3)).map(b => b.blockType), ['hero','service_grid','tariff_grid']);
});

test('legacy compatibility is scoped and content diagnostics distinguish type, length and markup', () => {
  const { validatePublishedBlocks, validateCityHomeBlocks } = require('../apps/api/dist/block-validation.js');
  const legacy = [
    { blockType: 'hero', position: 0, visible: true, data: { title: 'Hero', text: 'Text' } },
    { blockType: 'tariff_grid', position: 1, visible: true, data: { title: 'Tariffs', limit: 6, serviceType: 'INTERNET' } },
  ];
  assert.doesNotThrow(() => validatePublishedBlocks(legacy, { pageType: 'INTERNET' }));
  assert.throws(() => validateCityHomeBlocks(legacy, 'Казань'));
  for (const extra of [{ limit: 0 }, { serviceType: 'HOME' }, { unexpected: true }]) {
    assert.throws(() => validatePublishedBlocks([legacy[0], { ...legacy[1], data: { ...legacy[1].data, ...extra } }], { pageType: 'INTERNET' }));
  }
  for (const [value, reason] of [[null, 'TYPE'], ['x'.repeat(1001), 'TOO_LONG'], ['<b>text</b>', 'UNSAFE_TEXT']]) {
    assert.throws(() => validateTariffCollection({ ...tariffCollectionDefaults(), text: value }), error => error.field === 'text' && error.reason === reason && error.getResponse().field === 'text');
  }
});

test('collection HTML escapes catalog/editor content and preview cannot execute buttons or links', () => {
  const data = { ...tariffCollectionDefaults(), title: '<script>alert(1)</script>' };
  const tariffs = Array.from({ length: 8 }, (_, i) => ({ slug: `t-${i}`, name: `Tariff ${i} <img>`, price: `${i + 1} ₽/мес`, priceAmount: i + 1, serviceType: 'INTERNET', speed: '100 Мбит/с', baseComponents: [], cinemas: [], equipment: [], attributes: {} }));
  const html = renderTariffCollection(data, tariffs, { citySlug: 'kazan', dialogId: 'address', interactive: true });
  assert.equal((html.match(/data-collection-card/g) || []).length, 8);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img>/);
  assert.match(html, /Показать ещё/);
  assert.match(html, /data-remaining="2"/);
  const preview = renderTariffCollection(tariffCollectionDefaults(), tariffs, { interactive: false });
  assert.doesNotMatch(preview, /href=|data-address-dialog-trigger/);
  assert.match(preview, /disabled/);
  const unknownTv = renderTariffCollection(tariffCollectionDefaults(), [{ ...tariffs[0], serviceType: 'TV', tvChannelsTotal: null }], { interactive: false });
  assert.match(unknownTv, /Телевидение<\/span><strong>Условия уточняются/);
  assert.doesNotMatch(unknownTv, /null каналов|<strong> каналов/);
  assert.doesNotMatch(renderTariffCollection(tariffCollectionDefaults(), tariffs.slice(0, 6), { interactive: true }), /data-collection-more/);
});

const { AdminPageTemplatesController } = require('../apps/api/dist/admin-page-templates.controller.js');
test('collection editor rejects stale/unsafe writes and records exactly one revision without changing other blocks', async () => {
  const template = { id:'template', siteId:'site', kind:'CITY_HOME', content:{ firstScreenPassportVersion:'1.0.0' }, blocks:[{ id:'hero', blockType:'hero', visible:true, data:{ title:'Owner title' } }, { id:'grid', blockType:'tariff_grid', visible:true, data:tariffCollectionDefaults() }] };
  const records=[], writes=[];
  const tx = { site:{ findUnique: async()=>({ workingRevision:18 }) }, pageTemplate:{ findUnique:async()=>structuredClone(template), update:async({data})=>{ template.content=data.content; }, findUniqueOrThrow:async()=>structuredClone(template) }, pageTemplateBlock:{ update:async({where,data})=>{ writes.push(where.id); template.blocks.find(b=>b.id===where.id).data=data.data; } } };
  const controller = new AdminPageTemplatesController({ $transaction:async(callback, options)=>{ assert.equal(options.isolationLevel,'Serializable'); return callback(tx); } },{ recordWorkingRevision:async(_tx, record)=>{ records.push(record); return { siteRevision:19 }; } });
  const body={ expectedWorkingRevision:18, data:{ ...tariffCollectionDefaults(), initialCount:3, sort:'PRICE_DESC', moreButtonText:'Все предложения' } };
  await assert.rejects(controller.updateTariffCollection('site',{...body,expectedWorkingRevision:17}),/ревизия/);
  await assert.rejects(controller.updateTariffCollection('site',{...body,data:{...body.data,moreButtonText:'<img>'}}),/без HTML/);
  assert.equal(writes.length,0);
  const result=await controller.updateTariffCollection('site',body,{user:{id:'owner'}});
  assert.deepEqual(writes,['grid']); assert.deepEqual(template.blocks[0].data,{ title:'Owner title' });
  assert.equal(result.workingRevision,19); assert.equal(records.length,1); assert.equal(records[0].actorId,'owner');
  assert.equal(records[0].previousSnapshot.blocks[1].data.initialCount,6); assert.equal(records[0].snapshot.blocks[1].data.initialCount,3);
  assert.equal(template.content.firstScreenPassportVersion,'1.0.0');
  assert.equal(Reflect.getMetadata('path',AdminPageTemplatesController.prototype.updateTariffCollection),'tariff-collection');
  assert.ok(Reflect.getMetadata('__guards__',AdminPageTemplatesController).some(g=>g.name==='AdminTokenGuard'));
});
test('new collection refuses to publish an incomplete draft even without published cities', () => {
  const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
  const { publicationSource } = require('./helpers/publication-source.cjs');
  const source=publicationSource([]); source.pageTemplates=[{ kind:'CITY_HOME', content:{tariffCollectionPassportVersion:'1.0.0'}, blocks:[{blockType:'tariff_grid',visible:true,data:{...tariffCollectionDefaults(),connectButtonText:''}}] }];
  const result=validatePublicationSource(source,{appVersion:'test',siteRevision:1},()=>({}));
  assert.ok(result.report.issues.some(i=>i.code==='TARIFF_COLLECTION_NOT_READY'&&i.severity==='BLOCKING'));
});
test('collection migration preserves historical data and rolls back unknown compositions on PostgreSQL', { timeout:180000 }, () => {
  const { spawnSync }=require('node:child_process'); const { join }=require('node:path');
  const result=spawnSync(process.execPath,[join(__dirname,'../scripts/rehearse-tariff-collection.mjs')],{encoding:'utf8',timeout:170000});
  assert.equal(result.status,0,[result.stdout,result.stderr,result.error?.message].filter(Boolean).join('\n'));
});

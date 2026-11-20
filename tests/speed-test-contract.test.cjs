const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildReleaseOneRoutes}=require('../apps/api/dist/public-route-policy');
const {accountPageSource}=require('./helpers/account-page-source.cjs');
const {speedTestPageDefaults}=require('../apps/api/dist/speed-test-page-defaults');
const {validateSpeedTestPage}=require('../apps/api/dist/speed-test-page');
const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service');
const {accountPublicSource}=require('../apps/api/dist/account-public-source');
const {validatePublicationSource}=require('../apps/api/dist/publication-validation');
const {WorkingVariableUsagesService}=require('../apps/api/dist/working-variable-usages.service');
const {speedTestEditableField,speedTestFieldLabel}=require('../apps/api/dist/speed-test-page-model');
const {normalizeSpeedTestPage}=require('../apps/api/dist/speed-test-page');
test('SPEED_TEST stores all accepted native copy with strict fixed keys and safe draft validation',()=>{
 const d=speedTestPageDefaults();assert.deepEqual(validateSpeedTestPage(d),[]);
 assert.equal(d.hero.h1,'Проверьте скорость вашего интернета');assert.equal(d.faq.items.length,6);
 assert.equal(Object.keys(d.preparation.steps).length,6);assert.equal(Object.keys(d.metrics.items).length,4);
 assert.match(d.tasks.items.files.body,/1000 МБ/);assert.match(d.support.items.results.body,/джиттер, если он показан/);
 const empty=structuredClone(d);empty.preparation.methods.cable.body='';assert.deepEqual(validateSpeedTestPage(empty,true),['preparation.methods.cable.body']);
 assert.throws(()=>validateSpeedTestPage(empty),e=>e.field==='preparation.methods.cable.body');
 for(const mutate of [d=>d.layout='new',d=>d.widgetUrl='https://evil.example/',d=>d.preparation.steps.extra={title:'x',body:'y'},d=>d.metrics.items.download.body='<script>alert(1)</script>',d=>d.faq.items[0].answer='{CITY_NAME}',d=>d.version='wrong']){
  const bad=structuredClone(d);mutate(bad);assert.throws(()=>validateSpeedTestPage(bad,true));
 }
});
test('SPEED_TEST catalog resolves SITE variables and preserves source snapshot',()=>{
 const source=accountPageSource();const content=speedTestPageDefaults();content.faq.items[0].answer='{SUPPORT_PHONE}';
 source.globalPages.push({id:'speed-test-page',siteId:source.site.id,type:'SPEED_TEST',cityId:null,slug:'proverit-skorost-interneta',title:'Проверка скорости',status:'PUBLISHED',blocks:[],content});
 source.seoTemplates.push({id:'seo-speed-test',kind:'SPEED_TEST',titleTemplate:'Проверка скорости',descriptionTemplate:'Измерение скорости интернета',indexState:'INDEX'});
 const before=structuredClone(source),catalog=new SiteCatalogService({}).renderSource(source);
 assert.deepEqual(source,before);assert.ok(catalog.seoByPath['/proverit-skorost-interneta']);
 assert.ok(catalog.variableUsages.some(x=>x.pageType==='SPEED_TEST'&&x.editorHref==='/templates/speed-test'));
 assert.doesNotMatch(catalog.globalPages.find(p=>p.type==='SPEED_TEST').content.faq.items[0].answer,/SUPPORT_PHONE/);
});
test('GLOBAL source resolves SPEED_TEST with its own page, and unknown pages reject',async()=>{
 const page={id:'speed-test',type:'SPEED_TEST',slug:'proverit-skorost-interneta'};
 const prisma={sitePublication:{},site:{findFirst:async()=>({id:'site'})},page:{findFirst:async q=>{assert.equal(q.where.type,'SPEED_TEST');assert.equal(q.where.cityId,null);return page;}},city:{findMany:async()=>[]}};
 // Legacy non-static mode still enforces type/slug and published source.
 const old=process.env.REBUILD_PROVIDER;process.env.REBUILD_PROVIDER='webhook';
 try{const r=await accountPublicSource(prisma,'domru-site','proverit-skorost-interneta');assert.equal(r.page.id,'speed-test');await assert.rejects(accountPublicSource(prisma,'domru-site','anything'));}finally{if(old===undefined)delete process.env.REBUILD_PROVIDER;else process.env.REBUILD_PROVIDER=old;}
});
test('SPEED_TEST is optional, unique, canonical and does not change existing routes',()=>{
 const source=accountPageSource(), before=buildReleaseOneRoutes(source.cities,source.globalPages);
 const page={type:'SPEED_TEST',slug:'proverit-skorost-interneta'};
 const after=buildReleaseOneRoutes(source.cities,[...source.globalPages,page]);
 assert.deepEqual(after.filter(r=>r.id!=='SPEED_TEST'),before);
 assert.equal(after.find(r=>r.id==='SPEED_TEST').path,'/proverit-skorost-interneta');
 assert.throws(()=>buildReleaseOneRoutes(source.cities,[...source.globalPages,{...page,slug:'wrong'}]));
 assert.throws(()=>buildReleaseOneRoutes(source.cities,[...source.globalPages,page,page]));
 assert.throws(()=>buildReleaseOneRoutes([{...source.cities[0],slug:page.slug}],[...source.globalPages,page]));
});

test('SPEED_TEST CMS recovery targets exact schema fields and normalized content is independent',()=>{
 for(const field of ['hero.h1','preparation.steps.vpn.body','metrics.units.formula','tasks.items.files.caption','support.items.results.body','faq.title','faq.items','faq.items.49.answer']) {
  assert.equal(speedTestEditableField(field),true,field);assert.notEqual(speedTestFieldLabel(field),field);
 }
 for(const field of ['version','widgetUrl','support.phone','support.hours','preparation.steps.extra.body','preparation.steps','faq.items.-1.answer','faq.items.50.answer']) assert.equal(speedTestEditableField(field),false,field);
 const raw=speedTestPageDefaults(),copy=normalizeSpeedTestPage(raw);copy.hero.h1='Изменение';assert.notEqual(raw.hero.h1,copy.hero.h1);
});

function sourceWithSpeedTest(){
 const source=accountPageSource();
 source.globalPages.push({id:'speed-test-page',siteId:source.site.id,type:'SPEED_TEST',cityId:null,slug:'proverit-skorost-interneta',title:'Проверка скорости',status:'PUBLISHED',blocks:[],content:speedTestPageDefaults()});
 source.seoTemplates.push({id:'speed-test-seo',kind:'SPEED_TEST',titleTemplate:'Проверка скорости интернета',descriptionTemplate:'Измерьте входящую и исходящую скорость, пинг и джиттер.',indexState:'INDEX'});
 return source;
}

test('SPEED_TEST publication identifies exact missing native field and requires its own SEO without altering source',()=>{
 const source=sourceWithSpeedTest(),before=structuredClone(source),now=new Date('2026-11-14T08:00:00Z');
 const check=()=>validatePublicationSource(source,{appVersion:'0.1.0',requestedById:null,siteRevision:7,now},(value,date)=>new SiteCatalogService({}).renderSource(value,date));
 assert.notEqual(check().report.outcome,'BLOCKED');assert.deepEqual(source,before);
 const page=source.globalPages.at(-1);page.content.diagnosis.items.cable.body='';
 const invalid=check();assert.equal(invalid.report.outcome,'BLOCKED');assert.equal(invalid.catalog,null);
 assert.ok(invalid.report.issues.some(issue=>issue.path==='/proverit-skorost-interneta'&&issue.template==='SPEED_TEST'&&issue.block==='speed-test'&&issue.field==='diagnosis.items.cable.body'&&issue.reason==='REQUIRED'));
 page.content=speedTestPageDefaults();source.seoTemplates=source.seoTemplates.filter(template=>template.kind!=='SPEED_TEST');
 assert.equal(check().report.outcome,'BLOCKED');
});

test('SPEED_TEST working variable registry indexes nested native copy and points to its own editor',async()=>{
 const content=speedTestPageDefaults();content.preparation.steps.vpn.body='Позвоните {SUPPORT_PHONE}';content.tasks.items.files.caption='Подключение {CONNECTION_PHONE}';
 const tx={site:{findUnique:async()=>({status:'PUBLISHED',workingRevision:7})},page:{findMany:async()=>[{id:'speed',type:'SPEED_TEST',status:'PUBLISHED',content,blocks:[],title:'Проверка скорости'}]},pageTemplate:{findMany:async()=>[]},tariff:{findMany:async()=>[]},seoTemplate:{findMany:async()=>[]}};
 const service=new WorkingVariableUsagesService({$transaction:async run=>run(tx)});
 const usages=await service.list('site',7);assert.equal(usages.length,2);
 assert.ok(usages.every(usage=>usage.pageType==='SPEED_TEST'&&usage.editorHref==='/templates/speed-test'));
 assert.ok(usages.some(usage=>usage.code==='SUPPORT_PHONE'&&usage.path.endsWith('preparation.steps.vpn.body')));
});

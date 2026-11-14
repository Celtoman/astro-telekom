const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { AdminSpeedTestController } = require('../apps/api/dist/admin-speed-test.controller');
const { AddressChecksController } = require('../apps/api/dist/address-checks.controller');
const { AddressSuggestionsController } = require('../apps/api/dist/address-suggestions.controller');
const { PublicLeadsController } = require('../apps/api/dist/public-leads.controller');
const { speedTestPageDefaults } = require('../apps/api/dist/speed-test-page-defaults');
const { SPEED_TEST_PAGE_SLUG } = require('../apps/api/dist/speed-test-page-model');
const { LEAD_CONSENT_VERSION } = require('../apps/api/dist/lead-consent');
const { AdminPagesController } = require('../apps/api/dist/admin-pages.controller');

async function served(run) {
  const old={fetch:global.fetch,provider:process.env.REBUILD_PROVIDER,token:process.env.ADMIN_API_TOKEN,url:process.env.STATIC_PUBLICATION_URL};
  process.env.REBUILD_PROVIDER='static';process.env.ADMIN_API_TOKEN='s'.repeat(32);process.env.STATIC_PUBLICATION_URL='http://web:8081';
  const cities=[{id:'city-a',slug:'test-a',name:'Киров',region:{name:'Кировская область'},pages:[],tariffs:[]},{id:'city-b',slug:'test-b',name:'Киров',region:{name:'Калужская область'},pages:[],tariffs:[]}];
  const catalog={site:{slug:'domru-site'},cities,globalPages:[{id:'page-speed-test',type:'SPEED_TEST',slug:SPEED_TEST_PAGE_SLUG,content:speedTestPageDefaults()}]};
  const publication={id:'pub-serving',siteId:'site-1',siteRevision:7,status:'RUNNING',catalog};
  global.fetch=async()=>Response.json({publicationId:publication.id,siteId:'site-1',siteSlug:'domru-site',siteRevision:7,catalogDigest:createHash('sha256').update(JSON.stringify(catalog)).digest('hex')});
  const prisma={sitePublication:{findUnique:async()=>publication},site:{findUnique:async()=>assert.fail('working site must not override serving source')},page:{findFirst:async()=>assert.fail('working page must not override serving source')},city:{findFirst:async()=>assert.fail('working city must not override serving source')}};
  try { await run(prisma,publication); }
  finally { global.fetch=old.fetch;for(const [key,value] of [['REBUILD_PROVIDER',old.provider],['ADMIN_API_TOKEN',old.token],['STATIC_PUBLICATION_URL',old.url]]) if(value===undefined)delete process.env[key];else process.env[key]=value; }
}
const suggestion={value:'Калужская область, г Киров, ул Тестовая, д 1',unrestricted_value:'Калужская область, г Киров, ул Тестовая, д 1',data:{city:'Киров',region:'Калужская обл',house:'1',result:'Калужская область, г Киров, ул Тестовая, д 1'}};

test('GLOBAL check uses actual cleaned city/region and source from serving, ignoring forged/default city',async()=>served(async(prisma)=>{
  let saved,requested;
  prisma.addressCheck={create:async({data})=>{saved=data;return{id:'check-1'}}};
  const controller=new AddressChecksController({check:async input=>{requested=input;return{status:'UNAVAILABLE',available:false,alternatives:[],message:'Нет подключения'}}},prisma,{clean:async()=>suggestion});
  const result=await controller.check({siteSlug:'domru-site',citySlug:'kazan',pageScope:'GLOBAL',pageSlug:SPEED_TEST_PAGE_SLUG,address:suggestion.value,suggestion});
  assert.equal(saved.cityId,'city-b');assert.equal(saved.siteId,'site-1');assert.equal(saved.pageId,'page-speed-test');assert.equal(requested.citySlug,'test-b');assert.equal(result.citySlug,'test-b');
}));
test('GLOBAL suggest has no fabricated city boost and rejects absent published source before external calls',async()=>served(async(prisma,publication)=>{
  let boost='not-called',calls=0;
  const controller=new AddressSuggestionsController({locate:async()=>null,suggest:async(_q,b)=>{boost=b;calls++;return[]}},prisma);
  await controller.suggest({query:'Киров',pageScope:'GLOBAL',pageSlug:SPEED_TEST_PAGE_SLUG},{cookies:{address_city_kladr:'none'}},{setCookie(){}});
  assert.equal(boost,undefined);assert.equal(calls,1);
  publication.catalog.globalPages=[];
  await assert.rejects(controller.suggest({query:'Киров',pageScope:'GLOBAL',pageSlug:SPEED_TEST_PAGE_SLUG},{cookies:{}},{setCookie(){}}),/обслуживаемой/);
  assert.equal(calls,1);
}));
test('GLOBAL lead cannot reuse a city-only/null/foreign source check or request callback/tariff privileges',async()=>served(async(prisma)=>{
  prisma.lead={findUnique:async()=>null};
  const controller=new PublicLeadsController(prisma,{},{});
  const body={siteSlug:'domru-site',citySlug:'test-b',pageScope:'GLOBAL',pageSlug:SPEED_TEST_PAGE_SLUG,phone:'+7 (912) 000-00-01',submissionKey:'synthetic-speed-test-lead',consentVersion:LEAD_CONSENT_VERSION,consentAccepted:true,addressCheckId:'check-1',address:suggestion.value,objectType:'apartment'};
  for(const pageId of [null,'foreign-page']) {
    prisma.addressCheck={findFirst:async()=>({id:'check-1',siteId:'site-1',cityId:'city-b',pageId,status:'AVAILABLE',address:suggestion.value,objectType:'apartment'})};
    await assert.rejects(controller.create(body,{ip:'127.0.0.1'}),/страниц/);
  }
  await assert.rejects(controller.create({...body,reasonCode:'callback_consultation'},{}),/источник/);
  await assert.rejects(controller.create({...body,tariffSlug:'tariff'},{}),/источник/);
}));
function workspace() {
  const site={slug:'domru-site',workingRevision:9,publishedRevision:9,connectionPhone:'78005557244',supportPhone:'78002507777'};
  const page={id:'page-speed-test',siteId:'site-1',content:speedTestPageDefaults(),status:'PUBLISHED'};
  const tx={site:{findUnique:async()=>site},page:{findFirst:async()=>page,update:async({data})=>{page.content=data.content;return page}}};
  const prisma={...tx,$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(tx)}};
  const publications={recordWorkingRevision:async()=>({siteRevision:++site.workingRevision})};
  return {site,page,prisma,controller:new AdminSpeedTestController(prisma,publications)};
}
test('SPEED_TEST save retains safe incomplete draft, rejects stale revision/unknown keys and never publishes',async()=>{
  const f=workspace(),content=speedTestPageDefaults();content.faq.items[0].answer='';
  const result=await f.controller.save('site-1',{expectedWorkingRevision:9,content});assert.equal(result.workingRevision,10);assert.ok(result.missingFields.includes('faq.items.0.answer'));
  await assert.rejects(f.controller.save('site-1',{expectedWorkingRevision:9,content}),e=>e.getStatus()===409);
  assert.equal(f.site.publishedRevision,9);assert.equal(f.page.content.faq.items[0].answer,'');
  await assert.rejects(f.controller.save('site-1',{expectedWorkingRevision:10,content,layout:[]}),e=>e.getStatus()===400);
});

test('SPEED_TEST endpoint is guarded and returns the updated page while serializable conflicts become409',async()=>{
 assert.equal(Reflect.getMetadata('path',AdminSpeedTestController),'admin/sites/:siteId/speed-test');
 assert.ok(Reflect.getMetadata('__guards__',AdminSpeedTestController).some(guard=>guard.name==='AdminTokenGuard'));
 const f=workspace(),content=speedTestPageDefaults();content.hero.h1='Сохранённый заголовок';
 const saved=await f.controller.save('site-1',{expectedWorkingRevision:9,content});assert.equal(saved.page.id,f.page.id);assert.equal(saved.pageId,f.page.id);assert.equal(saved.content.hero.h1,content.hero.h1);
 f.prisma.$transaction=async()=>{throw {code:'P2034'}};
 await assert.rejects(f.controller.save('site-1',{expectedWorkingRevision:10,content}),error=>error.getStatus()===409);
});

test('generic Page writer cannot create SPEED_TEST or replace its dedicated revision-guarded content',async()=>{
 const tx={page:{findUnique:async()=>({id:'speed',type:'SPEED_TEST'}),update:async()=>assert.fail('generic update must be rejected')}};
 const controller=new AdminPagesController({$transaction:async run=>run(tx)},{});
 await assert.rejects(controller.create({type:'SPEED_TEST',siteId:'site',cityId:null,slug:SPEED_TEST_PAGE_SLUG,title:'Попытка обхода'}),error=>error.getStatus()===400);
 await assert.rejects(controller.update('speed',{content:{text:'Попытка обхода'}}),error=>error.getStatus()===400);
 tx.page.findUnique=async()=>({id:'other',type:'COVERAGE'});
 await assert.rejects(controller.update('other',{type:'SPEED_TEST'}),error=>error.getStatus()===400);
});
test('CMS published view uses pinned RUNNING publication rather than latest SQL SUCCEEDED',async()=>served(async(servingPrisma)=>{
  const f=workspace(),published=speedTestPageDefaults();published.hero.h1='Обслуживаемый заголовок';
  f.prisma.sitePublication=servingPrisma.sitePublication;
  f.prisma.$queryRaw=async query=>{assert.ok(query.values.includes('pub-serving'));assert.ok(query.values.includes('site-1'));return[{content:[{type:'SPEED_TEST',content:published}],revision:7}]};
  const result=await f.controller.get('site-1');assert.equal(result.publishedRevision,7);assert.equal(result.published.hero.h1,published.hero.h1);assert.notEqual(result.content.hero.h1,published.hero.h1);
}));
test('CMS can edit working data when serving unavailable, without inventing SQL published fallback',async()=>served(async()=>{
  const f=workspace();global.fetch=async()=>{throw new Error('offline')};
  f.prisma.$queryRaw=async()=>assert.fail('must not fall back to latest SQL SUCCEEDED');
  const result=await f.controller.get('site-1');assert.equal(result.publishedAvailable,false);assert.equal(result.publishedRevision,null);assert.ok(result.content.hero.h1);
}));

test('GLOBAL positive lead uses serving city/page and retries are idempotent', async () => served(async (prisma, publication) => {
  const city = publication.catalog.cities[1], page = publication.catalog.globalPages[0];
  const check = { id:'check-1',siteId:publication.siteId,cityId:city.id,pageId:page.id,status:'AVAILABLE',address:suggestion.value,objectType:'apartment',response:{integration:'tarifnik',suggestion,providers:{'1':'Дом.ру'},targetProviderId:'1',hasAnyProvider:true,hasTargetProvider:true} };
  let stored,writes=0,notifications=0,decisions=0;
  prisma.lead={findUnique:async()=>stored?{id:'lead-1',status:'NEW',...stored,site:{slug:'domru-site'},city:{slug:city.slug},page:{slug:page.slug,type:'SPEED_TEST'},tariff:null}:null,findMany:async()=>[]};
  prisma.addressCheck={findFirst:async()=>check};
  prisma.$transaction=async fn=>fn({lead:{create:async({data})=>{writes++;stored=data;return{id:'lead-1',status:'NEW'}}}});
  const controller=new PublicLeadsController(prisma,{enqueueTracked:async()=>{decisions++}},{create:async()=>({id:'notification-1'}),enqueueTracked:async()=>{notifications++}});
  const body={siteSlug:'domru-site',citySlug:city.slug,pageScope:'GLOBAL',pageSlug:SPEED_TEST_PAGE_SLUG,phone:'+7 (912) 000-00-01',submissionKey:'11111111-1111-4111-8111-111111111111',consentVersion:LEAD_CONSENT_VERSION,consentAccepted:true,reasonCode:'new_connection',serviceType:'INTERNET',addressCheckId:check.id,address:check.address,objectType:'apartment'};
  const first=await controller.create(body,{}),replay=await controller.create(body,{});
  assert.equal(first.id,'lead-1');assert.equal(replay.id,first.id);assert.equal(stored.siteId,publication.siteId);assert.equal(stored.cityId,city.id);assert.equal(stored.pageId,page.id);assert.equal(stored.addressCheckId,check.id);assert.equal(stored.processingStatus,'DECISION_PENDING');assert.equal(writes,1);assert.equal(notifications,1);assert.equal(decisions,1);
}));

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildReleaseOneRoutes}=require('../apps/api/dist/public-route-policy');
const {accountPageSource}=require('./helpers/account-page-source.cjs');
const {officialSitePageDefaults}=require('../apps/api/dist/official-site-page-defaults');
const {validateOfficialSitePage}=require('../apps/api/dist/official-site-page');
const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service');
const {accountPublicSource}=require('../apps/api/dist/account-public-source');
test('minimum CMS has seven fixed slots, accepted eight FAQ and strict safe draft validation',()=>{
 const d=officialSitePageDefaults();assert.deepEqual(validateOfficialSitePage(d),[]);
 assert.equal(Object.keys(d.images).length,7);assert.equal(d.faq.items.length,8);
 assert.equal(d.hero.intro.split('\n\n').length,4);
 const empty=structuredClone(d);empty.hero.h1='';assert.deepEqual(validateOfficialSitePage(empty,true),['hero.h1']);
 assert.throws(()=>validateOfficialSitePage(empty),e=>e.field==='hero.h1');
 for(const mutate of [d=>d.layout='new',d=>d.officialUrl='https://evil.example/',d=>d.images.hero.src='/images/../../secret.png',d=>d.faq.items[0].answer='{CITY_NAME}',d=>d.version='wrong']){
  const bad=structuredClone(d);mutate(bad);assert.throws(()=>validateOfficialSitePage(bad,true));
 }
});
test('OFFICIAL_SITE catalog resolves SITE variables and preserves source snapshot',()=>{
 const source=accountPageSource();const content=officialSitePageDefaults();content.faq.items[0].answer='{SUPPORT_PHONE}';
 source.globalPages.push({id:'official-page',siteId:source.site.id,type:'OFFICIAL_SITE',cityId:null,slug:'official-site-domru',title:'Официальный сайт',status:'PUBLISHED',blocks:[],content});
 source.seoTemplates.push({id:'seo-official',kind:'OFFICIAL_SITE',titleTemplate:'Официальный сайт',descriptionTemplate:'Обзор сайта провайдера',indexState:'INDEX'});
 const before=structuredClone(source),catalog=new SiteCatalogService({}).renderSource(source);
 assert.deepEqual(source,before);assert.ok(catalog.seoByPath['/official-site-domru']);
 assert.ok(catalog.variableUsages.some(x=>x.pageType==='OFFICIAL_SITE'&&x.editorHref==='/templates/official-site'));
 assert.doesNotMatch(catalog.globalPages.find(p=>p.type==='OFFICIAL_SITE').content.faq.items[0].answer,/SUPPORT_PHONE/);
});
test('GLOBAL source resolves OFFICIAL_SITE with its own page, and unknown pages reject',async()=>{
 const page={id:'official',type:'OFFICIAL_SITE',slug:'official-site-domru'};
 const prisma={sitePublication:{},site:{findFirst:async()=>({id:'site'})},page:{findFirst:async q=>{assert.equal(q.where.type,'OFFICIAL_SITE');assert.equal(q.where.cityId,null);return page;}},city:{findMany:async()=>[]}};
 // Legacy non-static mode still enforces type/slug and published source.
 const old=process.env.REBUILD_PROVIDER;process.env.REBUILD_PROVIDER='webhook';
 try{const r=await accountPublicSource(prisma,'domru-site','official-site-domru');assert.equal(r.page.id,'official');await assert.rejects(accountPublicSource(prisma,'domru-site','anything'));}finally{if(old===undefined)delete process.env.REBUILD_PROVIDER;else process.env.REBUILD_PROVIDER=old;}
});
test('OFFICIAL_SITE is optional, unique, canonical and does not change existing routes',()=>{
 const source=accountPageSource(), before=buildReleaseOneRoutes(source.cities,source.globalPages);
 const page={type:'OFFICIAL_SITE',slug:'official-site-domru'};
 const after=buildReleaseOneRoutes(source.cities,[...source.globalPages,page]);
 assert.deepEqual(after.filter(r=>r.id!=='OFFICIAL_SITE'),before);
 assert.equal(after.find(r=>r.id==='OFFICIAL_SITE').path,'/official-site-domru');
 assert.throws(()=>buildReleaseOneRoutes(source.cities,[...source.globalPages,{...page,slug:'wrong'}]));
 assert.throws(()=>buildReleaseOneRoutes(source.cities,[...source.globalPages,page,page]));
 assert.throws(()=>buildReleaseOneRoutes([{...source.cities[0],slug:page.slug}],[...source.globalPages,page]));
});

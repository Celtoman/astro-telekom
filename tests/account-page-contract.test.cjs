const { test } = require('node:test');
const assert = require('node:assert/strict');
const { accountPageDefaults } = require('../apps/api/dist/account-page-defaults');
const { validateAccountPage } = require('../apps/api/dist/account-page');
const { ACCOUNT_IMAGE_SLOTS } = require('../apps/api/dist/account-page-model');
const { buildReleaseOneRoutes } = require('../apps/api/dist/public-route-policy');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation');
const { accountAddressCity } = require('../apps/api/dist/account-public-source');
const { accountPageSource } = require('./helpers/account-page-source.cjs');
const { addressPageSource } = require('./helpers/address-page-source.cjs');

test('ACCOUNT minimum preserves14fixed image slots/6FAQ and independent defaults', () => {
  const a=accountPageDefaults(),b=accountPageDefaults();
  assert.deepEqual(validateAccountPage(a),[]); assert.equal(Object.keys(a.images).length,14);
  assert.deepEqual(Object.keys(a.images),Object.keys(ACCOUNT_IMAGE_SLOTS));
  assert.equal(a.hero.intro.split('\n\n').length,4); assert.equal(a.faq.items.length,6);
  assert.equal(a.images.appScreen.caption,undefined);
  a.hero.h1='Изменённый заголовок'; assert.notEqual(a.hero.h1,b.hero.h1);
});
test('ACCOUNT allows incomplete safe draft but publication names exact required field', () => {
  const data=accountPageDefaults();data.hero.h1='';data.faq.items[1].answer='';
  assert.deepEqual(validateAccountPage(data,true),['hero.h1','faq.items.1.answer']);
  assert.throws(()=>validateAccountPage(data),e=>e.field==='hero.h1' && e.reason==='REQUIRED');
});
test('ACCOUNT rejects instructions/prices/layout/unsafe URL and caption added to app', () => {
  for(const change of [d=>{d.dailyPrice=10},d=>{d.hero.instructions='text'},d=>{d.images.appScreen.caption='caption'},d=>{d.faq.items.push({question:'q',answer:'a',position:1})},d=>{d.loginUrl='https://attacker.example/login'},d=>{d.loginUrl='javascript:alert(1)'},d=>{d.images.heroLogin.src='https://attacker.example/images/file-aaaaaaaaaaaaaaaa.png'},d=>{d.images.heroLogin.src='/images/../../secret-aaaaaaaaaaaaaaaa.png'},d=>{d.version='99'}]) {
    const data=accountPageDefaults();change(data);assert.throws(()=>validateAccountPage(data,true));
  }
  const data=accountPageDefaults();data.faq.items[0].answer='{CITY_NAME}';assert.throws(()=>validateAccountPage(data),e=>e.reason==='VARIABLE');
  data.faq.items=Array.from({length:51},()=>({question:'q',answer:'a'}));assert.throws(()=>validateAccountPage(data));
});
test('old route snapshot remains unchanged; ACCOUNT adds exactly one route and collisions reject', () => {
  const old=addressPageSource(),next=accountPageSource();
  const routes=buildReleaseOneRoutes(old.cities,old.globalPages,{addressCheck:true});
  const added=buildReleaseOneRoutes(next.cities,next.globalPages,{addressCheck:true});
  assert.equal(added.length,routes.length+1);assert.equal(added.filter(r=>r.id==='ACCOUNT').length,1);
  assert.deepEqual(added.filter(r=>r.id!=='ACCOUNT'),routes);
  assert.throws(()=>buildReleaseOneRoutes([{...next.cities[0],slug:'lichnyy-kabinet-dom-ru'}],next.globalPages));
  assert.throws(()=>buildReleaseOneRoutes(next.cities,[...next.globalPages,next.globalPages.at(-1)]));
  assert.throws(()=>buildReleaseOneRoutes(next.cities,next.globalPages.map(p=>p.type==='ACCOUNT'?{...p,slug:'wrong'}:p)));
});
test('ACCOUNT catalog resolves only SITE FAQ fields and keeps all original data immutable', () => {
  const source=accountPageSource(),before=structuredClone(source);
  const catalog=new SiteCatalogService({}).renderSource(source);
  const page=catalog.globalPages.find(p=>p.type==='ACCOUNT');
  assert.equal(page.content.faq.items.length,6);assert.doesNotMatch(page.content.faq.items[0].answer,/\{SUPPORT_PHONE\}/);
  assert.ok(catalog.variableUsages.some(u=>u.pageType==='ACCOUNT' && u.editorHref==='/templates/account' && u.code==='SUPPORT_PHONE'));
  assert.ok(catalog.seoByPath['/lichnyy-kabinet-dom-ru']);assert.deepEqual(source,before);
});
test('global address city derives from cleaned locality AND region, never default/example city', () => {
  const cities=[{id:'a',slug:'test-a',name:'Киров',region:{name:'Кировская область'}},{id:'b',slug:'test-b',name:'Киров',region:{name:'Калужская область'}}];
  assert.equal(accountAddressCity(cities,{city:'г Киров',region:'Калужская обл'}).id,'b');
  assert.throws(()=>accountAddressCity(cities,{city:'Киров'}));
  assert.throws(()=>accountAddressCity([...cities,cities[0]],{city:'Киров',region:'Кировская область'}));
  assert.throws(()=>accountAddressCity(cities,{city:'Казань',region:'Татарстан'}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderSupportIntro,renderSupportBody} from '../apps/web/src/lib/support-page-render.ts';
import {buildPreviewDocument} from '../apps/admin/src/lib/preview-document.mjs';
const require=createRequire(import.meta.url);
const {supportPageSource}=require('./helpers/support-page-source.cjs');
const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service');
const {validatePublicationSource}=require('../apps/api/dist/publication-validation');
const {resolveCatalogVariables}=require('../apps/api/dist/catalog-variables');
const {supportPageDefaults}=require('../apps/api/dist/support-page-defaults');
const {supportPlainText}=require('../apps/api/dist/support-rich-text');
const service=new SiteCatalogService({});

test('SUPPORT composition and destinations survive JSONB object-key reordering',()=>{
 const catalog=service.renderSource(supportPageSource()),city=catalog.cities[0],content=city.pages.find(p=>p.type==='CITY_SUPPORT').content;
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value;
 assert.equal(renderSupportIntro(reorder(content),catalog.site,city),renderSupportIntro(content,catalog.site,city));
 assert.equal(renderSupportBody(reorder(content),catalog.site,city),renderSupportBody(content,catalog.site,city));
 const chips=[...renderSupportIntro(reorder(content),catalog.site,city).matchAll(/class="support-chip" href="([^"]+)">([^<]+)<\/a>/g)];
 assert.equal(chips[0][1],'#support-phones');assert.equal(chips[0][2],content.quickLinks.hotline);assert.equal(chips[6][1],'#support-app');assert.equal(chips[6][2],content.quickLinks.app);
});

test('SUPPORT public page and saved preview preserve all cities, typed links and the complete phone source',()=>{
 const source=supportPageSource(),catalog=service.renderSource(source);
 assert.equal(catalog.routes.filter(r=>r.kind==='CITY_SUPPORT').length,catalog.cities.length);
 for(const city of catalog.cities){
  const c=city.pages.find(p=>p.type==='CITY_SUPPORT').content;
  const intro=renderSupportIntro(c,catalog.site,city),body=renderSupportBody(c,catalog.site,city);
  assert.ok(intro.indexOf('data-support-block="quickLinks"')<intro.indexOf('data-support-block="introduction"'));
  assert.equal((intro.match(/class="support-chip"/g)||[]).length,7);
  assert.ok(body.includes('href="/'+city.slug+'/proverka-podklyucheniya-k-domru-po-adresu"'));
  assert.ok(body.includes('href="/goroda-obsluzhivaniya"'));assert.ok(body.includes('href="#support-faq"'));
  const phoneTags=[...body.matchAll(/<img data-support-image="phone"[^>]*>/g)];assert.equal(phoneTags.length,2);
  assert.equal(phoneTags[0][0].match(/src="([^"]+)"/)[1],c.phones.image.src);assert.equal(phoneTags[1][0].match(/src="([^"]+)"/)[1],c.phones.image.src);
  assert.equal((body.match(/<details class="home-faq-item"/g)||[]).length,6);
  assert.doesNotMatch(intro+body,/\{[A-Z_]+\}|support:account|style=/);
  const preview=buildPreviewDocument(catalog,'/'+city.slug+'/tehpodderzhka');
  assert.ok(preview.includes('class="support-page"'));assert.equal((preview.match(/data-support-image="phone"/g)||[]).length,2);
  assert.doesNotMatch(preview,/href="(?:tel:|#support-|\/lichnyy-kabinet)/);
 }
});
test('SUPPORT rich text resolves variable values as text without creating new marks or link targets',()=>{
 const c=supportPageDefaults();c.introduction.first='Город: **{CITY_NAME}**';
 const result=resolveCatalogVariables({globalPages:[],cities:[{name:'[x](account) **y**',namePrepositional:'Тесте',nameGenitive:'Теста',tariffFacts:{minPrice:799,maxSpeed:500,maxChannels:190},pages:[{id:'p',type:'CITY_SUPPORT',content:c}]}]}, {site:{connectionPhone:'78005557244',supportPhone:'78002507777',corporatePhone:'78002228634',connectionHours:'Рабочее время',supportHours:'Всегда',onlineApplicationsHours:'Всегда',callbackWithinMinutes:15},provider:{name:'Дом.ру'},now:new Date()});
 // Use only a variable-bearing text section here; other required city tokens need actual facts.
 assert.equal(supportPlainText(result.cities[0].pages[0].content.introduction.first),'Город: [x](account) **y**');
});
test('SUPPORT publication preflight includes its URLs and blocks incomplete fields with an editor location',()=>{
 const source=supportPageSource(),input={appVersion:'test',siteRevision:1};
 const good=validatePublicationSource(source,input,(s,n)=>service.renderSource(s,n));
 assert.notEqual(good.report.outcome,'BLOCKED',JSON.stringify(good.report.issues));
 for(const city of source.cities)assert.ok(good.report.checkedPaths.includes('/'+city.slug+'/tehpodderzhka'));
 source.pageTemplates.find(t=>t.kind==='CITY_SUPPORT').blocks.find(b=>b.blockType==='support.callback').data.intro='';
 const bad=validatePublicationSource(source,input,(s,n)=>service.renderSource(s,n));
 assert.equal(bad.report.outcome,'BLOCKED');assert.ok(bad.report.issues.some(i=>i.template==='CITY_SUPPORT'&&i.field==='callback.intro'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {renderOfficialSiteIntro,renderOfficialSiteBody} from '../apps/web/src/lib/official-site-render.ts';
const require=createRequire(import.meta.url);
const {SiteValuesService}=require('../apps/api/dist/site-values.service.js');
const {resolveVariableText}=require('../apps/api/dist/variable-registry.js');
const content=JSON.parse(await readFile(new URL('../apps/api/src/assets/official-site-page-v1.json',import.meta.url),'utf8'));

for(const item of content.faq.items)item.answer=item.answer.replace('{CORPORATE_PHONE}','8-800-222-86-34');

test('official page preserves original brand spellings and owner captions/alt without linking the plain official URL',()=>{
 const intro=renderOfficialSiteIntro(content),body=renderOfficialSiteBody(content);
 assert.match(intro,/>Официальный сайт провайдера Дом ру<\/h1>/);
 assert.doesNotMatch(intro,/<figcaption>|<p class="official-url">[^<]*<a/);
 assert.match(body,/Яндекс Плюс/);assert.doesNotMatch(body,/Иллюстрация:/);
 for(const alt of ['Главное меню сайта Дом ру','Карточки с услугами и сервисами','Популярные тарифы','Роутеры и ТВ-приставки Домру','Возможности личного кабинета'])assert.ok(body.includes(`alt="${alt}"`),alt);
});
test('all eight official FAQ phone occurrences, including corporate and the last two answers, are clickable',()=>{
 const body=renderOfficialSiteBody(content);
 assert.equal((body.match(/href="tel:/g)||[]).length,8);
 assert.match(body,/href="tel:\+78002228634"/);
 const supportAnswer=body.slice(body.indexOf('Как отключить'));
 assert.match(supportAnswer,/href="tel:\+78002507777"/);
});
test('corporate contact is a guarded site value that preserves other settings and rejects stale writes',async()=>{
 let row={id:'s',name:'Site',slug:'domru-site',connectionPhone:'78005557244',supportPhone:'78002507777',workingRevision:4,publishedRevision:3,settings:{unrelated:{keep:true}}};let recorded;
 const tx={site:{findUnique:async()=>structuredClone(row),update:async({data})=>(row={...row,...data})}};
 const service=new SiteValuesService({site:tx.site,$transaction:async fn=>fn(tx)},{recordWorkingRevision:async(_tx,event)=>(recorded=event,{siteRevision:5})});
 const saved=await service.update({siteId:'s',expectedWorkingRevision:4,connectionPhone:row.connectionPhone,supportPhone:row.supportPhone,corporatePhone:'8-800-222-86-34'});
 assert.equal(saved.corporatePhone,'78002228634');assert.deepEqual(row.settings.unrelated,{keep:true});assert.ok(recorded.changedFields.includes('settings.contactPhones.corporatePhone'));
 row.workingRevision=5;await assert.rejects(service.update({siteId:'s',expectedWorkingRevision:4,connectionPhone:row.connectionPhone,supportPhone:row.supportPhone,corporatePhone:'88002228634'}),/ревизи/);
 await assert.rejects(service.update({siteId:'s',expectedWorkingRevision:5,connectionPhone:row.connectionPhone,supportPhone:row.supportPhone,corporatePhone:'bad'}));
});
test('corporate phone variable resolves from the current context rather than a fixed FAQ number',()=>{
 const a=resolveVariableText('{CORPORATE_PHONE}',{site:{corporatePhone:'78002228634'}},{path:'faq.answer',field:'TEXT'});
 const b=resolveVariableText('{CORPORATE_PHONE}',{site:{corporatePhone:'78001112233'}},{path:'faq.answer',field:'TEXT'});
 assert.equal(a.text,'+7 (800) 222-86-34');assert.equal(b.text,'+7 (800) 111-22-33');
});
test('saving an already empty optional corporate phone is a no-op for settings and revision',async()=>{
 const current={id:'s',name:'Site',slug:'site',connectionPhone:'78005557244',supportPhone:'78002507777',workingRevision:4,publishedRevision:3,settings:{unrelated:{keep:true}}};let update;
 const tx={site:{findUnique:async()=>structuredClone(current),update:async({data})=>{update=data;return {...current,...data};}}};
 const service=new SiteValuesService({$transaction:fn=>fn(tx)},{recordWorkingRevision:()=>assert.fail('no-op must not create a revision')});
 const saved=await service.update({siteId:'s',expectedWorkingRevision:4,connectionPhone:current.connectionPhone,supportPhone:current.supportPhone,corporatePhone:''});
 assert.equal(update.settings,undefined);assert.equal(saved.workingRevision,4);assert.equal(saved.corporatePhone,null);
});
test('corporate contact compares working and immutable published snapshots independently',()=>{
 const {buildVariableCatalogView}=require('../apps/api/dist/variable-catalog.js');
 const catalog=phone=>({site:{corporatePhone:phone},cities:[],globalPages:[],variableSources:{providerName:'Дом.ру',resolvedAt:'2026-11-13T00:00:00Z'},variableUsages:[]});
 const published=catalog('+7 (800) 222-86-34'),copy=structuredClone(published);
 const view=buildVariableCatalogView({siteId:'s',workingRevision:5,publishedRevision:4,working:catalog('+7 (800) 111-22-33'),published});
 const item=view.items.find(item=>item.code==='CORPORATE_PHONE');
 assert.deepEqual([item.working.value,item.published.value,item.changed],['+7 (800) 111-22-33','+7 (800) 222-86-34',true]);
 assert.deepEqual(published,copy);
 const historical=resolveVariableText('{CORPORATE_PHONE}',{site:{}},{path:'faq.answer',field:'TEXT'});
 assert.equal(historical.warnings.length,1);
});

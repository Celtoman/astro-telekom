const test=require('node:test');
const assert=require('node:assert/strict');
const {supportPageDefaults}=require('../apps/api/dist/support-page-defaults');
const {validateSupportPage}=require('../apps/api/dist/support-page');
const {supportPageFromTemplate,materializeSupportPageSource}=require('../apps/api/dist/support-page-view');
const {SUPPORT_SECTION_ORDER}=require('../apps/api/dist/support-page-model');
const {supportTextRuns,supportPlainText,supportSerializeRuns,supportEditorDocument,supportEditorValue}=require('../apps/api/dist/support-rich-text');
const {captureSupportMedia}=require('../apps/api/dist/support-media-registry');
const {assertSupportMedia}=require('../apps/api/dist/support-media-model');
const {newsMediaUseKey}=require('../apps/api/dist/news-types');
const {mediaCropKey}=require('../apps/api/dist/editorial-media');
const {AdminSupportController}=require('../apps/api/dist/admin-support.controller');
const {buildReleaseOneRoutes,RELEASE_ONE_GLOBAL_PAGES}=require('../apps/api/dist/public-route-policy');
const template=()=>{const c=supportPageDefaults();return{id:'support-template',kind:'CITY_SUPPORT',status:'PUBLISHED',titleTemplate:c.hero.h1,content:{supportVersion:c.version},blocks:SUPPORT_SECTION_ORDER.map((k,i)=>({id:'b'+i,blockType:'support.'+k,position:(i+1)*10,visible:true,data:c[k]}))};};
test('SUPPORT starts with approved fixed composition, independent FAQ and system-owned address block',()=>{
 const c=supportPageDefaults();assert.deepEqual(validateSupportPage(c),[]);assert.deepEqual(c.address,{});
 assert.equal(SUPPORT_SECTION_ORDER.length,13);assert.equal(c.faq.items.length,6);
 assert.match(c.faq.items[0].answer,/\{CONNECTION_PHONE\}/);
 assert.ok(c.faq.items.every(i=>!i.answer.includes('Ответ раскрывается')));
 assert.ok(c.phones.exampleNote.includes('Казань'));assert.ok(!c.phones.exampleNote.includes('{CITY'));
 assert.equal(c.phones.image.crop.x,502/697);assert.equal(c.phones.image.crop.width,162/697);
 assert.equal(c.phones.image.crop.height,44/519);assert.equal(c.phones.image.assetId,'');
 const injected=structuredClone(c);injected.address.title='Local override';assert.throws(()=>validateSupportPage(injected),/Unknown|Неизвестное/);
});
test('SUPPORT draft preserves missing text; publish rejects incomplete content and bad image metadata',()=>{
 const c=supportPageDefaults();c.callback.intro='';c.faq.items=[];
 assert.ok(validateSupportPage(c,true).includes('callback.intro'));assert.throws(()=>validateSupportPage(c),/заполните/);
 const b=supportPageDefaults();b.phones.image.crop.width=2;assert.throws(()=>validateSupportPage(b,true),/область/);
 const p=supportPageDefaults();p.social.image.src='https://example.test/file.png';assert.throws(()=>validateSupportPage(p),/редактор/);
 const q=supportPageDefaults();q.app.stores.googlePlay='javascript:alert(1)';assert.throws(()=>validateSupportPage(q),/HTTPS/);
});
test('SUPPORT restricted rich text roundtrips variable labels, escaping, bold and typed links',()=>{
 const runs=[{text:'Текст [скобки] ** звёзды '},{text:'{CITY_NAME}',bold:true},{text:' кабинет',target:'account'}];
 const stored=supportSerializeRuns(runs),parsed=supportTextRuns(stored);
 assert.deepEqual(parsed,runs);assert.equal(supportPlainText(stored),runs.map(r=>r.text).join(''));
 assert.equal(supportEditorValue(supportEditorDocument(stored)),stored);
 for(const bad of ['[x](javascript:alert)','[x](https://evil.test)','[x](unknown)','**не закрыто'])assert.throws(()=>supportTextRuns(bad));
 assert.throws(()=>supportEditorValue({type:'doc',content:[{type:'heading',content:[]}]}),/абзац/);
 assert.throws(()=>supportEditorValue({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x',marks:[{type:'italic'}]}]}]}),/форматирование/);
});

test('SUPPORT captures draft media before publication reports missing text fields',async()=>{
 const draft=template();draft.blocks.find(b=>b.blockType==='support.callback').data.intro='';
 assert.deepEqual(await captureSupportMedia('site',[draft],{findFirst:async()=>{throw Error('Static draft must not query uploaded assets');}}),{});
 assert.throws(()=>supportPageFromTemplate(draft),error=>error.field==='callback.intro');
});
test('SUPPORT materializes exactly one shell per captured city and never expands old snapshots',()=>{
 const t=template(),city={id:'c',name:'Город',namePrepositional:'Городе',pages:[{id:'p',type:'CITY_SUPPORT',slug:'tehpodderzhka',templateId:t.id}]};
 const source={cities:[city],pageTemplates:[t]};
 const out=materializeSupportPageSource(source);
 assert.notEqual(out,source);assert.deepEqual(out.cities[0].pages[0].content,supportPageDefaults());assert.equal(city.pages[0].content,undefined);
 const old={cities:[{...city,pages:[]}],pageTemplates:[]};assert.equal(materializeSupportPageSource(old),old);
 assert.throws(()=>materializeSupportPageSource({cities:[{...city,pages:[]}],pageTemplates:[t]}),/единственным/);
 assert.throws(()=>materializeSupportPageSource({cities:[{...city,namePrepositional:''}],pageTemplates:[t]}),/падеж/);
 const bad=template();bad.blocks[2].visible=false;assert.throws(()=>supportPageFromTemplate(bad),/состав/);
});
test('SUPPORT URL inventory is all-city and detects reserved tariff collisions',()=>{
 const globals=RELEASE_ONE_GLOBAL_PAGES.map(x=>({...x}));
 const cities=['one','two'].map(slug=>({slug,pages:[{type:'CITY_SUPPORT',slug:'tehpodderzhka'}],tariffs:[]}));
 const routes=buildReleaseOneRoutes(cities,globals,{support:true});
 assert.deepEqual(routes.filter(r=>r.kind==='CITY_SUPPORT').map(r=>r.path),['/one/tehpodderzhka','/two/tehpodderzhka']);
 assert.equal(buildReleaseOneRoutes(cities,globals).some(r=>r.kind==='CITY_SUPPORT'),false);
 cities[1].tariffs=[{slug:'tehpodderzhka'}];assert.throws(()=>buildReleaseOneRoutes(cities,globals,{support:true}),/Конфликт/);
});
test('SUPPORT media capture checks site ownership and pins full phone plus selected detail to one asset',async()=>{
 const t=template(),phone=t.blocks.find(b=>b.blockType==='support.phones').data.image;
 const prefix='a'.repeat(64),hash='b'.repeat(64),detailHash='c'.repeat(64);
 const variant=(sha,w,h)=>({key:prefix+'/'+sha+'.webp',sha256:sha,width:w,height:h,bytes:123,mimeType:'image/webp'});
 phone.assetId='asset';phone.src='/media/editorial/'+variant(hash,697,519).key;
 const derivatives={body:[variant(hash,697,519)],crops:{[mediaCropKey('body',phone.crop)]:[variant(detailHash,162,44)]}};
 const reads=[];const assets={findFirst:async args=>{reads.push(args);return args.where.siteId==='site'?{derivatives}:null;}};
 const registry=await captureSupportMedia('site',[t],assets);
 assert.equal(Object.keys(registry).length,2);assert.equal(reads[0].where.ready,true);
 const c=supportPageFromTemplate(t);assert.doesNotThrow(()=>assertSupportMedia(c,registry));
 assert.notEqual(registry[newsMediaUseKey({assetId:'asset',alt:''},'body')][0].src,registry[newsMediaUseKey({assetId:'asset',alt:'',crop:phone.crop},'body')][0].src);
 await assert.rejects(captureSupportMedia('other',[t],assets),/медиатеке/);
 const bad=structuredClone(registry);Object.values(bad)[0][0].sha256='d'.repeat(64);assert.throws(()=>assertSupportMedia(c,bad),/манифест/);
 delete derivatives.crops[mediaCropKey('body',phone.crop)];await assert.rejects(captureSupportMedia('site',[t],assets),/кадрирование/);
});
test('SUPPORT optimistic save updates content in fixed rows and preserves the entered draft on conflict',async()=>{
 let revision=3,updates=0,working=template(),record;
 const tx={site:{findUnique:async()=>({workingRevision:revision})},pageTemplate:{findUnique:async()=>structuredClone(working),update:async({data})=>{working={...working,...data};return structuredClone(working);}},pageTemplateBlock:{update:async({where,data})=>{updates++;Object.assign(working.blocks.find(b=>b.id===where.id),data);}}};
 const db={$transaction:async cb=>cb(tx)},pub={recordWorkingRevision:async(_tx,r)=>{record=r;return{siteRevision:++revision};}};
 const controller=new AdminSupportController(db,pub,{get:async()=>{throw Error('Unexpected media read');}});
 const c=supportPageDefaults();c.hero.h1='Новый заголовок в {CITY_NAME_PREPOSITIONAL}';
 const ids=working.blocks.map(b=>b.id),saved=await controller.save('site',{expectedWorkingRevision:3,content:c},{user:{id:'owner'}});
 assert.equal(saved.workingRevision,4);assert.equal(saved.content.hero.h1,c.hero.h1);assert.equal(updates,13);assert.deepEqual(working.blocks.map(b=>b.id),ids);
 assert.equal(record.entityType,'PAGE_TEMPLATE');assert.equal(record.actorId,'owner');assert.equal(record.previousSnapshot.blocks[0].data.h1,supportPageDefaults().hero.h1);
 const entered=structuredClone(c);entered.hero.h1='Сохранить мой текст';
 await assert.rejects(controller.save('site',{expectedWorkingRevision:3,content:entered}),/ревизия/);
 assert.equal(entered.hero.h1,'Сохранить мой текст');assert.equal(updates,13);
});

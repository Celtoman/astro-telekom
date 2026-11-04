const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..');
const {tariffView}=require(path.join(root,'apps/api/dist/tariff-view.js'));
const {quoteTariffConfiguration}=require(path.join(root,'apps/api/dist/tariff-configuration.service.js'));
const {normalizeCanonicalTariffCore,TARIFF_ATTRIBUTE_FIELDS}=require(path.join(root,'apps/api/dist/tariff-import.service.js'));
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),output=process.argv[3],temp=path.dirname(process.argv[2]);
const errors=[],warnings=[],expected=[],quoteCases=[],counts={published:input.published.length,working:input.working.length,archived:input.archived.length,index:input.allIndex.length};
const countBy=(rows,fn)=>rows.reduce((a,x)=>{const k=String(fn(x));a[k]=(a[k]||0)+1;return a;},{});
const present=x=>x!==null&&x!==undefined&&x!=='';
const ss=x=>x===-1?'INCLUDED':x===1?'OPTIONAL':x===0||x===undefined||x===null?'UNAVAILABLE':x;
const samples={};const addSample=(key,t,extra={})=>{samples[key]??={id:t.id,path:'/'+t.citySlug+'/'+t.slug,name:t.name,...extra};};
const fields={};for(const k of ['standardPrice','promoPrice','speed','promoText','connectionFee',...TARIFF_ATTRIBUTE_FIELDS.map(x=>x.key)]){
 const attr=TARIFF_ATTRIBUTE_FIELDS.some(x=>x.key===k);fields[k]=countBy(input.published,t=>{const v=attr?t.attributes?.[k]:t[k];return !present(v)?'absent':typeof v==='number'&&v===0||v==='0'?'zero':'present';});
}
const wm=new Map(input.working.map(t=>[t.id,t]));const comparison={missingWorking:[],different:[]};const compareKeys=['name','slug','serviceType','standardPrice','promoPrice','speed','promoText','connectionFee','availability','attributes','status','cityId'];
for(const t of input.published){const w=wm.get(t.id);if(!w)comparison.missingWorking.push(t.id);else{const diff=compareKeys.filter(k=>JSON.stringify(t[k]??null)!==JSON.stringify(w[k]??null));if(diff.length)comparison.different.push({id:t.id,path:'/'+t.citySlug+'/'+t.slug,fields:diff});}}
const canonical={published:[],archived:[]};
for(const [group,rows]of [['published',input.published],['archived',input.archived]])for(const t of rows){try{normalizeCanonicalTariffCore(t);}catch(e){canonical[group].push({id:t.id,name:t.name,error:e.message});}}
const blockCounts={},equipment={router:{},tvbox:{}},statusCounts={},videoStates={},ontStates={},priceAnomalies=[];
let quoteCount=0;
for(const t of input.published){
 const a=t.attributes||{};let v,base;
 try{v=tariffView(t);}catch(e){errors.push({stage:'tariffView',id:t.id,path:'/'+t.citySlug+'/'+t.slug,field:e.field,error:e.message});continue;}
 try{base=quoteTariffConfiguration(t,{});}catch(e){errors.push({stage:'quote default',id:t.id,error:e.message});continue;}
 const blockCodes=['hero',...(v.description?['description']:[]),...(v.cinemas.length?['cinemas']:[]),...(v.equipment.length?['equipment']:[]),...(v.game||v.services.length?['services']:[]),...(v.pricing.currentAmount!==null?['configurator']:[]),'address',...(input.published.filter(x=>x.cityId===t.cityId&&x.id!==t.id).length?['related']:[]),'faq'];
 for(const b of blockCodes)blockCounts[b]=(blockCounts[b]||0)+1;
 for(const code of ['router','tvbox']){const opt=v.equipment.find(x=>x.code===code);const key=opt?opt.options.map(x=>x.kind).join('+'):'NONE';equipment[code][key]=(equipment[code][key]||0)+1;}
 for(const k of ['srv_video_status','srv_gaming_status','srv_vkplaycloud_status','srv_litres_status','srv_staticip_status','srv_ont_status']){statusCounts[k]??={};const s=ss(a[k]);statusCounts[k][s]=(statusCounts[k][s]||0)+1;}
 const vs=ss(a.srv_video_status),vp=[a.srv_video_price,a.cctv_buyout_price,a.cctv_connection_price],complete=vp.every(present),vkey=vs==='UNAVAILABLE'?'HIDDEN':vs+' / '+(complete?'COMPLETE':'INCOMPLETE');
 videoStates[vkey]=(videoStates[vkey]||0)+1;const os=ss(a.srv_ont_status),okey=os==='UNAVAILABLE'?'HIDDEN':os+' / '+(!present(a.ont_buyout_price)?'UNKNOWN':a.ont_buyout_price===0?'ZERO':'PAID');ontStates[okey]=(ontStates[okey]||0)+1;
 addSample(v.serviceType,t);if(v.cinemas.length)addSample('cinema-'+v.cinemas.length,t);if(v.game)addSample('game-'+v.game.code,t);
 if(v.pricing.hasPromo)addSample('promo',t);if(t.connectionFee===null)addSample('connection-unknown',t);if(Number(t.connectionFee)===0)addSample('connection-free',t);
 addSample('video-'+vkey,t);addSample('ont-'+okey,t);
 if(v.description&&/<[^>]+>/.test(v.description))warnings.push({id:t.id,reason:'description has markup',sample:v.description.slice(0,180)});
 const kinds=code=>['NONE',...(base.choices.equipment.find(x=>x.code===code)?.options.map(x=>x.code)||[])];
 const serviceChoices=base.choices.services.some(x=>x.code==='video')?[[],['video']]:[[]];
 for(const router of kinds('router'))for(const tvbox of kinds('tvbox'))for(const services of serviceChoices){
  const selection={router,tvbox,services};let q;
  try{q=quoteTariffConfiguration(t,selection);}catch(e){errors.push({stage:'quote',id:t.id,selection,error:e.message});continue;}
  let monthly=Number(t.promoPrice??t.standardPrice),known=Number(t.connectionFee??0);if(ss(a.srv_ont_status)==='INCLUDED')known+=Number(a.ont_buyout_price??0);for(const code of ['router','tvbox']){const method=selection[code];if(method==='INSTALLMENT')monthly+=a[code+'_installment_price'];if(method==='BUYOUT')known+=a[code+'_buyout_price'];}
  if(services.includes('video')){monthly+=a.srv_video_price;known+=a.cctv_buyout_price+a.cctv_connection_price;}
  const once=present(t.connectionFee)?known:null;
  if(q.totals.monthly!==monthly||q.totals.knownOneTime!==known||q.totals.oneTime!==once)errors.push({stage:'arithmetic',id:t.id,selection,expected:{monthly,knownOneTime:known,oneTime:once},actual:q.totals});
  quoteCount++;if(quoteCases.length<24&&services.length)quoteCases.push({path:'/'+t.citySlug+'/'+t.slug,selection,totals:q.totals});
 }
 for(const s of ['ont','litres','staticip','vkplaycloud']){try{quoteTariffConfiguration(t,{services:[s]});errors.push({stage:'unsupported service accepted',id:t.id,s});}catch(e){}}
 if(vs==='OPTIONAL'&&!complete&&base.choices.services.some(x=>x.code==='video'))errors.push({stage:'incomplete camera selectable',id:t.id});
 if(vs==='INCLUDED'&&base.choices.services.some(x=>x.code==='video'))errors.push({stage:'included camera selectable',id:t.id});
 if(vs==='INCLUDED'&&[a.cctv_buyout_price,a.cctv_connection_price].some(x=>typeof x==='number'&&x>0))addSample('included-video-external-cost',t);
 if(v.services.some(s=>s.code==='ont'&&s.oneTimeCharges.some(c=>c.amount>0)))addSample('ont-external-cost',t);
 expected.push({path:'/'+t.citySlug+'/'+t.slug,id:t.id,name:v.name,view:v,blocks:blockCodes,region:t.region,defaultTotals:base.totals});
}
const routeTariffs=input.publicRoutes.filter(x=>x.kind==='CITY_TARIFF_DETAIL').map(x=>x.path),expectedPaths=expected.map(x=>x.path),actualPaths=new Set(routeTariffs);
const routeCheck={declared:routeTariffs.length,unique:actualPaths.size,expected:expectedPaths.length,missing:expectedPaths.filter(x=>!actualPaths.has(x)),extra:routeTariffs.filter(x=>!expectedPaths.includes(x))};
const indexPublished=input.allIndex.filter(x=>x.status==='PUBLISHED'&&x.availability==='ACTIVE');counts.indexPublished=indexPublished.length;
const publicIds=new Set(input.published.map(t=>t.id));const indexDiff=indexPublished.filter(t=>!publicIds.has(t.id)).map(t=>t.id);
const combinationCounts=countBy(expected,x=>[x.view.serviceType,'cinemas:'+x.view.cinemas.length,'game:'+(x.view.game?.code||'none'),'equipment:'+x.view.equipment.map(e=>e.code+':'+e.options.map(x=>x.kind).join('+')).join(','),'services:'+x.view.services.map(s=>s.code+':'+s.status).join(',')].join('|'));
const result={date:input.collectedAt,code:fs.readFileSync(path.join(root,'.git/HEAD'),'utf8').trim(),counts,typeCounts:countBy(input.published,t=>t.serviceType),fields,equipment,statusCounts,videoStates,ontStates,blockCounts,canonicalErrors:canonical,comparison,indexDiff,routeCheck,quoteCount,quoteCases,samples,combinationCounts,errors,warnings};
fs.writeFileSync(output,JSON.stringify(result,null,2));fs.writeFileSync(path.join(temp,'expected-pages.json'),JSON.stringify(expected));console.log(JSON.stringify({counts,resultFile:output,canonicalErrors:{published:canonical.published.length,archived:canonical.archived.length},comparison:{missing:comparison.missingWorking.length,different:comparison.different.length},routeCheck,quoteCount,errors:errors.length,warnings:warnings.length,equipment,statusCounts,videoStates,ontStates,samples},null,2));

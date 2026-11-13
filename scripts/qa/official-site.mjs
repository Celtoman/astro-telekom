import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {assessVertical,fullyVisibleCards,gesturePoint,cardPanDistance} from './account-mobile-scroll.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
try{process.loadEnvFile('.env')}catch(e){if(e.code!=='ENOENT')throw e}
const url=new URL(args.url||'http://127.0.0.1:4399/official-site-domru');
assert.ok(['http://127.0.0.1:4399','https://tv-internet-dom.ru'].includes(url.origin)&&url.pathname==='/official-site-domru'&&!url.search&&!url.hash&&!url.username);
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=resolve(args.out||'docs/research/evidence/2026-11-12-official-site-code/browser-qa');await mkdir(output,{recursive:true});
const reference=JSON.parse(await readFile(new URL('../../docs/research/evidence/2026-11-12-official-site-code/figma-metrics.json',import.meta.url),'utf8'));
const report={url:url.href,started:new Date().toISOString(),runs:[],failures:[],limits:['Browser emulation; no physical-device or assistive-technology certification','No real application or notification submitted']};
const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
async function observe(rail){return rail.evaluate(n=>{const r=n.getBoundingClientRect();return {left:n.scrollLeft,max:n.scrollWidth-n.clientWidth,y:scrollY,rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},cards:[...n.querySelectorAll('article')].map((a,index)=>{const b=a.getBoundingClientRect();return {index,left:b.left,right:b.right}}),writes:window.__officialWrites||0,touches:window.__officialTouches||0}})}
async function settle(page,rail){let before=await observe(rail);for(let i=0;i<20;i++){await page.waitForTimeout(70);const next=await observe(rail);if(Math.abs(next.left-before.left)<.25&&Math.abs(next.y-before.y)<.25)return next;before=next;}throw Error('Scroll did not settle');}
async function swipe(cdp,page,x1,y1,x2,y2){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1,id:0}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/12,y:y1+(y2-y1)*i/12,id:0}]});await page.waitForTimeout(25)}await page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
async function card(page,rail,cdp,index,width){for(let attempt=0;attempt<16;attempt++){const state=await observe(rail);if(fullyVisibleCards(state.rect,state.cards).includes(index))return;const target=state.cards[index],point=gesturePoint(state.rect,{width,height:1000});const delta=target.left<state.rect.left?target.left-state.rect.left:target.right-state.rect.right;const travel=cardPanDistance(delta,point.right-point.left);const x=travel>0?point.right:point.left;await swipe(cdp,page,x,point.y,x-travel,point.y);await settle(page,rail);}throw Error(`Card ${index} not reachable`);}

for(const engine of (args.engines||'chromium,webkit').split(',')){
 const browser=await playwright[engine].launch(engine==='chromium'?{channel:'msedge',headless:true,args:['--hide-scrollbars']}:{headless:true});
 try{for(const width of [1440,834,390,320]){
 const run={engine,version:browser.version(),width,scrolls:[]};report.runs.push(run);
 const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,hasTouch:width<621,...(url.protocol==='https:'?{httpCredentials:{origin:url.origin,username:process.env.BASIC_AUTH_USERNAME,password:process.env.BASIC_AUTH_PASSWORD}}:{})});
 try{
  await context.addInitScript(()=>{window.__officialTouches=0;window.__officialWrites=0;document.addEventListener('touchstart',()=>window.__officialTouches++,{passive:true});const d=Object.getOwnPropertyDescriptor(Element.prototype,'scrollLeft');Object.defineProperty(Element.prototype,'scrollLeft',{...d,set(v){window.__officialWrites++;return d.set.call(this,v)}})});
  const page=await context.newPage();await page.goto(url.href);await page.evaluate(async()=>{document.documentElement.style.scrollbarWidth='none';for(const image of document.images)image.loading='eager';await document.fonts.ready;await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,5000))])});
  run.layout=await page.evaluate(()=>({client:document.documentElement.clientWidth,body:document.body.scrollWidth,height:document.documentElement.scrollHeight,blocks:[...document.querySelectorAll('[data-official-block],.official-toc,.address-only,#official-faq')].map(n=>{const r=n.getBoundingClientRect();return {key:n.dataset.officialBlock||n.id||n.className,x:r.x,y:r.y,w:r.width,h:r.height}}),images:[...document.querySelectorAll('[data-official-image]')].map(i=>({slot:i.dataset.officialImage,src:new URL(i.src).pathname,w:i.naturalWidth,h:i.naturalHeight,loaded:i.complete&&i.naturalWidth>0})),footer:document.querySelector('footer').getBoundingClientRect().toJSON()}));
  assert.equal(run.layout.client,width);assert.equal(run.layout.body,width);assert.equal(run.layout.images.length,7);assert.ok(run.layout.images.every(i=>i.loaded));
  run.details=await page.evaluate(()=>({cards:Object.fromEntries(['services','additional'].map(key=>[key,[...document.querySelectorAll(`.official-${key}-cards article`)].map(n=>{const r=n.getBoundingClientRect();return{w:r.width,h:r.height}})])),readings:[...document.querySelectorAll('[data-official-block="services"]>.official-reading,.official-menu-panel>.official-reading')].map(n=>({x:n.getBoundingClientRect().x,w:n.getBoundingClientRect().width})),captionPadding:parseFloat(getComputedStyle(document.querySelector('.official-additional figcaption')).paddingLeft)}));
  const expected=reference.find(r=>r.width===width);
  for(const key of ['services','additional'])for(const [i,card] of run.details.cards[key].entries()){const target=expected.cards[key][i];assert.ok(Math.abs(card.w-target[0])<.1&&Math.abs(card.h-target[1])<.1,`${key} card ${i}: ${card.w}x${card.h}`)}
  if(width>1100)for(const reading of run.details.readings)assert.ok(Math.abs(reading.x-(width-reading.w)/2)<.1,'Reading column must be centered as in Screens');
  assert.equal(run.details.captionPadding,width<621?96:width<=1100?54:64);
  run.geometry=run.layout.blocks.map((b,i)=>({key:b.key,deltaH:b.h-reference.find(r=>r.width===width).blocks[i].h,deltaW:b.w-reference.find(r=>r.width===width).blocks[i].w}));
  await page.screenshot({path:join(output,`${engine}-${width}.png`),fullPage:true});
  // Geometry is recorded independently from behavior; unsupported browser differences stay visible.
  for(const g of run.geometry)if(Math.abs(g.deltaH)>.2||Math.abs(g.deltaW)>.2)report.failures.push({engine,width,kind:'GEOMETRY',...g});
  if(width<621){
   const rails=page.locator('[data-official-scroll]');assert.equal(await rails.count(),7);
   const cdp=engine==='chromium'?await context.newCDPSession(page):null;
   for(let i=0;i<7;i++){
    const rail=rails.nth(i);await rail.scrollIntoViewIfNeeded();const initial=await settle(page,rail);assert.ok(initial.max>0);
    const item={key:await rail.getAttribute('data-official-scroll'),cards:initial.cards.length,input:cdp?'native touch':'native wheel+keyboard'};run.scrolls.push(item);
    if(cdp){
     if(initial.cards.length){for(let index=0;index<initial.cards.length;index++)await card(page,rail,cdp,index,width);item.allCardsReached=true;for(let index=initial.cards.length-1;index>=0;index--)await card(page,rail,cdp,index,width);}
     else{for(let k=0;k<24;k++){const s=await observe(rail);if(s.max-s.left<2)break;const p=gesturePoint(s.rect,{width,height:1000});await swipe(cdp,page,p.right,p.y,p.left,p.y);await settle(page,rail);}const end=await observe(rail);assert.ok(end.max-end.left<2);item.endReached=true;for(let k=0;k<24;k++){const s=await observe(rail);if(s.left<2)break;const p=gesturePoint(s.rect,{width,height:1000});await swipe(cdp,page,p.left,p.y,p.right,p.y);await settle(page,rail);}}
     assert.ok((await observe(rail)).left<2);
     await rail.scrollIntoViewIfNeeded();const before=await settle(page,rail),p=gesturePoint(before.rect,{width,height:1000});await swipe(cdp,page,p.x,p.y+70,p.x,p.y-100);const after=await settle(page,rail);
     item.vertical=assessVertical({beforeY:before.y,afterY:after.y,beforeX:before.left,afterX:after.left,direction:1,programmaticWrites:after.writes-before.writes,inputDelivered:after.touches>before.touches});assert.equal(item.vertical.status,'PASS');
    }else{
     const r=await rail.boundingBox();await page.mouse.move(r.x+r.width/2,Math.max(20,Math.min(900,r.y+r.height/2)));await page.mouse.wheel(initial.max+100,0);let end=await settle(page,rail);assert.ok(end.left>initial.left);await page.mouse.wheel(-initial.max-100,0);await settle(page,rail);await rail.focus();await page.keyboard.press('ArrowRight');await settle(page,rail);item.keyboardMoved=(await observe(rail)).left>0;assert.ok(item.keyboardMoved);
    }
   }
  }
  const faq=page.locator('.home-faq-item');assert.equal(await faq.count(),8);await faq.first().locator('summary').focus();await page.keyboard.press('Enter');assert.ok(await faq.first().getAttribute('open')!==null);await page.keyboard.press('Enter');assert.equal(await faq.first().getAttribute('open'),null);
  assert.equal(await page.locator('.official-toc a').count(),7);run.status='PASS';
 }catch(e){run.status='FAIL';run.error=e.message;report.failures.push({engine,width,kind:'RUNTIME',message:e.message})}finally{await context.close();await writeFile(join(output,'results.json'),JSON.stringify(report,null,2)+'\n')}
 }}finally{await browser.close()}
}
console.log(JSON.stringify({runs:report.runs.map(r=>({engine:r.engine,width:r.width,status:r.status,scrolls:r.scrolls.length,error:r.error})),failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;

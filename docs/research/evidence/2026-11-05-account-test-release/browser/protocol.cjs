const {chromium}=require('C:/Users/Александр/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.loadEnvFile('.env');
const origin='https://tv-internet-dom.ru',url=origin+'/lichnyy-kabinet-dom-ru';
const out='docs/research/evidence/2026-11-05-account-test-release/browser';
const credentials={username:process.env.BASIC_AUTH_USERNAME,password:process.env.BASIC_AUTH_PASSWORD};
if(!credentials.username||!credentials.password)throw Error('Test credentials unavailable');
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const reports=JSON.parse(await fs.readFile(out+'/live-browser.json','utf8').catch(()=>'{}')).reports??[];
 try{
  for(const width of (process.env.ACCOUNT_QA_WIDTHS||'1440,834,390,320').split(',').map(Number)){
   const ctx=await browser.newContext({httpCredentials:credentials,viewport:{width,height:900},hasTouch:width<500,isMobile:width<500});
   const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   const response=await p.goto(url,{waitUntil:'load',timeout:60000});assert.equal(response.status(),200);
   await p.evaluate(async()=>{await document.fonts.ready;for(const i of document.images)i.loading='eager';await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
   const geometry=await p.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,title:document.title,h1:[...document.querySelectorAll('h1')].map(e=>e.textContent),canonical:document.querySelector('link[rel=canonical]')?.href,sections:document.querySelectorAll('[data-account-block]').length,images:[...document.querySelectorAll('[data-account-image]')].map(i=>({slot:i.dataset.accountImage,src:i.src,loaded:i.complete&&i.naturalWidth>0,alt:i.alt})),captionOffsets:[...document.querySelectorAll('.account-figure:has(figcaption)')].map(f=>f.querySelector('figcaption').getBoundingClientRect().x-f.querySelector('img').getBoundingClientRect().x),tocRows:new Set([...document.querySelectorAll('.account-toc a')].map(a=>Math.round(a.getBoundingClientRect().y))).size,appCaption:document.querySelectorAll('.account-image-appScreen figcaption').length,numberedHeadings:[...document.querySelectorAll('.account-page h2,.account-page h3')].filter(e=>/^\d+[.)]\s/.test(e.textContent)).map(e=>e.textContent),faq:document.querySelectorAll('.home-faq-item').length,businessHeights:[...document.querySelector('.account-business').children].map(e=>e.getBoundingClientRect().height),terminationImageY:[...document.querySelectorAll('.account-termination-grid .account-figure img')].map(e=>e.getBoundingClientRect().y)}));
   assert.equal(geometry.pageWidth,width);assert.equal(geometry.h1.length,1);assert.equal(geometry.images.length,14);assert.ok(geometry.images.every(i=>i.loaded&&i.alt));assert.ok(geometry.captionOffsets.every(x=>Math.abs(x)<1));assert.equal(geometry.appCaption,0);assert.equal(geometry.numberedHeadings.length,0);assert.equal(geometry.faq,6);
   if(width===1440){assert.equal(geometry.tocRows,1);assert.ok(Math.abs(geometry.businessHeights[0]-geometry.businessHeights[1])<1);assert.ok(Math.abs(geometry.terminationImageY[0]-geometry.terminationImageY[1])<1);}
   await p.screenshot({path:`${out}/account-${width}.png`,fullPage:true});
   await p.screenshot({path:`${out}/hero-${width}.png`});
   if(width===1440){const sources=JSON.parse(await fs.readFile('docs/research/evidence/2026-11-05-account-implementation/assets.json','utf8')),assets=[];for(const image of geometry.images){const source=sources.find(s=>s.slot===image.slot),r=await ctx.request.get(image.src),body=await r.body(),sha256=crypto.createHash('sha256').update(body).digest('hex');assert.equal(r.status(),200);assert.equal(sha256,source.sha256);assert.ok(image.src.includes('/__publication_assets/'));assert.ok(r.headers()['cache-control'].includes('immutable'));assets.push({slot:image.slot,url:image.src,sha256,bytes:body.length,status:r.status(),contentType:r.headers()['content-type'],cacheControl:r.headers()['cache-control']});}await fs.writeFile(out+'/assets.json',JSON.stringify(assets,null,2)+'\n');}
   const rails=[];
   if(width<500){
    const cdp=await ctx.newCDPSession(p),all=p.locator('[data-account-rail]');
    const swipe=async(x1,y1,x2,y2)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]});for(let k=1;k<=10;k++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*k/10,y:y1+(y2-y1)*k/10}]});await p.waitForTimeout(20)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(1500)};
    for(let n=0;n<await all.count();n++){
     const r=all.nth(n);await r.scrollIntoViewIfNeeded();let box=await r.boundingBox(),y=Math.max(90,Math.min(650,box.y+130));
     for(let k=0;k<12;k++){const s=await r.evaluate(e=>({x:e.scrollLeft,max:e.scrollWidth-e.clientWidth}));if(s.max-s.x<2)break;await swipe(box.x+box.width-24,y,box.x+24,y);}
     let end=await r.evaluate(e=>({x:e.scrollLeft,max:e.scrollWidth-e.clientWidth}));assert.ok(end.max-end.x<2,`native last ${width}/${n}`);
     for(let k=0;k<12;k++){if(await r.evaluate(e=>e.scrollLeft<2))break;await swipe(box.x+24,y,box.x+box.width-24,y);}
     assert.ok(await r.evaluate(e=>e.scrollLeft<2),`native first ${width}/${n}`);
     box=await r.boundingBox();y=Math.max(200,Math.min(720,box.y+Math.min(240,box.height-20)));let before=await p.evaluate(()=>scrollY);const target=await p.evaluate(y=>({tag:document.elementFromPoint(innerWidth/2,y)?.tagName,classes:document.elementFromPoint(innerWidth/2,y)?.className}),y);await swipe(width/2,y,width/2,y-150);const after=await p.evaluate(()=>scrollY);console.log(JSON.stringify({width,rail:n,verticalBefore:before,verticalAfter:after,target}));assert.ok(after>before+40,`vertical ${width}/${n}: ${JSON.stringify({before,after,box,y,target})}`);assert.ok(await r.evaluate(e=>e.scrollLeft<3));
     await r.focus();await p.keyboard.press('ArrowRight');await p.waitForTimeout(250);assert.ok(await r.evaluate(e=>e.scrollLeft>0));
     rails.push({name:await r.getAttribute('aria-label'),cards:await r.locator(':scope > article').count(),last:true,first:true,touch:true,vertical:true,keyboard:true});
    }
    assert.equal(rails.length,5);assert.equal(rails.reduce((a,x)=>a+x.cards,0),18);assert.equal(await p.locator('.account-rail button:not([data-city-choice-trigger])').count(),0);
    const anchors=p.locator('.account-toc a');assert.equal(await anchors.count(),11);for(let i=0;i<11;i++){const hash=await anchors.nth(i).getAttribute('href');await anchors.nth(i).click();assert.equal(await p.evaluate(()=>location.hash),hash)}await p.goBack();assert.equal(await p.evaluate(()=>location.hash),'#biz');
    await p.goto(url+'#opisan');assert.equal(await p.evaluate(()=>location.hash),'#opisan');
   }
   const faq=p.locator('.home-faq-item').last();await faq.locator('summary').focus();await p.keyboard.press('Space');assert.ok(await faq.evaluate(e=>e.open));await p.keyboard.press('Space');assert.ok(!await faq.evaluate(e=>e.open));
   assert.equal(errors.length,0);const prior=reports.findIndex(r=>r.width===width);if(prior>=0)reports.splice(prior,1);reports.push({...geometry,rails,pageErrors:errors,faqKeyboard:true});await fs.writeFile(out+'/live-browser.json',JSON.stringify({browser:browser.version(),reports},null,2)+'\n');console.log(JSON.stringify({width,status:'PASS',images:geometry.images.length,rails:rails.length}));
   await ctx.close();
  }
  const ctx=await browser.newContext({httpCredentials:credentials,javaScriptEnabled:false});const p=await ctx.newPage();await p.goto(url);assert.equal(await p.locator('h1').count(),1);assert.equal(await p.locator('.home-faq-item').count(),6);await p.locator('.home-faq-item').last().locator('summary').click();assert.ok(await p.locator('.home-faq-item').last().evaluate(e=>e.open));await fs.writeFile(out+'/no-js.json',JSON.stringify({content:true,faq:true,anchors:await p.locator('.account-toc a').count()})+'\n');await ctx.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});

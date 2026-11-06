const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,rm,readFile,writeFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');const {join,resolve}=require('node:path');
const sharp=require(require.resolve('sharp',{paths:[resolve('apps/web')]}));
const {EditorialMediaService}=require('../apps/api/dist/editorial-media.service.js');
const {safeMediaPath,mediaHash}=require('../apps/api/dist/editorial-media.js');
test('private media is site-scoped, deduplicated and immutable across contextual crops',async()=>{
 const root=await mkdtemp(join(tmpdir(),'editorial-media-'));const previous=process.env.EDITORIAL_MEDIA_ROOT;process.env.EDITORIAL_MEDIA_ROOT=root;
 const assets=[];
 const db={site:{findUnique:async({where})=>where.id==='site-1'?{id:'site-1'}:null},mediaAsset:{
  findUnique:async({where})=>where.id?assets.find(a=>a.id===where.id):assets.find(a=>a.siteId===where.siteId_sha256.siteId&&a.sha256===where.siteId_sha256.sha256),
  findFirst:async({where})=>assets.find(a=>a.id===where.id&&a.siteId===where.siteId&&a.ready),
  findUniqueOrThrow:async({where})=>assets.find(a=>a.id===where.id),
  upsert:async({create})=>{const a={id:'asset-1',...create};assets.push(a);return a;},
  update:async({where,data})=>Object.assign(assets.find(a=>a.id===where.id),data),
 },$queryRaw:async()=>[], $transaction:async(fn)=>fn(db)};
 try{
  const service=new EditorialMediaService(db);
  const input=await sharp({create:{width:720,height:360,channels:3,background:'#aabbcc'}}).jpeg().toBuffer();
  const uploaded=await service.upload('site-1',input,'image/jpeg');
  assert.equal(uploaded.id,'asset-1');assert.equal(uploaded.originalKey,undefined);
  assert.equal((await service.upload('site-1',input,'image/jpeg')).id,'asset-1');assert.equal(assets.length,1);
  await assert.rejects(()=>service.get('other-site','asset-1'),/не найдено/i);
  const old=structuredClone(assets[0].derivatives);
  await service.prepareUse('site-1',{assetId:'asset-1',alt:'Router',crop:{x:0,y:0,width:.5,height:1}},'cover');
  assert.deepEqual(assets[0].derivatives.cover,old.cover);
  assert.deepEqual(await readFile(safeMediaPath(root,assets[0].originalKey)),input);
  const variants=assets[0].derivatives.body;const largest=variants.at(-1);
  assert.equal(mediaHash(await service.preview('site-1','asset-1','body')),largest.sha256);
  await writeFile(safeMediaPath(root,largest.key),Buffer.from('corrupted'));
  await assert.rejects(()=>service.preview('site-1','asset-1','body'),/сумма/i);
 }finally{if(previous===undefined)delete process.env.EDITORIAL_MEDIA_ROOT;else process.env.EDITORIAL_MEDIA_ROOT=previous;await rm(root,{recursive:true,force:true});}
});

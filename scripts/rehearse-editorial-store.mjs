import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const connection=process.env.EDITORIAL_REHEARSAL_DATABASE_URL;
const url=new URL(connection||'http://invalid');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/news_rehearsal')throw new Error('Use an isolated local news_rehearsal database, never a serving database');
process.env.DATABASE_URL=connection;
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {PrismaService}=require('./dist/prisma.service.js'),{EditorialStoreService}=require('./dist/editorial-store.service.js');
const {newsDraft,notFoundDefaults}=require('./dist/news-types.js');
const db=new PrismaService(),store=new EditorialStoreService(db),key=`editorial-fixture-${randomUUID()}`;
let provider,site;
try{
 await db.onModuleInit();provider=await db.provider.create({data:{name:'Fixture',slug:key}});site=await db.site.create({data:{providerId:provider.id,name:'Fixture',slug:key,workingRevision:52,publishedRevision:50}});
 const category={version:'1.0.0',slug:'news',name:'Новости',description:'',seo:{},social:{}};
 const cat=await store.create(site.id,'CATEGORY',`${key}-category`,category);
 const content={...newsDraft(),title:'Первая редакция',slug:'first-news',summary:'Анонс',categoryId:cat.id,publishedDate:'2024-09-19T08:47:18.000Z',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Первая редакция текста'}]}]}};
 const article=await store.create(site.id,'ARTICLE',`${key}-article`,content);
 assert.equal((await store.create(site.id,'ARTICLE',article.id,content)).revision,1,'POST retry deduplicates the stable client id');
 const writes=await Promise.allSettled(['Вкладка A','Вкладка B'].map(title=>store.save(site.id,'ARTICLE',article.id,1,{...content,title})));
 assert.equal(writes.filter(x=>x.status==='fulfilled').length,1);const conflict=writes.find(x=>x.status==='rejected');assert.equal(conflict.reason.getStatus(),409);
 let current=await store.read(site.id,'ARTICLE',article.id);assert.equal(current.revision,2);
 const noChange=await store.save(site.id,'ARTICLE',article.id,current.revision,current.content);assert.equal(noChange.revision,2);
 assert.equal((await db.editorialRevision.findFirstOrThrow({where:{entityId:article.id,revision:2}})).checkpoint,false);
 const checkpoint=await store.save(site.id,'ARTICLE',article.id,current.revision,current.content,undefined,true);assert.equal(checkpoint.revision,2);
 assert.equal((await db.editorialRevision.findFirstOrThrow({where:{entityId:article.id,revision:2}})).checkpoint,true,'exact preview protects the saved revision without a duplicate');
 await db.editorialRevision.updateMany({where:{siteId:site.id,entityId:article.id,revision:1},data:{publishedAt:new Date('2024-09-19T08:47:18Z')}});
 for(let i=0;i<24;i++)current=await store.save(site.id,'ARTICLE',article.id,current.revision,{...content,title:`Контрольная редакция ${i}`},undefined,true);
 const history=await store.history(site.id,'ARTICLE',article.id);assert.equal(history.length,21);assert.ok(history.some(r=>r.revision===1&&r.publishedAt));
 const restored=await store.restore(site.id,'ARTICLE',article.id,1,current.revision);assert.equal(restored.content.title,content.title);assert.equal(restored.revision,current.revision+1);
 const saved404=await store.save(site.id,'NOT_FOUND','settings',0,notFoundDefaults());assert.equal(saved404.revision,1);
 await assert.rejects(()=>store.save(site.id,'ARTICLE',article.id,restored.revision,{...content,categoryId:'another-site-category'}),e=>e.getStatus()===400);
 const after=await db.site.findUniqueOrThrow({where:{id:site.id}});assert.equal(after.workingRevision,52);assert.equal(after.publishedRevision,50);assert.equal(await db.sitePublication.count({where:{siteId:site.id}}),0);
 console.log(JSON.stringify({result:'PASS',parallelSaves:{accepted:1,conflict:1},idempotentCreate:true,history:{published:1,checkpoints:20},restore:'DRAFT_ONLY',legacyRevision:'52:50',publications:0}));
}finally{
 if(site)await db.site.delete({where:{id:site.id}});if(provider)await db.provider.delete({where:{id:provider.id}});await db.onModuleDestroy();
}

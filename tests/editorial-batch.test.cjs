const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EditorialPublicationService}=require('../apps/api/dist/editorial-publication.service.js');
const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service.js');
const {newsSource}=require('./helpers/news-source.cjs');

function fixture(){
 const source=newsSource(3),site=source.site,contentOnly=({id,revision,dateModified,...content})=>content,rows=new Map(source.editorial.articles.map(a=>[a.id,{...a,siteId:site.id,content:contentOnly(a),everPublished:false}]));
 source.editorial.articles=[];source.editorial.categories=[];
 const baseline={id:'baseline',siteId:site.id,validationId:'base-validation',releaseSequence:3,siteRevision:9};
 const publications=[],enqueues=[],aliases=[];
 const prisma={
  $queryRaw:async()=>[],
  sitePublication:{findFirst:async({where})=>where.scopeKey?publications.find(p=>p.scopeKey===where.scopeKey)??null:where.status==='SUCCEEDED'?baseline:null,create:async({data})=>{const p={...data,id:'batch-publication'};publications.push(p);return p}},
  sitePublicationValidation:{findUnique:async()=>({sourceSnapshot:source}),create:async({data})=>({id:'validation',...data})},
  editorialRevision:{findUnique:async()=>({createdAt:new Date('2026-11-07T09:00:00Z')})},
  editorialPublicationItem:{findMany:async()=>[]},
  redirect:{findMany:async()=>[],findUnique:async()=>null,create:async({data})=>{aliases.push(data);return data}},
 };
 prisma.$transaction=async fn=>fn(prisma);
 const store={requireSite:async()=>site,row:async(_site,kind,id)=>kind==='CATEGORY'?{id,revision:1,content:contentOnly(newsSource().editorial.categories.find(c=>c.id===id))}:rows.get(id)??null};
 const service=new EditorialPublicationService(prisma,store,new SiteCatalogService({}),{prepare:async(_site,e)=>e},{enqueue:async job=>{enqueues.push(job);return{id:'rebuild'}}});
 const input=[{entityId:'news-0',expectedRevision:1},{entityId:'news-1',expectedRevision:1}];
 return {service,site,rows,source,prisma,publications,enqueues,aliases,input};
}
test('selected drafts become one reviewed publication with one category dependency and one rebuild',async()=>{
 const f=fixture(),review=await f.service.reviewBatch(f.site.id,f.input);
 assert.equal(review.ready,true,JSON.stringify(review.report));
 assert.deepEqual(review.items.filter(x=>x.kind==='ARTICLE').map(x=>x.entityId),['news-0','news-1']);
 assert.equal(review.items.filter(x=>x.kind==='CATEGORY').length,1);
 assert.equal(f.publications.length,0);assert.equal(f.enqueues.length,0);
 const result=await f.service.publishBatch(f.site.id,f.input,review.reviewDigest,'batch-1','owner');
 assert.equal(result.publicationId,'batch-publication');assert.equal(f.publications.length,1);assert.equal(f.enqueues.length,1);
 const catalog=f.publications[0].catalog;
 assert.deepEqual(catalog.editorial.articles.map(a=>a.id),['news-0','news-1']);
 assert.equal(catalog.editorial.articles.some(a=>a.id==='news-2'),false);
 assert.equal(f.source.editorial.articles.length,0);
 const repeat=await f.service.publishBatch(f.site.id,f.input,review.reviewDigest,'batch-1','owner');
 assert.equal(repeat.publicationId,result.publicationId);assert.equal(f.publications.length,1);
 assert.equal(new Set(f.enqueues.map(x=>x.publicationId)).size,1);
});
test('batch rejects changed, invalid, repeated and already published selections before enqueue',async()=>{
 for(const scenario of ['changed','invalid','duplicate','published','empty','foreign']){
  const f=fixture();let input=f.input;
  if(scenario==='changed')f.rows.get('news-1').revision=2;
  if(scenario==='invalid')f.rows.get('news-1').content={...f.rows.get('news-1').content,title:''};
  if(scenario==='duplicate')input=[input[0],input[0]];
  if(scenario==='published')f.rows.get('news-1').everPublished=true;
  if(scenario==='empty')input=[];
  if(scenario==='foreign')input=[{entityId:'foreign',expectedRevision:1}];
  await assert.rejects(()=>f.service.reviewBatch(f.site.id,input),scenario);
  assert.equal(f.publications.length,0);assert.equal(f.enqueues.length,0);
 }
});
test('stale batch review cannot publish changed drafts or quietly omit invalid items',async()=>{
 const f=fixture(),review=await f.service.reviewBatch(f.site.id,f.input);
 f.rows.get('news-1').revision=2;
 await assert.rejects(()=>f.service.publishBatch(f.site.id,f.input,review.reviewDigest,'stale','owner'),error=>error.getStatus?.()===409);
 assert.equal(f.publications.length,0);assert.equal(f.enqueues.length,0);
});
test('confirmed list aliases survive the next batch and keep their owner',async()=>{
 const f=fixture(),aliases=['/news/page/1','/novosti'].map((path,i)=>({id:'alias-'+i,sourcePath:path,targetPath:'/news',managedEditorialKey:'NEWS_SETTINGS',managedEditorialReleaseSequence:3}));
 f.source.redirects.push(...aliases);f.source.editorial.redirectIds=aliases.map(a=>a.id);
 f.prisma.redirect.findMany=async()=>aliases;
 f.prisma.redirect.findUnique=async({where})=>aliases.find(a=>a.sourcePath===where.siteId_sourcePath.sourcePath)??null;
 const review=await f.service.reviewBatch(f.site.id,f.input);
 assert.equal(review.ready,true);assert.ok(review.redirects.some(a=>a.sourcePath==='/novosti'&&a.targetPath==='/news'));
});

const {test}=require('node:test');const assert=require('node:assert/strict');
const {EditorialPublicationService}=require('../apps/api/dist/editorial-publication.service.js');
const {newsSettingsDefaults}=require('../apps/api/dist/news-types.js');
const e=()=>({version:'1.0.0',articles:[],categories:[],settings:newsSettingsDefaults(),notFound:null});
test('actual review DTO includes removed canonical and alias addresses with explicit 301 or 404',()=>{
 const previous=e();previous.categories=[{id:'cat',slug:'equipment'}];previous.articles=[{id:'a',slug:'old',categoryId:'cat'}];previous.redirectIds=['alias'];
 const next=e(),service=new EditorialPublicationService({}, {}, {}, {}, {});
 const review=service.publicReview({source:{editorial:next,redirects:[]},previousSource:{editorial:previous,redirects:[{id:'alias',sourcePath:'/legacy',targetPath:'/news/old'}]},validation:{catalog:{},report:{issues:[]}},items:[{kind:'ARTICLE',entityId:'a',revision:1,action:'WITHDRAW',snapshot:null}],baseline:{id:'base'},reviewDigest:'fixture',retirement:null,selectedTitle:'Новость'});
 assert.ok(review.retiredPaths?.some(row=>row.path==='/news/old'&&row.status===404));assert.ok(review.retiredPaths.some(row=>row.path==='/legacy'&&row.status===404));assert.ok(review.affectedPaths.includes('/news/old'));
 next.articles=[{id:'a',slug:'current',categoryId:'cat'}];next.categories=previous.categories;
 const renamed=service.publicReview({source:{editorial:next,redirects:[{id:'r',sourcePath:'/news/old',targetPath:'/news/current'}]},previousSource:{editorial:previous,redirects:[]},validation:{catalog:{},report:{issues:[]}},items:[],baseline:{id:'base'},reviewDigest:'fixture',retirement:null});assert.ok(renamed.retiredPaths.some(row=>row.path==='/news/old'&&row.status===301&&row.targetPath==='/news/current'));
});
test('category publication is blocked by its pending retirement even when the general pending barrier is clear',async()=>{
 const previous=process.env.REBUILD_PROVIDER;process.env.REBUILD_PROVIDER='none';
 const site={id:'site',slug:'fixture'},source={site,cities:[],globalPages:[],editorial:e()},baseline={id:'base',siteId:'site',validationId:'validation',releaseSequence:1};
 const prisma={sitePublication:{findFirst:async({where})=>where.status==='SUCCEEDED'?baseline:null},sitePublicationValidation:{findUnique:async()=>({sourceSnapshot:source})},editorialPublicationItem:{findFirst:async()=>({id:'pending-retirement'})}};
 const store={requireSite:async()=>site,row:async()=>({id:'cat',revision:1,content:{version:'1.0.0',slug:'equipment',name:'Оборудование',description:'',seo:{},social:{}}})};const service=new EditorialPublicationService(prisma,store,{}, {}, {});
 try{await assert.rejects(()=>service.review('site',{kind:'CATEGORY',entityId:'cat',expectedRevision:1,action:'PUBLISH'}),error=>error.getStatus?.()===409&&/удалению/.test(error.message))}finally{if(previous===undefined)delete process.env.REBUILD_PROVIDER;else process.env.REBUILD_PROVIDER=previous}
});

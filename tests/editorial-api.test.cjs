const {test}=require('node:test');const assert=require('node:assert/strict');const {createRequire}=require('node:module');const {resolve}=require('node:path');
const requireApi=createRequire(resolve('apps/api/package.json')), {Module}=requireApi('@nestjs/common'),{NestFactory}=requireApi('@nestjs/core'),{FastifyAdapter}=requireApi('@nestjs/platform-fastify'),cookie=requireApi('@fastify/cookie');
const {AdminNewsController}=require('../apps/api/dist/admin-news.controller.js'),{AdminNewsCategoriesController}=require('../apps/api/dist/admin-news-categories.controller.js'),{AdminEditorialSettingsController}=require('../apps/api/dist/admin-editorial-settings.controller.js'),{EditorialStoreService}=require('../apps/api/dist/editorial-store.service.js'),{EditorialPublicationService}=require('../apps/api/dist/editorial-publication.service.js'),{AdminTokenGuard}=require('../apps/api/dist/admin-token.guard.js'),{AuthService,ADMIN_SESSION_COOKIE}=require('../apps/api/dist/auth.service.js');
test('editorial HTTP authenticates all scopes, distinguishes static routes and rejects undeclared write fields',async()=>{
 const writes=[],store={save:async(...args)=>{writes.push(args);return{revision:2}},history:async()=>[],create:async()=>({id:'new'})};
 const publications={reviewBatch:async(siteId,items)=>({siteId,items}),publishBatch:async(siteId,items,reviewDigest,operationId,actorId)=>({siteId,items,reviewDigest,operationId,actorId}),list:async()=>({scope:'list'}),categories:async()=>({scope:'categories'}),categoryOptions:async(siteId)=>({items:[{id:'cat',name:siteId}]}),workspace:async(siteId,kind,id)=>({siteId,kind,id}),operation:async()=>({scope:'operation'}),preview:async(siteId,kind,id,expectedRevision,mode)=>({siteId,kind,id,expectedRevision,mode}),review:async(_site,input)=>input};
 class Fixture{};Module({controllers:[AdminNewsController,AdminNewsCategoriesController,AdminEditorialSettingsController],providers:[AdminTokenGuard,{provide:AuthService,useValue:{getUserByToken:async token=>token==='fixture-session'?{id:'owner'}:null}},{provide:EditorialStoreService,useValue:store},{provide:EditorialPublicationService,useValue:publications}]})(Fixture);
 const app=await NestFactory.create(Fixture,new FastifyAdapter(),{logger:false,abortOnError:false});await app.register(cookie);app.setGlobalPrefix('api/v1');await app.init();const server=app.getHttpAdapter().getInstance();await server.ready();
 const base='/api/v1/admin/sites/site-1',headers={cookie:`${ADMIN_SESSION_COOKIE}=fixture-session`};
 try{
  for(const path of ['/news','/news/categories','/news/categories?view=options','/news/article','/editorial/not-found'])assert.equal((await server.inject({method:'GET',url:base+path})).statusCode,401);
  assert.equal((await server.inject({method:'GET',url:base+'/news/categories',headers})).json().scope,'categories');
  assert.deepEqual((await server.inject({method:'GET',url:base+'/news/categories?view=options',headers})).json(),{items:[{id:'cat',name:'site-1'}]});
  for(const [path,kind] of [['/news/article/preview','ARTICLE'],['/news/categories/cat/preview','CATEGORY'],['/editorial/not-found/preview','NOT_FOUND']]){const input={expectedRevision:5,mode:'draft'};assert.equal((await server.inject({method:'POST',url:base+path,payload:input})).statusCode,401);const response=await server.inject({method:'POST',url:base+path,headers,payload:input});assert.equal(response.statusCode,201,response.body);assert.equal(response.json().kind,kind);assert.equal(response.json().expectedRevision,5);assert.equal((await server.inject({method:'POST',url:base+path,headers,payload:{...input,html:'<script>'}})).statusCode,400);}
  assert.equal((await server.inject({method:'GET',url:base+'/news/publications/op',headers})).json().scope,'operation');
  for(const action of ['review','publish']){
    const payload={items:[{entityId:'a',expectedRevision:1}],...(action==='publish'?{reviewDigest:'a'.repeat(64),operationId:'batch-op'}:{})},url=base+'/news/batch/'+action;
    assert.equal((await server.inject({method:'POST',url,payload})).statusCode,401);
    const response=await server.inject({method:'POST',url,headers,payload});assert.equal(response.statusCode,201,response.body);assert.deepEqual(response.json().items,payload.items);assert.equal(response.json().siteId,'site-1');if(action==='publish')assert.equal(response.json().actorId,'owner');
    assert.equal((await server.inject({method:'POST',url,headers,payload:{...payload,publishAll:true}})).statusCode,400);
  }
  assert.equal((await server.inject({method:'GET',url:base+'/editorial/not-found',headers})).json().kind,'NOT_FOUND');
  assert.equal((await server.inject({method:'GET',url:base+'/editorial/constructor',headers})).statusCode,400);
  assert.equal((await server.inject({method:'GET',url:base+'/news/categories/cat/history',headers})).statusCode,200);
  const retirement=await server.inject({method:'POST',url:base+'/news/categories/cat/review',headers,payload:{expectedRevision:1,action:'REASSIGN',targetCategoryId:'target'}});assert.equal(retirement.statusCode,201);assert.equal(retirement.json().targetCategoryId,'target');
  assert.equal((await server.inject({method:'POST',url:base+'/editorial/not-found/review',headers,payload:{expectedRevision:1,action:'WITHDRAW'}})).statusCode,400);
  assert.equal((await server.inject({method:'POST',url:base+'/editorial/not-found/review',headers,payload:{expectedRevision:1,action:'PUBLISH'}})).json().action,'PUBLISH');
  const bad=await server.inject({method:'PATCH',url:base+'/news/article',headers,payload:{content:{},expectedRevision:1,publish:true}});assert.equal(bad.statusCode,400);assert.equal(writes.length,0);
  const saved=await server.inject({method:'PATCH',url:base+'/news/article',headers,payload:{content:{title:'Draft'},expectedRevision:1}});assert.equal(saved.statusCode,200);assert.deepEqual(writes[0].slice(0,6),['site-1','ARTICLE','article',1,{title:'Draft'},'owner']);
 }finally{await app.close()}
});

test('editorial lists keep exact serving states and count before paging a state filter', async () => {
  const site = { id: 'site-629', slug: 'fixture' };
  const rows = Array.from({ length: 30 }, (_, index) => ({
    id: `news-${index}`,
    title: `Новость ${index}`,
    content: { title: `Новость ${index}`, body: { type: 'doc' } },
    everPublished: index === 1,
    revision: 4,
  }));
  const reads = [];
  let available = true;
  const db = {
    newsArticle: {
      count: async ({ where }) => { assert.deepEqual(where, { siteId: site.id, archivedAt: null }); return rows.length; },
      findMany: async ({ skip, take, orderBy }) => {
        assert.deepEqual(orderBy, [{ publishedDate: 'desc' }, { id: 'asc' }]);
        reads.push({ skip, take });
        return take ? rows.slice(skip, skip + take) : rows;
      },
    },
    sitePublication: { findFirst: async () => available ? { siteId: site.id, validationId: 'checked-snapshot' } : null },
    $queryRaw: async sql => {
      assert.ok(sql.values.includes('checked-snapshot'));
      assert.ok(sql.values.includes(site.id));
      const idsParam = sql.values.find(value => typeof value === 'string' && value.startsWith('['));
      const ids = idsParam ? JSON.parse(idsParam) : [];
      return [{ articles: [
        { id: 'news-0', revision: 1, ...rows[0].content },
        { id: 'news-2', revision: 4, ...rows[2].content, title: 'Предыдущий заголовок' },
      ].filter(article => ids.includes(article.id)) }];
    },
    $transaction: async (callback, options) => {
      assert.deepEqual(options, { isolationLevel: 'RepeatableRead' });
      return callback(db);
    },
  };
  const oldProvider = process.env.REBUILD_PROVIDER;
  delete process.env.REBUILD_PROVIDER;
  try {
    const service = new EditorialPublicationService(db, { requireSite: async id => {
      assert.equal(id, site.id);
      return site;
    } });
    const first = await service.list(site.id);
    assert.equal(first.total, 30);
    assert.equal(first.items.length, 25);
    assert.equal(first.items[0].state, 'PUBLISHED'); // Equal content still wins over a different revision.
    assert.equal(first.items[1].state, 'WITHDRAWN');
    assert.equal(first.items[2].state, 'CHANGED');
    assert.equal(first.items[3].state, 'DRAFT');
    assert.equal(Object.hasOwn(first.items[0], 'content'), false);
    assert.deepEqual(reads.splice(0), [{ skip: 0, take: 25 }]);
    const filtered = await service.list(site.id, { state: 'DRAFT', page: 2 });
    assert.equal(filtered.total, 27);
    assert.deepEqual(filtered.items.map(row => row.id), ['news-28', 'news-29']);
    assert.deepEqual(reads.splice(0), [{ skip: undefined, take: undefined }]);
    const outside = await service.list(site.id, { page: Number.MAX_SAFE_INTEGER });
    assert.deepEqual(outside.items, []);
    assert.equal(outside.total, 30);
    assert.equal(outside.page, Number.MAX_SAFE_INTEGER);
    assert.deepEqual(reads, []);

    available = false;
    const unavailable = await service.list(site.id, { state: 'UNKNOWN' });
    assert.equal(unavailable.publishedAvailable, false);
    assert.equal(unavailable.total, 30);
    assert.ok(unavailable.items.every(item => item.state === 'UNKNOWN'));
  } finally {
    if (oldProvider === undefined) delete process.env.REBUILD_PROVIDER;
    else process.env.REBUILD_PROVIDER = oldProvider;
  }
});

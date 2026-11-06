const {test}=require('node:test');const assert=require('node:assert/strict');const {createRequire}=require('node:module');const {resolve}=require('node:path');
const requireApi=createRequire(resolve('apps/api/package.json')), {Module}=requireApi('@nestjs/common'),{NestFactory}=requireApi('@nestjs/core'),{FastifyAdapter}=requireApi('@nestjs/platform-fastify'),cookie=requireApi('@fastify/cookie');
const {AdminNewsController}=require('../apps/api/dist/admin-news.controller.js'),{AdminNewsCategoriesController}=require('../apps/api/dist/admin-news-categories.controller.js'),{AdminEditorialSettingsController}=require('../apps/api/dist/admin-editorial-settings.controller.js'),{EditorialStoreService}=require('../apps/api/dist/editorial-store.service.js'),{EditorialPublicationService}=require('../apps/api/dist/editorial-publication.service.js'),{AdminTokenGuard}=require('../apps/api/dist/admin-token.guard.js'),{AuthService,ADMIN_SESSION_COOKIE}=require('../apps/api/dist/auth.service.js');
test('editorial HTTP authenticates all scopes, distinguishes static routes and rejects undeclared write fields',async()=>{
 const writes=[],store={save:async(...args)=>{writes.push(args);return{revision:2}},history:async()=>[],create:async()=>({id:'new'})};
 const publications={list:async()=>({scope:'list'}),categories:async()=>({scope:'categories'}),workspace:async(siteId,kind,id)=>({siteId,kind,id}),operation:async()=>({scope:'operation'})};
 class Fixture{};Module({controllers:[AdminNewsController,AdminNewsCategoriesController,AdminEditorialSettingsController],providers:[AdminTokenGuard,{provide:AuthService,useValue:{getUserByToken:async token=>token==='fixture-session'?{id:'owner'}:null}},{provide:EditorialStoreService,useValue:store},{provide:EditorialPublicationService,useValue:publications}]})(Fixture);
 const app=await NestFactory.create(Fixture,new FastifyAdapter(),{logger:false,abortOnError:false});await app.register(cookie);app.setGlobalPrefix('api/v1');await app.init();const server=app.getHttpAdapter().getInstance();await server.ready();
 const base='/api/v1/admin/sites/site-1',headers={cookie:`${ADMIN_SESSION_COOKIE}=fixture-session`};
 try{
  for(const path of ['/news','/news/categories','/news/article','/editorial/not-found'])assert.equal((await server.inject({method:'GET',url:base+path})).statusCode,401);
  assert.equal((await server.inject({method:'GET',url:base+'/news/categories',headers})).json().scope,'categories');
  assert.equal((await server.inject({method:'GET',url:base+'/news/publications/op',headers})).json().scope,'operation');
  assert.equal((await server.inject({method:'GET',url:base+'/editorial/not-found',headers})).json().kind,'NOT_FOUND');
  assert.equal((await server.inject({method:'GET',url:base+'/editorial/constructor',headers})).statusCode,400);
  const bad=await server.inject({method:'PATCH',url:base+'/news/article',headers,payload:{content:{},expectedRevision:1,publish:true}});assert.equal(bad.statusCode,400);assert.equal(writes.length,0);
  const saved=await server.inject({method:'PATCH',url:base+'/news/article',headers,payload:{content:{title:'Draft'},expectedRevision:1}});assert.equal(saved.statusCode,200);assert.deepEqual(writes[0].slice(0,6),['site-1','ARTICLE','article',1,{title:'Draft'},'owner']);
 }finally{await app.close()}
});

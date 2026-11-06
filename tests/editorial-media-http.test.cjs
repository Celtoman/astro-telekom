const {test}=require('node:test');const assert=require('node:assert/strict');const {createRequire}=require('node:module');const {resolve}=require('node:path');
const apiRequire=createRequire(resolve('apps/api/package.json'));
const {Module}=apiRequire('@nestjs/common'),{NestFactory}=apiRequire('@nestjs/core'),{FastifyAdapter}=apiRequire('@nestjs/platform-fastify');
const multipart=apiRequire('@fastify/multipart'),cookie=apiRequire('@fastify/cookie');
const {AdminEditorialMediaController}=require('../apps/api/dist/admin-editorial-media.controller.js');
const {EditorialMediaService}=require('../apps/api/dist/editorial-media.service.js');
const {AdminTokenGuard}=require('../apps/api/dist/admin-token.guard.js');
const {ADMIN_SESSION_COOKIE,AuthService}=require('../apps/api/dist/auth.service.js');
test('media HTTP uses cookie authentication, bounded multipart and private no-store image responses',async()=>{
 const uploads=[];
 const media={upload:async(siteId,input,mime)=>{uploads.push({siteId,input,mime});return{id:'uploaded'}},preview:async()=>Buffer.from('private-image')};
 const auth={getUserByToken:async token=>token==='fixture-session'?{id:'editor'}:null};
 class Fixture{};Module({controllers:[AdminEditorialMediaController],providers:[{provide:EditorialMediaService,useValue:media},AdminTokenGuard,{provide:AuthService,useValue:auth}]})(Fixture);
 const app=await NestFactory.create(Fixture,new FastifyAdapter({bodyLimit:35*1024*1024}),{logger:false,abortOnError:false});
 await app.register(cookie);await app.register(multipart,{limits:{fileSize:10*1024*1024,files:1,fields:0,parts:1}});app.setGlobalPrefix('api/v1');await app.init();const server=app.getHttpAdapter().getInstance();await server.ready();
 const boundary='fixture-boundary',url='/api/v1/admin/sites/site-1/news/media',headers={cookie:`${ADMIN_SESSION_COOKIE}=fixture-session`,'content-type':`multipart/form-data; boundary=${boundary}`};
 const payload=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="../../outside.png"\r\nContent-Type: image/png\r\n\r\nfixture\r\n--${boundary}--\r\n`);
 try{
  const denied=await server.inject({method:'POST',url,headers:{'content-type':headers['content-type']},payload});assert.equal(denied.statusCode,401);assert.equal(uploads.length,0);
  const accepted=await server.inject({method:'POST',url,headers,payload});assert.equal(accepted.statusCode,201,accepted.body);assert.equal(uploads[0].siteId,'site-1');assert.equal(uploads[0].input.toString(),'fixture');assert.equal(uploads[0].mime,'image/png');
  const tooLarge=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.png"\r\nContent-Type: image/png\r\n\r\n`),Buffer.alloc(10*1024*1024+1),Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const rejected=await server.inject({method:'POST',url,headers,payload:tooLarge});assert.equal(rejected.statusCode,400,rejected.body);assert.equal(uploads.length,1);
  const image=await server.inject({method:'GET',url:`${url}/uploaded/file`,headers:{cookie:headers.cookie}});assert.equal(image.statusCode,200);assert.equal(image.headers['cache-control'],'private, no-store');assert.equal(image.headers['x-content-type-options'],'nosniff');assert.match(image.headers['content-type'],/image\/webp/);
 }finally{await app.close()}
});

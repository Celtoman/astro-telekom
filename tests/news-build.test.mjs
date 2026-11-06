import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
test('immutable news build keeps old snapshots, renders C/A/404 and adds only canonical published routes', {timeout:360000}, async()=>{
 const {StaticArtifactBuilder}=await import('../apps/web/scripts/publication/static-builder.mjs');
 const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service.js');
 const {newsSource}=require('./helpers/news-source.cjs');
 const source=newsSource(),old=structuredClone(source);delete old.editorial;
 source.editorial.articles[0].title='</script><script id="news-injection">oops</script>';
 const service=new SiteCatalogService({}),catalog=service.renderSource(source),oldCatalog=service.renderSource(old);
 const temporary=fileURLToPath(new URL('../.codex-tmp/',import.meta.url));await mkdir(temporary,{recursive:true});const root=await mkdtemp(join(temporary,'news-build-'));
 let bundle;
 try{
  const builder=new StaticArtifactBuilder({publicationRoot:root,apiUrl:'http://api.internal/api/v1',adminToken:'synthetic',publicEnv:{PUBLIC_SITE_URL:'https://partner.example.test',PUBLIC_API_URL:'https://partner.example.test/api/v1',PUBLIC_SITE_SLUG:'domru-site'},fetchImpl:async()=>Response.json(bundle)});
  const build=async(data,id)=>{bundle={publicationId:id,siteId:'site-1',siteSlug:'domru-site',siteRevision:9,releaseSequence:1,catalogDigest:createHash('sha256').update(JSON.stringify(data)).digest('hex'),catalog:data};const result=await builder.build({publicationId:id,siteSlug:'domru-site',siteId:'site-1',rebuildId:id,rebuildRevision:1});return join(root,'releases',result.artifactId)};
  const before=await build(oldCatalog,'before-news'),oldHome=await readFile(join(before,'index.html'),'utf8');assert.doesNotMatch(oldHome,/data-home-block="home.news"/);
  const next=await build(catalog,'with-news'),list=await readFile(join(next,'news/index.html'),'utf8'),article=await readFile(join(next,'news/story-0/index.html'),'utf8'),second=await readFile(join(next,'news/page/2/index.html'),'utf8'),home=await readFile(join(next,'index.html'),'utf8'),notFound=await readFile(join(next,'404.html'),'utf8');
  assert.equal((list.match(/class="news-card"/g)||[]).length,12);assert.equal((second.match(/class="news-card"/g)||[]).length,1);assert.equal((article.match(/<h1\b/g)||[]).length,1);assert.doesNotMatch(article,/<script id="news-injection">/);assert.match(article,/<meta property="og:type" content="article"/);const graph=JSON.parse(article.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);assert.equal(graph["@graph"].find(row=>row["@type"]==="NewsArticle").headline,source.editorial.articles[0].title);assert.match(article,/Текст сохранённой новости/);assert.match(article,/href="\/news">Все новости/);assert.match(notFound,/data-not-found/);assert.match(home,/data-home-block="home.news"/);assert.ok(home.indexOf('data-home-block="home.more_possibilities"')<home.indexOf('data-home-block="home.news"'));assert.ok(home.indexOf('data-home-block="home.news"')<home.indexOf('data-home-block="home.connection_help"'));
  const sitemap=await readFile(join(next,'sitemap-pages.xml'),'utf8');assert.match(sitemap,/\/news\/page\/2/);assert.doesNotMatch(sitemap,/\/news\/page\/1<|\/404</);assert.doesNotMatch(list,/figma\.com\/api\/mcp|Читать новость|Акции и скидки/);
  assert.equal(await readFile(join(before,'index.html'),'utf8'),oldHome);
  const broken=structuredClone(catalog);broken.editorial.articles[0].body={type:'doc',content:[{type:'iframe'}]};await assert.rejects(build(broken,'bad-news'),/news|новост|блок|iframe|build|publication/i);assert.equal(await readFile(join(next,'news/index.html'),'utf8'),list);
 }finally{assert.ok(resolve(root).startsWith(resolve(temporary)+sep));await rm(root,{recursive:true,force:true})}
});

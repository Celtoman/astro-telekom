const {test}=require('node:test');const assert=require('node:assert/strict');
const {SiteCatalogService}=require('../apps/api/dist/site-catalog.service.js');
const {validatePublicationSource}=require('../apps/api/dist/publication-validation.js');
const {emptyEditorial}=require('../apps/api/dist/editorial-publication-model.js');
const {newsDraft}=require('../apps/api/dist/news-types.js');
const {publicationSource:sourceFixture}=require('./helpers/publication-source.cjs');
test('news routes and SEO extend the captured legacy inventory without requiring or publishing legacy SEO templates',()=>{
 const source=sourceFixture();source.editorial=emptyEditorial();source.editorial.categories=[{id:'cat',version:'1.0.0',name:'Новости',slug:'news',description:'Новости провайдера',seo:{},social:{}}];
 source.editorial.articles=Array.from({length:13},(_,i)=>({...newsDraft(),id:`a${i}`,slug:`story-${i}`,title:`Новость ${i}`,summary:'Анонс новости',categoryId:'cat',publishedDate:'2024-09-19T08:47:18Z',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Полный текст'}]}]},seo:i===0?{title:'Особый заголовок'}:{}}));
 const service=new SiteCatalogService({});
 const result=validatePublicationSource(source,{appVersion:'fixture',siteRevision:5},s=>service.renderSource(s));
 assert.notEqual(result.report.outcome,'BLOCKED',JSON.stringify(result.report.issues));
 assert.ok(result.catalog.routes.some(r=>r.path==='/news/category/news/page/2'));
 assert.equal(result.catalog.seoByPath['/news/story-0'].title,'Особый заголовок');
 assert.equal(result.catalog.seoByPath['/news/page/2'].title,'Новости Дом.ру — Страница 2');
 assert.ok(result.catalog.routes.some(r=>r.path==='/goroda-obsluzhivaniya'));
 source.editorial.articles[0].slug='page';
 const bad=validatePublicationSource(source,{appVersion:'fixture',siteRevision:5},s=>service.renderSource(s));assert.equal(bad.report.outcome,'BLOCKED');
});

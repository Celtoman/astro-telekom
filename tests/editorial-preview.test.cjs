const {test}=require('node:test');const assert=require('node:assert/strict');
const {editorialPreviewOverlay}=require('../apps/api/dist/editorial-preview-model.js');
test('exact saved preview overlays only selected content and a required new category without mutating the serving source',()=>{
 const baseline={version:'1.0.0',articles:[{id:'a',title:'На сайте'},{id:'b',title:'Другой опубликованный текст'}],categories:[],settings:{title:'Новости'},notFound:null};const original=structuredClone(baseline);
 const next=editorialPreviewOverlay(baseline,'ARTICLE',{id:'a',revision:5,content:{title:'Сохранённый draft',categoryId:'new'}},{id:'new',name:'Новая категория'});assert.deepEqual(baseline,original);assert.equal(next.articles.find(a=>a.id==='a').revision,5);assert.equal(next.articles.find(a=>a.id==='b').title,'Другой опубликованный текст');assert.equal(next.categories[0].id,'new');
 const settings=editorialPreviewOverlay(baseline,'NOT_FOUND',{id:'404',revision:2,content:{title:'Новая404'}});assert.equal(settings.notFound.title,'Новая404');assert.deepEqual(settings.articles,baseline.articles);
});

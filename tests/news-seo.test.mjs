import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newsStructuredData} from '../apps/web/src/lib/news-seo.ts';
test('article schema keeps actual author/source separate and never invents publisher or cover',()=>{
 const article={slug:'story',title:'Новость',summary:'Анонс',schemaType:'NewsArticle',publishedDate:'2024-01-01T10:00:00Z',dateModified:'2024-02-01T10:00:00Z',categoryId:'c',cover:null,author:null,source:{url:'https://source.example/story'}};
 const view={kind:'article',article,editorial:{settings:{title:'Новости'},categories:[{id:'c',name:'Сервисы'}]},related:[]};
 let data=newsStructuredData(view,'/news/story','https://partner.example');const entity=data['@graph'].find(row=>row['@type']==='NewsArticle');assert.equal(entity.headline,'Новость');assert.equal(entity.isBasedOn,'https://source.example/story');assert.equal(entity.author,undefined);assert.equal(entity.publisher,undefined);assert.equal(entity.image,undefined);assert.equal(entity.articleSection,'Сервисы');
 view.article.author={type:'Organization',name:'Редакция партнёра',url:'https://partner.example/about'};data=newsStructuredData(view,'/news/story','https://partner.example');assert.deepEqual(data['@graph'][1].author,{'@type':'Organization',name:'Редакция партнёра',url:'https://partner.example/about'});
});
test('paginated categories expose their own URL and only visible items, with hierarchy matching breadcrumbs',()=>{
 const view={kind:'list',category:{name:'Оборудование'},articles:[{slug:'a',title:'A'}],editorial:{settings:{title:'Новости'}}};const data=newsStructuredData(view,'/news/category/equipment/page/2','https://partner.example');assert.equal(data['@graph'][0].url,'https://partner.example/news/category/equipment/page/2');assert.equal(data['@graph'][0]['@type'],'CollectionPage');assert.equal(data['@graph'][1].numberOfItems,1);assert.equal(data['@graph'][2].itemListElement[2].name,'Оборудование');
});

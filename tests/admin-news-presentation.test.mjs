import {test} from 'node:test';import assert from 'node:assert/strict';
let view={};try{view=await import('../apps/admin/src/lib/news-presentation.mjs')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}

test('batch accepts new and changed materials but never unchanged, withdrawn or unavailable states',()=>{
 for(const state of ['DRAFT','CHANGED'])assert.equal(view.canBatchPublishNews(state),true);
 for(const state of ['PUBLISHED','WITHDRAWN','UNKNOWN'])assert.equal(view.canBatchPublishNews(state),false);
});
test('new-title slug suggestions are readable while list navigation retains filters and rejects foreign return destinations',()=>{
 assert.equal(view.newsSlugSuggestion?.('Новый Wi-Fi роутер — Wave!'),'novyy-wi-fi-router-wave');
 const url=view.newsListUrl?.({siteId:'site',search:'Новый роутер',categoryId:'cat',state:'CHANGED',page:3});const parsed=new URL(url,'https://admin.example');assert.equal(parsed.searchParams.get('search'),'Новый роутер');assert.equal(parsed.searchParams.get('page'),'3');
 const back=view.newsReturnUrl?.(url);assert.equal(new URL(back,'https://admin.example').searchParams.get('restore'),'1');assert.equal(view.newsReturnUrl('//evil.test'),'/news');assert.equal(view.newsReturnUrl('/news/edit?id=else'),'/news');
});
test('lifecycle and unsaved input remain separate and unavailable serving never becomes a false draft',()=>{
 assert.equal(view.newsLifecycle?.({publishedAvailable:false,published:null,state:'DRAFT'},{title:'A'}).label,'Статус сайта недоступен');
 assert.equal(view.newsLifecycle?.({publishedAvailable:true,published:{title:'A'},state:'PUBLISHED'},{title:'B'}).label,'На сайте · есть изменения');
 assert.equal(view.newsLifecycle?.({publishedAvailable:true,published:{title:'A'},state:'PUBLISHED'},{title:'A'}).label,'На сайте');
 assert.equal(view.newsLifecycle?.({publishedAvailable:true,published:null,state:'WITHDRAWN'},{title:'A'}).label,'Снята с публикации');
});

test('automatic slug stops after first publication and never replaces a custom address',()=>{
 assert.equal(view.newsTitleSlug?.('original','Новый заголовок',{auto:true,hasPublished:true}),'original');
 assert.equal(view.newsTitleSlug('original','Новый заголовок',{auto:false,hasPublished:false}),'original');
 assert.equal(view.newsTitleSlug('original','Новый заголовок',{auto:true,hasPublished:false}),'novyy-zagolovok');
});

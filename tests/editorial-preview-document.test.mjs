import test from 'node:test';import assert from 'node:assert/strict';import {createRequire,Module} from 'node:module';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
const requireAdmin=createRequire(resolve('apps/admin/package.json')),ts=requireAdmin('typescript');
const filename=resolve('apps/admin/src/lib/editorial-preview-document.ts'),loaded=new Module(filename);
const render=({kind,article,articles,category,related})=>JSON.stringify({kind,article,articles,category,related});
loaded.require=name=>{
 if(name.endsWith('/data/news'))return{homeNews:e=>e.articles.slice(0,3)};
 if(name.endsWith('/news-projection'))return{sortedNews:rows=>rows,relatedNews:(rows,a)=>rows.filter(row=>row.id!==a.id).slice(0,3),newsPagination:()=>[1]};
 if(name.endsWith('/news-render'))return{renderNewsArticle:render,renderNewsList:render,renderHomeNews:render,renderNotFound:render};
 if(name.endsWith('/news-types'))return{NEWS_PAGE_SIZE:12};
 if(name==='./preview-document.mjs')return{buildPreviewDocument:(_catalog,_route,_styles,_assets,override)=>override.body};
 throw Error('Unexpected preview dependency '+name);
};
loaded._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {editorialPreviewDocument}=loaded.exports;
const payload=kind=>({kind,entityId:'selected',catalog:{},editorial:{articles:[{id:'old',slug:'occupied',categoryId:'other',title:'Чужая публикация'},{id:'selected',slug:'occupied',categoryId:'selected',title:'Выбранный черновик'}],categories:[{id:'other',slug:'other'},{id:'selected',slug:'occupied',name:'Выбранная категория'}],settings:{}}});
test('article preview keeps selected ID despite an occupied slug and explains only its own namespace collision',()=>{
 const result=editorialPreviewDocument(payload('ARTICLE'),'article','',{});assert.match(result.document,/"article":\{"id":"selected"/);assert.match(result.notice,/адрес используется/);
 const clean=payload('ARTICLE');clean.editorial.articles.shift();assert.equal(editorialPreviewDocument(clean,'article','',{}).notice,'');
});
test('category preview filters by selected category ID and ignores equal article IDs/slugs',()=>{
 const result=editorialPreviewDocument(payload('CATEGORY'),'list','',{});assert.match(result.document,/"category":\{"id":"selected"/);assert.doesNotMatch(result.document,/Чужая публикация/);assert.equal(result.notice,'');
});

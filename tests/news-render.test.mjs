import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderNewsArticle,renderNewsList,renderNewsBody,renderNewsCard,renderNotFound,renderNewsPagination} from '../apps/web/src/lib/news-render.ts';
import {newsDraft,newsSettingsDefaults,notFoundDefaults} from '../apps/api/src/news-types.ts';
const article={...newsDraft(),id:'a',slug:'a',categoryId:'c',title:'<img src=x onerror=alert(1)>',summary:'Анонс & новости',publishedDate:'2024-10-01T23:30:00Z',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<script>alert(1)</script>',marks:[{type:'bold'}]}]}]}};
const editorial={version:'1.0.0',articles:[article],categories:[{id:'c',slug:'equipment',name:'Оборудование'}],settings:newsSettingsDefaults(),notFound:null};
test('news card is one semantic link with escaped title, Moscow date and optional cover fallback',()=>{
 const html=renderNewsCard(editorial,article);assert.equal((html.match(/<a\b/g)||[]).length,1);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/2 октября 2024/);assert.match(html,/broadcast\.svg/);assert.doesNotMatch(html,/читать новость/i);
});
test('article shares the safe body renderer, keeps simple breadcrumbs and always exposes All news',()=>{
 const html=renderNewsArticle({kind:'article',editorial,article,categories:editorial.categories,related:[]});assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.match(html,/<strong>&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/breadcrumb-wide/);assert.match(html,/href="\/news">Все новости/);assert.doesNotMatch(html,/Автор:|Источник:/);
 assert.throws(()=>renderNewsBody(editorial,{type:'iframe'}),/Неподдерживаемый/);
});
test('pagination hides one page and exposes only real linked pages with separate narrow and wide markup',()=>{
 const view={kind:'list',editorial,categories:[],category:null,articles:[],base:'/news',total:0,totalPages:1,page:1,widePagination:[],narrowPagination:[]};assert.equal(renderNewsPagination(view),'');
 const html=renderNewsPagination({...view,totalPages:10,page:2,widePagination:[1,2,3,4,5,'gap-end',10],narrowPagination:[1,2,3,'gap-end',10]});assert.match(html,/rel="prev" href="\/news"/);assert.match(html,/rel="next" href="\/news\/page\/3"/);assert.equal((html.match(/aria-current="page"/g)||[]).length,2);assert.doesNotMatch(html,/href="[^"]*gap-/);
 assert.match(renderNewsList(view),/Здесь появятся новости/);
});
test('404 renders only approved destinations and escaped content without an automatic redirect',()=>{
 const html=renderNotFound({...notFoundDefaults(),title:'<script>oops</script>'});assert.match(html,/&lt;script&gt;/);assert.match(html,/href="\/goroda-obsluzhivaniya"/);assert.doesNotMatch(html,/http-equiv|<script>/);
});

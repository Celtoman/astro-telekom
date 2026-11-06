const {test}=require('node:test');const assert=require('node:assert/strict');
let news={};try{news=require('../apps/api/dist/news-projection.js')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}
const {emptyEditorial}=require('../apps/api/dist/editorial-publication-model.js');
const {newsDraft}=require('../apps/api/dist/news-types.js');
function fixture(count=25){const e=emptyEditorial();e.categories=[{id:'c1',slug:'equipment',name:'Оборудование'},{id:'c2',slug:'services',name:'Сервисы'},{id:'empty',slug:'empty',name:'Пусто'}];e.articles=Array.from({length:count},(_,i)=>({...newsDraft(),id:`article-${String(i).padStart(3,'0')}`,slug:`item-${i}`,title:`Новость ${i}`,summary:'Анонс',categoryId:i<15?'c1':'c2',publishedDate:new Date(Date.UTC(2024,8,30-i)).toISOString()}));return e}
test('news routes paginate twelve actual published items and exclude empty categories',()=>{
 const e=fixture();const routes=news.newsRoutes?.(e);
 assert.equal(routes?.filter(r=>r.kind==='NEWS_LIST').length,3);
 assert.ok(routes?.some(r=>r.path==='/news/category/equipment/page/2'));
 assert.ok(!routes?.some(r=>r.path.includes('/empty')));assert.equal(routes?.filter(r=>r.kind==='NEWS_ARTICLE').length,25);
 assert.deepEqual(news.newsPage?.(e,2).articles.map(a=>a.slug),Array.from({length:12},(_,i)=>`item-${i+12}`));
 assert.equal(news.newsPage(e,4),null);assert.equal(news.newsPage(e,0),null);assert.equal(news.newsPage(e,1,'empty'),null);
 assert.equal(news.newsPage(emptyEditorial(),1).articles.length,0);assert.equal(news.newsPage(emptyEditorial(),1).totalPages,1);
});
test('same-date ordering is stable and related uses category then any fresh published news',()=>{
 const e=fixture(4);e.articles[0].categoryId='unique';
 assert.deepEqual(news.relatedNews?.(e.articles,e.articles[0]).map(a=>a.id),['article-001','article-002','article-003']);
 e.articles[0].related={mode:'manual',ids:['article-003','draft','article-000']};
 assert.deepEqual(news.relatedNews(e.articles,e.articles[0]).map(a=>a.id),['article-003','article-001','article-002']);
 e.articles[1].publishedDate=e.articles[0].publishedDate;
 assert.deepEqual(news.sortedNews?.([e.articles[1],e.articles[0]]).map(a=>a.id),['article-000','article-001']);
});
test('numbered pagination obeys seven/five slots, always includes current and edges, never hides one page behind ellipsis',()=>{
 for(const slots of [5,7])for(let total=2;total<=60;total++)for(let current=1;current<=total;current++){
  const tokens=news.newsPagination?.(current,total,slots);
  assert.ok(tokens?.length<=slots);assert.equal(tokens[0],1);assert.equal(tokens.at(-1),total);assert.ok(tokens.includes(current));
  for(let i=1;i<tokens.length-1;i++)if(typeof tokens[i]==='string')assert.ok(tokens[i+1]-tokens[i-1]>=3);
 }
 assert.deepEqual(news.newsPagination(1,1,7),[]);assert.equal(news.newsPagePath?.('/news',1),'/news');assert.equal(news.newsPagePath('/news/category/tech',2),'/news/category/tech/page/2');
});

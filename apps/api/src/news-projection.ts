import { NEWS_PAGE_SIZE, newsSettingsDefaults, newsMediaUseKey } from './news-types';
import type { EditorialSource } from './editorial-publication-model';
export type NewsRoute = {id:'NEWS'|'NEWS_ARTICLE'|'NEWS_CATEGORY';kind:'NEWS_LIST'|'NEWS_ARTICLE'|'NEWS_CATEGORY';path:string;page?:number;newsSlug?:string;categorySlug?:string};
export type PublishedNews = Record<string,any> & {id:string;slug:string;categoryId:string;publishedDate:string};
export function sortedNews(articles: Array<Record<string,any>>): PublishedNews[] {
  return [...articles].sort((a,b)=>Date.parse(b.publishedDate)-Date.parse(a.publishedDate)||String(a.id).localeCompare(String(b.id),'en')) as PublishedNews[];
}
export function newsPagePath(base:string,page:number) { return page===1?base:`${base}/page/${page}`; }
export function newsPage(editorial:EditorialSource,page=1,categorySlug?:string) {
  if(editorial.newsEnabled===false)return null;
  if (!Number.isSafeInteger(page)||page<1)return null;
  const category=categorySlug?editorial.categories.find(c=>c.slug===categorySlug):null;
  if(categorySlug&&!category)return null;
  const items=sortedNews(editorial.articles).filter(a=>!category||a.categoryId===category.id);
  if(category&&!items.length)return null;
  const totalPages=Math.max(1,Math.ceil(items.length/NEWS_PAGE_SIZE));
  if(page>totalPages)return null;
  return {articles:items.slice((page-1)*NEWS_PAGE_SIZE,page*NEWS_PAGE_SIZE),category,total:items.length,totalPages,page,base:category?`/news/category/${category.slug}`:'/news'};
}
export function newsRoutes(editorial:EditorialSource):NewsRoute[] {
  if(editorial.newsEnabled===false)return [];
  const routes:NewsRoute[]=[];
  const addPages=(base:string,count:number,categorySlug?:string)=>{
    for(let page=1;page<=Math.max(1,Math.ceil(count/NEWS_PAGE_SIZE));page++)routes.push({id:categorySlug?'NEWS_CATEGORY':'NEWS',kind:categorySlug?'NEWS_CATEGORY':'NEWS_LIST',path:newsPagePath(base,page),page,...(categorySlug?{categorySlug}:{})});
  };
  addPages('/news',editorial.articles.length);
  for(const category of editorial.categories){const count=editorial.articles.filter(a=>a.categoryId===category.id).length;if(count)addPages(`/news/category/${category.slug}`,count,category.slug)}
  const slugs=new Set<string>();
  for(const article of editorial.articles){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)||['page','category'].includes(article.slug)||slugs.has(article.slug))throw new Error('Некорректный или занятый адрес новости');
    slugs.add(article.slug);routes.push({id:'NEWS_ARTICLE',kind:'NEWS_ARTICLE',path:`/news/${article.slug}`,newsSlug:article.slug});
  }
  return routes;
}
export function relatedNews(articles:Array<Record<string,any>>,current:Record<string,any>,limit=3) {
  const sorted=sortedNews(articles).filter(a=>a.id!==current.id), selected:PublishedNews[]=[];
  const add=(article:PublishedNews|undefined)=>{if(article&&!selected.some(a=>a.id===article.id)&&selected.length<limit)selected.push(article)};
  if(current.related?.mode==='manual')for(const id of current.related.ids??[])add(sorted.find(a=>a.id===id));
  sorted.filter(a=>a.categoryId===current.categoryId).forEach(add);sorted.forEach(add);return selected;
}
export function relatedNewsOptions(articles:Array<Record<string,any>>,query:{currentId?:string;categoryId?:string;selectedIds?:string[];search?:string;page?:number}={}) {
  const all=sortedNews(articles).filter(a=>a.id!==query.currentId),term=(query.search??'').trim().slice(0,250).toLocaleLowerCase('ru');
  const summarize=(a:Record<string,any>)=>({id:String(a.id),title:String(a.title),categoryId:String(a.categoryId),publishedDate:String(a.publishedDate),slug:String(a.slug),available:true});
  const filtered=all.filter(a=>!term||a.title.toLocaleLowerCase('ru').includes(term));
  const page=Number.isSafeInteger(query.page)&&Number(query.page)>0?Number(query.page):1,pageSize=25;
  return {items:filtered.slice((page-1)*pageSize,page*pageSize).map(summarize),total:filtered.length,page,pageSize,selected:(query.selectedIds??[]).slice(0,3).map(id=>{const article=all.find(a=>a.id===id);return article?summarize(article):{id,available:false}}),recommended:relatedNews(articles,{id:query.currentId,categoryId:query.categoryId,related:{mode:'auto'}},3).map(summarize)};
}
/** Slot count includes non-interactive ellipses; a one-page gap is always its page number. */
export function newsPagination(current:number,total:number,slots=7):Array<number|string> {
  if(total<=1)return [];
  if(!Number.isSafeInteger(total)||!Number.isSafeInteger(current)||current<1||current>total||![5,7].includes(slots))throw new Error('Invalid pagination');
  if(total<=slots)return Array.from({length:total},(_,i)=>i+1);
  let best:Array<number|string>=[],bestScore=-Infinity;
  for(let start=Math.max(1,current-slots+1);start<=current;start++)for(let end=current;end<=Math.min(total,current+slots-1);end++){
    const pages=[...new Set([1,...Array.from({length:end-start+1},(_,i)=>i+start),total])].sort((a,b)=>a-b),tokens:Array<number|string>=[];
    for(const page of pages){const last=tokens.at(-1);if(typeof last==='number'){if(page-last===2)tokens.push(last+1);else if(page-last>2)tokens.push(last<current?'gap-start':'gap-end')}tokens.push(page)}
    if(tokens.length>slots)continue;
    const numbers=tokens.filter((x):x is number=>typeof x==='number');
    const score=numbers.length*1000-numbers.reduce((n,page)=>n+Math.abs(page-current),0)-Math.abs(start+end-2*current)*.01;
    if(score>bestScore){best=tokens;bestScore=score}
  }
  return best;
}
export function newsSeoForRoute(editorial:EditorialSource,route:NewsRoute) {
  const settings={...newsSettingsDefaults(),...editorial.settings};
  const article=route.kind==='NEWS_ARTICLE'?editorial.articles.find(a=>a.slug===route.newsSlug):null;
  const category=route.kind==='NEWS_CATEGORY'?editorial.categories.find(c=>c.slug===route.categorySlug):null;
  const owner=article??category??settings;
  const title=String(owner.seo?.title||article?.title||category?.name||settings.title)+(route.page&&route.page>1?` — Страница ${route.page}`:'');
  const description=String(owner.seo?.description||article?.summary||category?.description||settings.intro);
  const use=owner.social?.image??article?.cover??settings.social?.image;
  const variants=use?editorial.media?.[newsMediaUseKey(use,'social')]:null,image=variants?.at(-1);
  return {title,description,indexState:'INDEX' as const,ogTitle:String(owner.social?.title||title),ogDescription:String(owner.social?.description||description),ogImage:image?.src??'/images/home-connection-equipment.webp',...(image?{ogImageWidth:image.width,ogImageHeight:image.height,ogImageAlt:use.alt}:{}),type:article?'article':'website'};
}

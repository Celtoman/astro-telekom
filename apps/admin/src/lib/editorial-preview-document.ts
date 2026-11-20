import { homeNews, type NewsView } from '../../../web/src/data/news';
import { sortedNews, relatedNews, newsPagination } from '../../../api/src/news-projection';
import { renderNewsArticle, renderNewsList, renderHomeNews, renderNotFound } from '../../../web/src/lib/news-render';
import type { EditorialSource } from '../../../api/src/editorial-publication-model';
import type { EditorialPreviewView } from '../../../api/src/editorial-preview-model';
import { NEWS_PAGE_SIZE, type NotFoundContent } from '../../../api/src/news-types';
import { buildPreviewDocument } from './preview-document.mjs';
export interface EditorialPreviewPayload { available:boolean;kind:string;entityId:string;revision:number;selectedRevision:number|null;mode:string;publicationId:string;editorial:EditorialSource|null;mediaRequests:Record<string,string>;catalog:Record<string,any>;view?:EditorialPreviewView }
export function editorialPreviewDocument(payload:EditorialPreviewPayload,surface:string,styles:string,assets:Record<string,string>) {
  const e=payload.editorial,projected=payload.view,options={asset:(path:string)=>assets[path]??path};
  surface=projected?.surface??surface;
  let body='',notice=projected?.notice??'';
  if(payload.kind==='NOT_FOUND')body=e?.notFound?renderNotFound(e.notFound as NotFoundContent):'<section class="hero"><div class="container"><span class="eyebrow">Ошибка 404</span><h1>Страница не найдена</h1><p class="lead">Проверьте адрес или выберите город на главной странице.</p><a class="button" href="/">На главную</a></div></section>';
  else if(e){
    const a=payload.kind==='ARTICLE'?e.articles.find(item=>item.id===payload.entityId):undefined,category=payload.kind==='CATEGORY'?e.categories.find(item=>item.id===payload.entityId):undefined;
    if(payload.kind==='ARTICLE'&&!a&&(!projected||surface==='article'))throw new Error('Материал отсутствует в выбранной версии.');
    if(surface==='home'){
      const articles=projected?e.articles:homeNews(e);body=`<div class="news-page">${renderHomeNews(e,articles,options)}</div>`;
      if(!projected){
        if(a&&!articles.some(item=>item.id===a.id))notice='Эта новость не входит в три последних по дате и не появится в блоке главной.';
        if(!articles.length)notice='На главной блок скрыт: опубликованных новостей нет.';
      }
    }else if(payload.kind==='ARTICLE'&&surface==='article')body=renderNewsArticle({kind:'article',editorial:e,categories:e.categories,article:a!,related:projected?e.articles.slice(1) as ReturnType<typeof relatedNews>:relatedNews(e.articles,a!)},options);
    else{
      const all=projected?e.articles as ReturnType<typeof sortedNews>:sortedNews(e.articles).filter(item=>!category||item.categoryId===category.id);
      const currentIndex=!projected&&a?all.findIndex(item=>item.id===a.id):0;
      const page=projected?.page??Math.floor(Math.max(0,currentIndex)/NEWS_PAGE_SIZE)+1;
      const total=projected?.total??all.length,totalPages=Math.max(1,Math.ceil(total/NEWS_PAGE_SIZE));
      const view:Extract<NewsView,{kind:'list'}>={kind:'list',editorial:e,categories:projected?e.categories:e.categories.filter(c=>c.id===category?.id||e.articles.some(item=>item.categoryId===c.id)),category:category??null,articles:projected?all:all.slice((page-1)*NEWS_PAGE_SIZE,page*NEWS_PAGE_SIZE),total,totalPages,page,base:category?`/news/category/${category.slug}`:'/news',widePagination:newsPagination(page,totalPages,7),narrowPagination:newsPagination(page,totalPages,5)};
      body=renderNewsList(view,options);
      if(!projected&&category&&!e.articles.some(item=>item.categoryId===category.id))notice='У категории нет опубликованных новостей. Посетителям её страница будет скрыта до первой публикации.';
    }
  }
  if(!projected){
    const namespace=payload.kind==='ARTICLE'?e?.articles:payload.kind==='CATEGORY'?e?.categories:[];
    const selected=namespace?.find(item=>item.id===payload.entityId);
    const collision=selected&&namespace?.some(item=>item.id!==selected.id&&item.slug===selected.slug);
    if(selected&&!selected.slug)notice+=' Адрес ещё не заполнен; показан выбранный черновик.';
    if(collision)notice+=' Этот адрес используется другой опубликованной записью. Показан выбранный черновик; перед выпуском измените адрес.';
  }
  const document=buildPreviewDocument(payload.catalog,'/__editorial-preview',styles,assets,{title:'Сохранённый предпросмотр',body:`<div class="preview-news">${body}</div>`}).replace(/\shref="[^"]*"/g,' aria-disabled="true"');
  return {document,notice};
}

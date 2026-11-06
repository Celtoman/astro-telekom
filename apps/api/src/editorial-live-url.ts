import type { CatalogSource } from './site-catalog.service';
import type { EditorialKind } from './editorial-publication-model';
import { normalizeSitemapOrigin } from './sitemap-policy';
export function editorialLiveUrl(source:CatalogSource,kind:EditorialKind,id:string,configuredOrigin=process.env.PUBLIC_SITE_URL):string|null {
  const editorial=source.editorial;if(!editorial||editorial.newsEnabled===false||kind==='NOT_FOUND')return null;
  const article=kind==='ARTICLE'?editorial.articles.find(a=>a.id===id):null,category=kind==='CATEGORY'?editorial.categories.find(c=>c.id===id):null;
  const path=kind==='NEWS_SETTINGS'?'/news':article?`/news/${article.slug}`:category&&editorial.articles.some(a=>a.categoryId===category.id)?`/news/category/${category.slug}`:null;
  if(!path)return null;
  try{return normalizeSitemapOrigin(configuredOrigin||source.site.domain||'')+path}catch{return null}
}

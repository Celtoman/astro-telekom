import type { NewsView } from '../data/news';
import { newsMediaUseKey } from '../../../api/src/news-types.ts';
export function newsStructuredData(view: NewsView, path: string, origin: string | URL, asset: (path: string) => string = p => p) {
  const absolute = (value: string) => new URL(value, origin).href, url = absolute(path);
  const a = view.kind === 'article' ? view.article : null, c = view.kind === 'list' ? view.category : null;
  const title = String(a?.title ?? c?.name ?? view.editorial.settings.title);
  const trail = [{ name: 'Главная', item: absolute('/') }, { name: 'Новости', item: absolute('/news') }, ...(a || c ? [{ name: title, item: url }] : [])];
  const breadcrumb = { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumbs`, itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) };
  const page = { '@type': a ? 'WebPage' : 'CollectionPage', '@id': `${url}#webpage`, url, name: title, inLanguage: 'ru-RU', breadcrumb: { '@id': breadcrumb['@id'] } };
  if (a) {
    const cover = a.cover ? view.editorial.media?.[newsMediaUseKey(a.cover, 'cover')]?.at(-1) : null;
    const article = { '@type': a.schemaType, '@id': `${url}#article`, mainEntityOfPage: { '@id': page['@id'] }, headline: a.title, description: a.summary, datePublished: a.publishedDate, ...(a.dateModified ? { dateModified: a.dateModified } : {}), articleSection: view.editorial.categories.find(category => category.id === a.categoryId)?.name, inLanguage: 'ru-RU', ...(cover ? { image: { '@type': 'ImageObject', url: absolute(asset(cover.src)), width: cover.width, height: cover.height } } : {}), ...(a.author ? { author: { '@type': a.author.type, name: a.author.name, ...(a.author.url ? { url: a.author.url } : {}) } } : {}), ...(a.source?.url ? { isBasedOn: a.source.url } : {}) };
    return { '@context': 'https://schema.org', '@graph': [{ ...page, mainEntity: { '@id': article['@id'] } }, article, breadcrumb] };
  }
  const items = view.kind === 'list' ? view.articles : [];
  const itemList = { '@type': 'ItemList', '@id': `${url}#items`, numberOfItems: items.length, itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.title, url: absolute(`/news/${item.slug}`) })) };
  return { '@context': 'https://schema.org', '@graph': [{ ...page, mainEntity: { '@id': itemList['@id'] } }, itemList, breadcrumb] };
}

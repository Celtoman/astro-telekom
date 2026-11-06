import { newsRoutes, newsPage, newsPagination, relatedNews, sortedNews, type NewsRoute } from '../../../api/src/news-projection';
import { validateNewsArticle, validateNewsCategory, validateNewsSettings, validateNotFound } from '../../../api/src/news-content-validator';
import type { EditorialSource } from '../../../api/src/editorial-publication-model';
import { newsMediaUseKey, type MediaUse } from '../../../api/src/news-types';

/** Fail closed at the immutable snapshot boundary, including private media references. */
export function editorialCatalog(raw: unknown): EditorialSource | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Некорректный редакционный снимок');
  const e = structuredClone(raw) as EditorialSource;
  if (e.version !== '1.0.0' || !Array.isArray(e.articles) || !Array.isArray(e.categories) || e.newsEnabled !== undefined && typeof e.newsEnabled !== 'boolean') throw new Error('Неизвестная версия новостей');
  const ids = new Set<string>(), categories = new Set<string>();
  for (const c of e.categories) {
    const { id, revision: _revision, ...content } = c;
    if (typeof id !== 'string' || !id || categories.has(id)) throw new Error('Дубли категорий');
    categories.add(id); validateNewsCategory(content);
  }
  const contentOnly = (row: Record<string, any>) => { const { id: _id, revision: _revision, ...content } = row; return content; };
  validateNewsSettings(contentOnly(e.settings));
  if (e.notFound !== null) validateNotFound(contentOnly(e.notFound));
  for (const a of e.articles) {
    const { id, revision: _revision, dateModified, ...content } = a;
    if (typeof id !== 'string' || !id || ids.has(id) || !categories.has(a.categoryId)) throw new Error('Неполный состав новостей');
    ids.add(id); validateNewsArticle(content, false, id);
    if (dateModified !== undefined && !Number.isFinite(Date.parse(dateModified))) throw new Error('Некорректная дата редакции');
  }
  for (const variants of Object.values(e.media ?? {})) {
    if (!Array.isArray(variants) || !variants.length) throw new Error('Пустой набор изображений');
    for (const v of variants) if (!/^[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(v.sourceKey) || v.src !== `/media/editorial/${v.sourceKey}` || v.sha256 !== v.sourceKey.slice(65, -5) || ![v.width, v.height, v.bytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Небезопасный источник новостного изображения');
  }
  const requireImage = (use: MediaUse | null | undefined, kind: 'cover' | 'social' | 'body') => { if (use && !e.media?.[newsMediaUseKey(use, kind)]?.length) throw new Error('Не подготовлено изображение новости'); };
  const bodyImages = (node: Record<string, any>) => { if (node.type === 'image') requireImage(node.attrs, 'body'); for (const child of node.content ?? []) bodyImages(child); };
  for (const a of e.articles) { requireImage(a.cover, 'cover'); requireImage(a.social?.image ?? a.cover, 'social'); bodyImages(a.body); }
  for (const c of [...e.categories, e.settings]) requireImage(c.social?.image, 'social');
  newsRoutes(e);
  return e;
}

export function newsView(editorial: EditorialSource, route: NewsRoute) {
  const categories = editorial.categories.filter(c => editorial.articles.some(a => a.categoryId === c.id));
  if (route.kind === 'NEWS_ARTICLE') {
    const article = editorial.articles.find(a => a.slug === route.newsSlug);
    if (!article) throw new Error('Новость отсутствует в снимке');
    return { kind: 'article' as const, editorial, categories, article, related: relatedNews(editorial.articles, article) };
  }
  const page = newsPage(editorial, route.page, route.categorySlug);
  if (!page) throw new Error('Страница новостей отсутствует в снимке');
  return { kind: 'list' as const, editorial, categories, ...page, widePagination: newsPagination(page.page, page.totalPages, 7), narrowPagination: newsPagination(page.page, page.totalPages, 5) };
}
export type NewsView = ReturnType<typeof newsView>;
export function homeNews(editorial?: EditorialSource) { return editorial?.newsEnabled !== false ? sortedNews(editorial?.articles ?? []).slice(0, 3) : []; }

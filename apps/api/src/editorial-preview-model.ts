import { emptyEditorial, type EditorialKind, type EditorialSource } from './editorial-publication-model';
import { relatedNews, sortedNews } from './news-projection';
import { NEWS_PAGE_SIZE } from './news-types';
import { assertSitePublicDisplay } from './site-public-display-model';

export type EditorialPreviewSurface = 'article' | 'list' | 'home';
export type EditorialPreviewView = { surface: EditorialPreviewSurface; notice: string; page: number; total: number };
/** Only the selected saved revision is overlaid. Other working rows never enter preview. */
export function editorialPreviewOverlay(baseline: EditorialSource | undefined, kind: EditorialKind, selected: { id: string; revision: number; content: Record<string, any> }, category?: Record<string, any>) {
  const e = structuredClone(baseline ?? emptyEditorial());
  const value: Record<string, any> = { ...structuredClone(selected.content), id: selected.id, revision: selected.revision };
  if (kind === 'ARTICLE') {
    e.articles = [...e.articles.filter(a => a.id !== selected.id), value];
    if (!e.categories.some(c => c.id === value.categoryId) && category) e.categories.push(structuredClone(category));
    e.newsEnabled = true;
  } else if (kind === 'CATEGORY') { e.categories = [...e.categories.filter(c => c.id !== selected.id), value]; e.newsEnabled = true; }
  else if (kind === 'NEWS_SETTINGS') { e.settings = value; e.newsEnabled = true; }
  else e.notFound = value;
  return e;
}

export function editorialPreviewSelection(
  editorial: EditorialSource | undefined,
  kind: EditorialKind,
  entityId: string,
  surface: EditorialPreviewSurface,
) {
  const view: EditorialPreviewView = { surface, notice: '', page: 1, total: 0 };
  if (!editorial) return { editorial, view };
  if (kind === 'NOT_FOUND') return {
    editorial: { ...emptyEditorial(), notFound: editorial.notFound }, view,
  };
  const article = kind === 'ARTICLE' ? editorial.articles.find(item => item.id === entityId) : undefined;
  const category = kind === 'CATEGORY' ? editorial.categories.find(item => item.id === entityId) : undefined;
  let articles: EditorialSource['articles'];
  const categoryIds = new Set<string>();
  if (surface === 'article' && article) articles = [article, ...relatedNews(editorial.articles, article)];
  else if (surface === 'home') {
    articles = editorial.newsEnabled === false ? [] : sortedNews(editorial.articles).slice(0, 3);
    if (!articles.length) view.notice = 'На главной блок скрыт: опубликованных новостей нет.';
    else if (article && !articles.some(item => item.id === article.id)) view.notice = 'Эта новость не входит в три последних по дате и не появится в блоке главной.';
  } else {
    const sorted = sortedNews(editorial.articles).filter(item => !category || item.categoryId === category.id);
    const index = article ? sorted.findIndex(item => item.id === entityId) : 0;
    view.page = Math.floor(Math.max(0, index) / NEWS_PAGE_SIZE) + 1;
    view.total = sorted.length;
    articles = sorted.slice((view.page - 1) * NEWS_PAGE_SIZE, view.page * NEWS_PAGE_SIZE);
    for (const item of editorial.articles) categoryIds.add(item.categoryId);
    if (category) {
      categoryIds.add(category.id);
      if (view.total === 0) view.notice = 'У категории нет опубликованных новостей. Посетителям её страница будет скрыта до первой публикации.';
    }
  }
  for (const item of articles) categoryIds.add(item.categoryId);
  const selected = article ?? category;
  const namespace = article ? editorial.articles : editorial.categories;
  if (selected && !selected.slug) view.notice += ' Адрес ещё не заполнен; показан выбранный черновик.';
  if (selected && namespace.some(item => item.id !== selected.id && item.slug === selected.slug)) {
    view.notice += ' Этот адрес используется другой опубликованной записью. Показан выбранный черновик; перед выпуском измените адрес.';
  }
  return {
    editorial: {
      ...emptyEditorial(),
      articles: articles.map((item, index) => {
        if (surface === 'article' && index === 0) return item;
        const { id, slug, title, summary, categoryId, publishedDate, cover } = item;
        return { id, slug, title, summary, categoryId, publishedDate, cover };
      }),
      categories: editorial.categories.filter(item => categoryIds.has(item.id)),
      settings: editorial.settings,
    },
    view,
  };
}

export function editorialPreviewShell(raw: unknown) {
  const catalog = raw as {
    site?: { name: string; slug: string; domain: string | null; connectionPhone: string; supportPhone: string; publicDisplay?: unknown };
    cities?: Array<{ slug: string; name: string; status?: string }>;
    routes?: Array<{ kind: string; id: string; path: string }>;
  };
  const site = catalog?.site;
  if (!site || typeof site.slug !== 'string' || typeof site.connectionPhone !== 'string' || typeof site.supportPhone !== 'string'
      || !Array.isArray(catalog.cities) || !Array.isArray(catalog.routes)) return null;
  try { assertSitePublicDisplay(site.publicDisplay); } catch { return null; }
  if (!catalog.routes.some(route => route?.kind === 'HOME' && route.path === '/')) return null;
  const routes = catalog.routes.filter(route => route.kind === 'GLOBAL_PAGE' || route.path === '/news');
  const address = catalog.routes.find(route => route.kind === 'CITY_ADDRESS_CHECK');
  if (address) routes.push(address);
  return {
    site: {
      name: site.name, slug: site.slug, domain: site.domain, connectionPhone: site.connectionPhone,
      supportPhone: site.supportPhone, publicDisplay: site.publicDisplay,
    },
    cities: catalog.cities.filter(city => (!city.status || city.status === 'PUBLISHED') && city.name?.trim() === 'Москва')
      .map(({ slug, name }) => ({ slug, name })),
    routes: routes.map(({ kind, id, path }) => ({ kind, id, path })),
  };
}

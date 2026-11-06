import type { EditorialSource } from '../../../api/src/editorial-publication-model';
import { newsMediaUseKey, type MediaUse, type NewsBodyNode, type NotFoundContent } from '../../../api/src/news-types.ts';
import type { NewsView } from '../data/news';
import { renderBreadcrumbs } from './breadcrumb-render.ts';
type Options = { asset?: (path: string) => string };
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const asset = (options: Options, path: string) => esc((options.asset ?? (p => p))(path));
export const newsDate = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(value)).replace(/\s*г\.$/, '');
export function renderNewsImage(editorial: EditorialSource, use: MediaUse | null, kind: 'cover' | 'body', options: Options = {}, eager = false) {
  if (!use) return '';
  const variants = editorial.media?.[newsMediaUseKey(use, kind)] ?? [], image = variants.at(-1);
  if (!image) throw new Error('Изображение новости не подготовлено');
  return `<img src="${asset(options, image.src)}" srcset="${variants.map(v => `${asset(options, v.src)} ${v.width}w`).join(', ')}" sizes="${kind === 'body' || eager ? '(max-width: 752px) calc(100vw - 32px), 720px' : '(max-width: 620px) calc(100vw - 72px), (max-width: 1100px) 298px, 387px'}" width="${image.width}" height="${image.height}" alt="${esc(use.decorative ? '' : use.alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}>`;
}
export function renderNewsCard(editorial: EditorialSource, article: Record<string, any>, options: Options = {}, heading: 'h2' | 'h3' = 'h2') {
  const category = editorial.categories.find(c => c.id === article.categoryId);
  return `<a class="news-card" href="/news/${esc(article.slug)}" aria-labelledby="news-title-${esc(article.id)}"><div class="news-card-meta"><span class="news-category-chip">${esc(category?.name)}</span><time datetime="${esc(article.publishedDate)}">${newsDate(article.publishedDate)}</time></div><${heading} id="news-title-${esc(article.id)}" class="news-card-title">${esc(article.title)}</${heading}><p class="news-card-summary">${esc(article.summary)}</p><div class="news-card-media">${article.cover ? renderNewsImage(editorial, article.cover, 'cover', options) : `<div class="news-cover-fallback" aria-hidden="true"><img src="${asset(options, '/images/news/broadcast.svg')}" width="64" height="64" alt=""></div>`}</div></a>`;
}
export function renderNewsGrid(editorial: EditorialSource, articles: Array<Record<string, any>>, options: Options = {}, heading: 'h2' | 'h3' = 'h2') { return `<div class="news-grid">${articles.map(a => renderNewsCard(editorial, a, options, heading)).join('')}</div>`; }
export function renderNewsPagination(view: Extract<NewsView, { kind: 'list' }>) {
  if (view.totalPages <= 1) return '';
  const href = (page: number) => page === 1 ? view.base : `${view.base}/page/${page}`;
  const row = (tokens: Array<number | string>, narrow: boolean) => {
    const previous=view.page>1?`<a class="news-page-arrow" rel="prev" href="${href(view.page-1)}" aria-label="Предыдущая страница">Назад</a>`:'';
    const next=view.page<view.totalPages?`<a class="news-page-arrow" rel="next" href="${href(view.page+1)}" aria-label="Следующая страница">Далее</a>`:'';
    const numbers=`<ol>${tokens.map(token=>typeof token==='number'?`<li>${token===view.page?`<span aria-current="page" aria-label="Страница ${token}">${token}</span>`:`<a href="${href(token)}" aria-label="Страница ${token}">${token}</a>`}</li>`:'<li class="news-page-gap" aria-hidden="true">…</li>').join('')}</ol>`;
    return `<div class="news-pagination-${narrow?'narrow':'wide'}">${narrow?`${numbers}<div class="news-page-actions">${previous}${next}</div>`:`${previous}${numbers}${next}`}</div>`;
  };
  return `<nav class="news-pagination" aria-label="Страницы новостей">${row(view.widePagination, false)}${row(view.narrowPagination, true)}</nav>`;
}
export function renderNewsList(view: Extract<NewsView, { kind: 'list' }>, options: Options = {}) {
  const { editorial: e, category } = view, title = category?.name ?? e.settings.title;
  const crumbs = [{ title: 'Главная', href: '/' }, { title: 'Новости', ...(category ? { href: '/news' } : {}) }, ...(category ? [{ title: category.name, mobileHidden: true }] : [])];
  return `<section class="news-page news-list" data-news-page="list">${renderBreadcrumbs(crumbs)}<header class="news-list-intro"><h1>${esc(title)}</h1>${(category?.description ?? e.settings.intro) ? `<p>${esc(category?.description ?? e.settings.intro)}</p>` : ''}</header><nav class="news-topics" aria-label="Категории новостей"><a href="/news"${!category ? ' aria-current="page"' : ''}>${esc(e.settings.allNewsLabel)}</a>${view.categories.map(c => `<a href="/news/category/${esc(c.slug)}"${category?.id === c.id ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`).join('')}</nav>${view.articles.length ? renderNewsGrid(e, view.articles, options) : `<p class="news-empty">${esc(e.settings.emptyMessage)}</p>`}${renderNewsPagination(view)}</section>`;
}
export function renderNewsBody(editorial: EditorialSource, node: NewsBodyNode, options: Options = {}): string {
  const children = () => (node.content ?? []).map(n => renderNewsBody(editorial, n, options)).join('');
  if (node.type === 'text') return (node.marks ?? []).reduce((value, mark) => mark.type === 'bold' ? `<strong>${value}</strong>` : mark.type === 'italic' ? `<em>${value}</em>` : mark.type === 'link' ? `<a href="${esc(mark.attrs?.href)}">${value}</a>` : value, esc(node.text));
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'doc') return children();
  if (node.type === 'image') { const use = node.attrs as MediaUse; return `<figure>${renderNewsImage(editorial, use, 'body', options)}${use.caption ? `<figcaption>${esc(use.caption)}</figcaption>` : ''}</figure>`; }
  const tag = ({ paragraph: 'p', heading: node.attrs?.level === 3 ? 'h3' : 'h2', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote' } as Record<string, string>)[node.type];
  if (!tag) throw new Error('Неподдерживаемый блок новости');
  return `<${tag}${node.type === 'orderedList' && node.attrs?.start ? ` start="${esc(node.attrs.start)}"` : ''}>${children()}</${tag}>`;
}
export function renderNewsRelated(editorial: EditorialSource, articles: Array<Record<string, any>>, options: Options = {}) {
  return `<section class="news-related" aria-label="${esc(editorial.settings.relatedTitle)}">${articles.length ? `<h2>${esc(editorial.settings.relatedTitle)}</h2>${renderNewsGrid(editorial, articles, options, 'h3')}` : ''}<a class="news-secondary-button" href="/news">${esc(editorial.settings.allNewsLabel)}</a></section>`;
}
export function renderNewsArticle(view: Extract<NewsView, { kind: 'article' }>, options: Options = {}) {
  const { editorial: e, article: a } = view, category = e.categories.find(c => c.id === a.categoryId)!;
  return `<div class="news-page news-article-page" data-news-page="article"><article class="news-reading-column">${renderBreadcrumbs([{ title: 'Главная', href: '/' }, { title: 'Новости', href: '/news' }, { title: a.title, mobileHidden: true }])}<header class="news-article-header"><div class="news-article-meta"><a class="news-category-chip" href="/news/category/${esc(category.slug)}">${esc(category.name)}</a><time datetime="${esc(a.publishedDate)}">${newsDate(a.publishedDate)}</time></div><h1>${esc(a.title)}</h1><p class="news-article-summary">${esc(a.summary)}</p>${a.cover ? `<figure class="news-article-cover">${renderNewsImage(e, a.cover, 'cover', options, true)}${a.cover.caption ? `<figcaption>${esc(a.cover.caption)}</figcaption>` : ''}</figure>` : ''}</header><div class="news-body">${renderNewsBody(e, a.body, options)}</div>${a.author || a.source ? `<footer class="news-attribution">${a.author ? `<p>Автор: ${a.author.url ? `<a href="${esc(a.author.url)}">${esc(a.author.name)}</a>` : esc(a.author.name)}</p>` : ''}${a.source ? `<p>Источник: <a href="${esc(a.source.url)}">${esc(a.source.label || new URL(a.source.url).hostname)}</a></p>` : ''}</footer>` : ''}</article>${renderNewsRelated(e, view.related, options)}</div>`;
}
export function renderHomeNews(editorial: EditorialSource, articles: Array<Record<string, any>>, options: Options = {}) { return articles.length ? `<section class="home-news" data-home-block="home.news" aria-labelledby="home-news-title"><h2 id="home-news-title">${esc(editorial.settings.title)}</h2>${renderNewsGrid(editorial, articles, options, 'h3')}<a class="news-secondary-button" href="/news">${esc(editorial.settings.allNewsLabel)}</a></section>` : ''; }
export function renderNotFound(content: NotFoundContent) { const href = (target: string) => target === 'CITIES' ? '/goroda-obsluzhivaniya' : '/'; return `<section class="news-not-found" data-not-found><h1>${esc(content.title)}</h1><p>${esc(content.description)}</p><div class="news-not-found-actions"><a class="news-primary-button" href="${href(content.primary.target)}">${esc(content.primary.label)}</a><a class="news-secondary-button" href="${href(content.secondary.target)}">${esc(content.secondary.label)}</a></div><p class="news-error-label">${esc(content.errorLabel)}</p></section>`; }

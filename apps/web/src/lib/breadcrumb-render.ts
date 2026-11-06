export type Breadcrumb = { title: string; href?: string; mobileHidden?: boolean };
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
/** CMP-0129 / CMP-0130. Current item is text; mobile retains Home → News. */
export function renderBreadcrumbs(items: Breadcrumb[]) {
  return `<nav class="public-breadcrumbs" aria-label="Хлебные крошки"><ol>${items.map((item, index) => `<li${item.mobileHidden ? ' class="breadcrumb-wide"' : ''}>${index ? '<span aria-hidden="true" class="breadcrumb-separator">/</span>' : ''}${item.href ? `<a href="${escape(item.href)}">${escape(item.title)}</a>` : `<span aria-current="page">${escape(item.title)}</span>`}</li>`).join('')}</ol></nav>`;
}

export const NEWS_VERSION = '1.0.0' as const;
export const NEWS_PAGE_SIZE = 12;
export type MediaUse = { assetId: string; alt: string; caption?: string; decorative?: boolean; crop?: { x: number; y: number; width: number; height: number } };
export type NewsAuthor = { type: 'Person' | 'Organization'; name: string; url?: string };
export type NewsBodyNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: NewsBodyNode[] };
export type NewsSeo = { title?: string; description?: string };
export type NewsSocial = NewsSeo & { image?: MediaUse | null };
export type NewsArticleContent = {
  version: typeof NEWS_VERSION; slug: string; title: string; summary: string; categoryId: string; publishedDate: string;
  body: NewsBodyNode; cover: MediaUse | null; author: NewsAuthor | null; source: { label: string; url: string } | null;
  related: { mode: 'auto' | 'manual'; ids: string[] }; seo: NewsSeo; social: NewsSocial; schemaType: 'NewsArticle' | 'Article';
};
export type NewsCategoryContent = { version: typeof NEWS_VERSION; slug: string; name: string; description: string; seo: NewsSeo; social: NewsSocial };
export type NewsSettingsContent = { version: typeof NEWS_VERSION; title: string; intro: string; emptyMessage: string; allNewsLabel: string; relatedTitle: string; seo: NewsSeo; social: NewsSocial };
export type NotFoundContent = { version: typeof NEWS_VERSION; title: string; description: string; primary: { label: string; target: 'HOME' | 'CITIES' }; secondary: { label: string; target: 'HOME' | 'CITIES' }; errorLabel: string };


export function newsDraft(): NewsArticleContent {
  return { version: NEWS_VERSION, slug: '', title: '', summary: '', categoryId: '', publishedDate: new Date().toISOString(), body: { type: 'doc', content: [] }, cover: null, author: null, source: null, related: { mode: 'auto', ids: [] }, seo: {}, social: {}, schemaType: 'NewsArticle' };
}
export function newsSettingsDefaults(): NewsSettingsContent { return { version: NEWS_VERSION, title: 'Новости Дом.ру', intro: 'Изменения в тарифах, сервисах и работе провайдера.', emptyMessage: 'Здесь появятся новости провайдера.', allNewsLabel: 'Все новости', relatedTitle: 'Другие новости', seo: {}, social: {} }; }
export function notFoundDefaults(): NotFoundContent { return { version: NEWS_VERSION, title: 'Страница не найдена', description: 'Возможно, страница удалена или в адресе есть опечатка. Перейдите на главную или выберите город.', primary: { label: 'На главную', target: 'HOME' }, secondary: { label: 'Выбрать город', target: 'CITIES' }, errorLabel: 'Код ошибки: 404' }; }

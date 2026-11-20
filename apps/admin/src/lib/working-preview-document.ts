import type { NewsRoute } from '../../../api/src/news-projection'
import { newsView } from '../../../web/src/data/news'
import { renderNewsArticle, renderNewsList } from '../../../web/src/lib/news-render'
import { buildPreviewDocument, previewAsset } from './preview-document.mjs'

export function buildWorkingPreviewDocument(catalog: Record<string, any>, path: string, styles: string, assets: Record<string, string>) {
  const route = catalog.routes?.find((entry: { path: string }) => entry.path === path)
  if (!route || !['NEWS_LIST', 'NEWS_CATEGORY', 'NEWS_ARTICLE'].includes(route.kind)) {
    return buildPreviewDocument(catalog, path, styles, assets)
  }
  if (!catalog.editorial) throw new Error('Редакционные данные маршрута отсутствуют в рабочем каталоге')
  const view = newsView(catalog.editorial, route as NewsRoute)
  const options = { asset: (source: string) => previewAsset(catalog, source, assets) }
  const body = view.kind === 'article' ? renderNewsArticle(view, options) : renderNewsList(view, options)
  const title = view.kind === 'article' ? view.article.title : view.category?.name ?? view.editorial.settings.title
  return buildPreviewDocument(catalog, path, styles, assets, { title, body }).replace(/\shref="[^"]*"/g, ' aria-disabled="true"')
}

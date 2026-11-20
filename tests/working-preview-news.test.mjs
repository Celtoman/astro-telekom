import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { buildPreviewDocument, previewRouteOptions } from '../apps/admin/src/lib/preview-document.mjs'
import { renderNewsArticle, renderNewsList } from '../apps/web/src/lib/news-render.ts'

const require = createRequire(import.meta.url)
const ts = createRequire(resolve('apps/admin/package.json'))('typescript')
const api = name => require(`../apps/api/dist/${name}.js`)
const { newsSource } = require('./helpers/news-source.cjs')
const { SiteCatalogService } = api('site-catalog.service')
const { workingPreviewPage } = api('working-preview-model')
const { newsMediaUseKey } = api('news-types')
const sha = value => createHash('sha256').update(value).digest('hex')

function loadSource(file, imports) {
  const filename = resolve(file)
  const module = new Module(filename)
  module.require = name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected preview dependency ${name}`)
    return imports[name]
  }
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename)
  return module.exports
}

const news = loadSource('apps/web/src/data/news.ts', {
  '../../../api/src/news-projection': api('news-projection'),
  '../../../api/src/news-content-validator': api('news-content-validator'),
  '../../../api/src/news-types': api('news-types'),
})
const { buildWorkingPreviewDocument } = loadSource('apps/admin/src/lib/working-preview-document.ts', {
  '../../../web/src/data/news': news,
  '../../../web/src/lib/news-render': { renderNewsArticle, renderNewsList },
  './preview-document.mjs': await import('../apps/admin/src/lib/preview-document.mjs'),
})

test('general preview renders the exact published news list, pagination, category and article in its inert shell', () => {
  const source = newsSource(13)
  const selected = source.editorial.articles[0]
  const second = source.editorial.articles[1]
  selected.cover = { assetId: 'cover-a', alt: 'Обложка статьи' }
  second.cover = { assetId: 'cover-b', alt: 'Обложка связанной статьи' }
  const illustration = { assetId: 'body-a', alt: 'Иллюстрация' }
  selected.body.content.push({ type: 'image', attrs: illustration })
  const articleLink = { type: 'text', text: 'Источник', marks: [{ type: 'link', attrs: { href: 'https://example.test/source' } }] }
  selected.body.content.push({ type: 'paragraph', content: [articleLink] })
  const variant = (key, width) => {
    const hash = sha(key + width)
    return { src: `/media/editorial/${sha(key)}/${hash}.webp`, sourceKey: `${sha(key)}/${hash}.webp`, sha256: hash, width, height: width / 2, bytes: 12 }
  }
  source.editorial.media = Object.fromEntries([[selected.cover, 'cover'], [second.cover, 'cover'], [illustration, 'body']]
    .map(([use, kind]) => [newsMediaUseKey(use, kind), [variant(use.assetId, 360), variant(use.assetId, 720)]]))
  const catalog = new SiteCatalogService({}).renderSource(source)
  const assets = Object.fromEntries(Object.values(source.editorial.media).flat().map((value, i) => [value.src, `https://fixture.test/image-${i}.webp`]))
  const options = previewRouteOptions(catalog)
  for (const path of ['/news', '/news/page/2', '/news/story-0', '/news/category/equipment']) {
    assert.ok(options.some(option => option.path === path))
    const route = catalog.routes.find(route => route.path === path)
    const view = news.newsView(catalog.editorial, route)
    const asset = path => assets[path] ?? `https://${catalog.site.domain}${path}`
    const original = view.kind === 'article' ? renderNewsArticle(view, { asset }) : renderNewsList(view, { asset })
    const expectedBody = original.replace(/\shref="[^"]*"/g, ' aria-disabled="true"')
    const document = buildWorkingPreviewDocument(catalog, path, 'body{}', assets)
    assert.equal(buildWorkingPreviewDocument(workingPreviewPage(catalog, path), path, 'body{}', assets), document)
    assert.ok(document.includes(`<main>${expectedBody}</main>`), path)
    assert.match(document, /data-site-header/)
    assert.match(document, /data-general-home-footer/)
    assert.match(document, /default-src 'none'/)
    assert.doesNotMatch(document, /\shref=|<script/)
    if (route.kind === 'NEWS_ARTICLE') {
      assert.match(document, /srcset="https:\/\/fixture\.test\/image-0\.webp 360w, https:\/\/fixture\.test\/image-1\.webp 720w"/)
      assert.match(document, /alt="Иллюстрация"/)
    }
  }
  assert.equal(buildWorkingPreviewDocument(catalog, '/', '', {}), buildPreviewDocument(catalog, '/'))
  assert.throws(() => buildWorkingPreviewDocument(catalog, '/news/missing', '', {}), /отсутствует в рабочем Release 1 inventory/)
})

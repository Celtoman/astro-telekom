import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { setTimeout } from 'node:timers/promises'
import { AsyncLocalStorage } from 'node:async_hooks'

const require = createRequire(new URL('../package.json', import.meta.url))
const { SeoTemplateService } = require('./apps/api/dist/seo-template.service.js')
const root = resolve(fileURLToPath(new URL('../apps/admin/dist/', import.meta.url)))
const port = 43055
const netDelay = Number(process.env.SEO_FIXTURE_NET_MS ?? 120)
const renderDelay = Number(process.env.SEO_FIXTURE_WORK_MS ?? 180)
delete process.env.REBUILD_PROVIDER
const site = {
  id: 'site-1', slug: 'fixture', name: 'Тестовый сайт', domain: 'partner.example.test',
  status: 'PUBLISHED', workingRevision: 8, publishedRevision: 7,
}
const routes = []
const seoByPath = {}
for (let city = 1; city <= 207; city++) {
  const citySlug = 'city-' + String(city).padStart(3, '0')
  for (let tariff = 1; tariff <= 20; tariff++) {
    const path = '/' + citySlug + '/tariff-' + tariff
    routes.push({ id:'CITY_TARIFF_DETAIL', path })
    seoByPath[path] = { title:'Тариф ' + path, description:'Описание ' + path, canonical:'https://partner.example.test' + path,
      indexState: city % 17 ? 'INDEX' : 'NOINDEX', ogTitle:'Тариф ' + path, ogDescription:'Описание ' + path }
  }
}
const catalog = { routes, seoByPath, seoWarnings: [{ path: routes[51].path, code:'TITLE_LENGTH', length: 71 }] }
const templates = [{ id:'fixture-template', kind:'CITY_TARIFF_DETAIL', titleTemplate:'Тариф {{tariff.name}}', descriptionTemplate:'Описание {{tariff.name}}', indexState:'INDEX' }]
const state = new AsyncLocalStorage()
const prisma = {
  site: { findUnique: async () => ({ ...site }) },
  seoTemplate: { findMany: async () => templates },
  $queryRaw: async query => {
    const path = query.values.find(value => typeof value === 'string' && value.startsWith('/'))
    state.getStore().projections++
    return [{ id:'pub-7', catalogGeneration:1, metadata:seoByPath[path] ?? null }]
  },
  $transaction: async callback => callback(prisma),
}
const publications = {
  getWorkingPreview: async () => {
    const context = state.getStore()
    const started = performance.now()
    context.renders++
    await setTimeout(renderDelay)
    const data = JSON.parse(JSON.stringify(catalog))
    context.workingMs += performance.now() - started
    return { workingRevision: site.workingRevision, catalog: data }
  },
  getPublishedSnapshot: async () => {
    state.getStore().fullPublished++
    return { id:'pub-7', catalog: JSON.parse(JSON.stringify(catalog)) }
  },
}
const service = new SeoTemplateService(prisma, publications)
const html = Buffer.from(`<!doctype html>
<html lang="ru"><meta charset="utf-8"><title>Замер отчёта SEO</title>
<h1>Замер отчёта SEO</h1>
<p>30 пар · API ${netDelay} мс · рабочий расчёт ${renderDelay} мс + копирование каталога</p>
<button type="button" id="run">Запустить 30 пар</button>
<p id="status" role="status">Готов к запуску.</p>
<pre id="result"></pre><div id="workspace"></div>
<script src="/seo-review-benchmark.js?v=2" defer></script></html>`)
const benchmarkPath = new URL('./fixtures/seo-route-review-benchmark.js', import.meta.url)
const api='/api/v1'
const sitePath=api + '/admin/sites/' + site.id
const seo=sitePath + '/seo-templates'
const mime={ '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript',
  '.json':'application/json', '.svg':'image/svg+xml', '.woff2':'font/woff2' }

const server = createServer((request, response) => state.run({ renders:0, projections:0, fullPublished:0, workingMs:0 }, async () => {
  const { pathname, searchParams: q } = new URL(request.url, 'http://127.0.0.1')
  const mode = new URL(request.headers.referer ?? 'http://127.0.0.1').searchParams.has('compat') ? 'compat' : 'review'
  const ctx = state.getStore()
  const send = (status, data) => {
    const raw = Buffer.from(JSON.stringify(data))
    const zipped = /\bgzip\b/.test(request.headers['accept-encoding'] ?? '')
    const body = zipped ? gzipSync(raw) : raw
    response.writeHead(status, { 'Content-Type':mime['.json'], 'Cache-Control':'private, no-store',
      'Server-Timing':`render;dur=${ctx.workingMs}, renderCount;dur=${ctx.renders}, fullPub;dur=${ctx.fullPublished}, projectedPub;dur=${ctx.projections}`,
      ...(zipped ? { 'Content-Encoding':'gzip' } : {}), 'Content-Length':body.length })
    response.end(body)
    if (pathname === seo + '/review') console.log(JSON.stringify({
      mode, page:Number(q.get('page')), detail:q.has('path'), status, raw:raw.length, gzip:body.length, ...ctx,
    }))
  }
  try {
    if (request.method === 'POST' && pathname === '/fixture/revision') {
      let body = ''
      for await (const chunk of request) body += chunk
      if (body !== '8' && body !== '9') return send(400, {message:'Fixture revision must be 8 or 9'})
      site.workingRevision = Number(body)
      return send(200, { revision:site.workingRevision })
    }
    if (request.method !== 'GET') return send(405, {message:'Read-only API fixture'})
    if (pathname.startsWith(api + '/')) {
      if (netDelay) await setTimeout(netDelay)
      if (pathname === api + '/auth/me') return send(200, {user:{ id:'fixture-admin', email:'fixture@example.invalid' }})
      if (pathname === api + '/admin/sites') return send(200,[site])
      if (pathname === sitePath + '/publication-state') return send(200,{ workingRevision:site.workingRevision, publishedRevision:7, hasUnpublishedChanges:true })
      if (pathname === seo + '/settings') return send(200,await service.getSettings(site.id))
      if (pathname === seo + '/review') {
        const get = name => q.get(name) ?? undefined
        return send(200, await service.review(site.id, { workingRevision:Number(q.get('workingRevision')), page:Number(q.get('page')),
          kind:get('kind'), path:get('path'), publishedPublicationId:get('publishedPublicationId'),
          startReview:mode === 'review' && get('startReview') === 'true', reviewId:mode === 'review' ? get('reviewId') : undefined }))
      }
      return send(404,{message:'No fixture endpoint'})
    }
    if (pathname === '/seo-review-benchmark' || pathname === '/seo-review-benchmark.js') {
      const isHtml = pathname === '/seo-review-benchmark'
      response.writeHead(200, { 'Content-Type':mime[isHtml ? '.html' : '.js'], 'Cache-Control':'no-store' })
      return response.end(isHtml ? html : await readFile(benchmarkPath))
    }
    if (pathname === '/favicon.ico') { response.writeHead(204); return response.end() }
    const requested=extname(pathname) ? pathname : pathname.replace(/\/$/,'') + '/index.html'
    const path=resolve(root,'.' + requested)
    if (!path.startsWith(root + sep)) return send(404,{message:'Not found'})
    const body=await readFile(path)
    response.writeHead(200,{ 'Content-Type':mime[extname(path)] ?? 'application/octet-stream', 'Content-Length':body.length })
    response.end(body)
  } catch (error) {
    if (!response.headersSent) send(error.getStatus?.() ?? (error.code === 'ENOENT' ? 404 : 500), {message:error.message})
    else response.destroy(error)
  }
}))
server.listen(port, '127.0.0.1', () => console.log('SEO route review fixture http://127.0.0.1:' + port + '/seo-review-benchmark'))

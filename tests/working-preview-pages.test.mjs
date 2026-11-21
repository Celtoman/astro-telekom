import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { buildPreviewDocument, previewRouteOptions } from '../apps/admin/src/lib/preview-document.mjs'

const require = createRequire(import.meta.url)
const api = name => require(`../apps/api/dist/${name}.js`)
const { newsSource } = require('./helpers/news-source.cjs')
const { officialSiteSource } = require('./helpers/official-site-source.cjs')
const { supportPageSource } = require('./helpers/support-page-source.cjs')
const { CityImportService } = api('city-import.service')
const { parseWorkbook } = api('tariff-import.service')
const { SiteCatalogService } = api('site-catalog.service')
const { PublicationWorkflowService } = api('publication-workflow.service')
const { workingPreviewPage } = api('working-preview-model')
const { faqDemoContent } = api('faq-demo')
const { FAQ_SEO } = api('faq-page-model')

function overviewSource() {
  const source = newsSource(36)
  const optional = officialSiteSource()
  source.globalPages.push(...optional.globalPages.filter(page => !source.globalPages.some(item => item.type === page.type)))
  source.seoTemplates.push(...optional.seoTemplates.filter(template => !source.seoTemplates.some(item => item.kind === template.kind)))
  source.globalPages.push({ id: 'faq', cityId: null, type: 'FAQ', slug: 'faq', title: 'Популярные вопросы', status: 'PUBLISHED', blocks: [], content: faqDemoContent() })
  source.seoTemplates.push({ kind: 'FAQ', ...FAQ_SEO })
  return source
}

test('compact preview pages preserve the exact validated shell and selected-page HTML', () => {
  const source = overviewSource()
  const service = new SiteCatalogService({})
  const catalog = service.renderSource(source)
  for (const path of ['/', '/kazan', '/kazan/giga-300-tv', '/kazan/proverka-podklyucheniya-k-domru-po-adresu', '/faq',
    '/lichnyy-kabinet-dom-ru', '/official-site-domru', '/karta-pokrytiya-provaydera', '/goroda-obsluzhivaniya', '/politika-konfidencialnosti']) {
    const scoped = workingPreviewPage(catalog, path)
    assert.equal(buildPreviewDocument(scoped, path), buildPreviewDocument(catalog, path), path)
    assert.ok(scoped.routes.length < catalog.routes.length)
  }
  const tariff = workingPreviewPage(catalog, '/kazan/giga-300-tv')
  assert.equal(tariff.cities.find(city => city.slug === 'kazan').tariffs.length, 4)
  assert.match(buildPreviewDocument(tariff, '/kazan/giga-300-tv'), /data-tariff-block="configurator"/)
  const faq = workingPreviewPage(catalog, '/faq')
  assert.deepEqual(faq.globalPages.map(page => page.type), ['FAQ'])
  assert.equal(faq.cities.some(city => city.tariffs), false)
  assert.throws(() => workingPreviewPage(catalog, '/not-in-inventory'), error => error.getStatus() === 404)
  const cityless = service.renderSource({ ...source, cities: [] })
  assert.equal(buildPreviewDocument(workingPreviewPage(cityless, '/goroda-obsluzhivaniya'), '/goroda-obsluzhivaniya'),
    buildPreviewDocument(cityless, '/goroda-obsluzhivaniya'))
  const supportCatalog = service.renderSource(supportPageSource())
  for (const path of ['/kazan/tehpodderzhka', '/proverit-skorost-interneta']) {
    assert.equal(buildPreviewDocument(workingPreviewPage(supportCatalog, path), path), buildPreviewDocument(supportCatalog, path))
    assert.ok(previewRouteOptions(supportCatalog).some(item => item.path === path))
    assert.ok(!previewRouteOptions(catalog).some(item => item.path === path))
  }
})

test('preview options expose every canonical city route through pages and exact URL search', async () => {
  const source = overviewSource()
  const { id } = source.site
  const rows = await parseWorkbook(readFileSync('data/imports/cities.xlsx'), 'cities.xlsx')
  const report = await new CityImportService({ site: { findUnique: async () => ({ id }) }, city: { findMany: async () => [] } }).validateRows(id, 'cities.xlsx', rows)
  assert.equal(report.validRows, 207)
  const sample = source.cities[0]
  source.cities = report.candidates.map(({ name, namePrepositional, slug, subject }) => ({
    ...sample, id: `city-${slug}`, slug, name, namePrepositional, region: { name: subject, slug: subject },
    pages: sample.pages.map(page => ({ ...page, id: `${slug}-${page.id}` })),
    tariffs: Array.from({ length: 19 }, (_, index) => ({ ...sample.tariffs[index % sample.tariffs.length],
      id: `tariff-${slug}-${index}`, slug: `giga-${index}`, name: `Тариф ${index + 1}` })),
  }))
  const site = { ...source.site, workingRevision: 7, publishedRevision: 6 }
  const tx = {
    site: { findUnique: async () => site },
    city: { findMany: async () => source.cities },
    page: { findMany: async () => source.globalPages },
    pageTemplate: { findMany: async () => source.pageTemplates },
    sitePublication: { findFirst: async ({ where }) => where.siteId === id
      ? { id: 'serving-fixture', siteId: id, validationId: 'validation-fixture' } : null },
    $queryRaw: async () => [{ editorial: source.editorial }],
  }
  const catalog = new SiteCatalogService(tx)
  const preview = await catalog.previewInventory(id, tx)
  const full = previewRouteOptions(catalog.renderSource(source))
  assert.deepEqual(preview.options, full)
  assert.equal(full.filter(route => route.kind === 'CITY_HOME').length, 207)
  assert.equal(full.filter(route => route.kind === 'CITY_ADDRESS_CHECK').length, 207)
  assert.equal(full.filter(route => route.kind === 'CITY_TARIFF_DETAIL').length, 3933)
  const workflow = new PublicationWorkflowService({ $transaction: fn => fn(tx) }, { previewInventory: async () => preview })
  const first = await workflow.getWorkingPreviewOptions(id, { page: 1, preferred: '/kazan' })
  assert.equal(first.items.length, 50)
  assert.equal(first.selected.path, '/kazan')
  assert.equal(first.basePublicationId, 'serving-fixture')
  assert.ok(Buffer.byteLength(JSON.stringify(first)) < 16_000)
  const pages = await Promise.all(Array.from({ length: Math.ceil(first.total / first.pageSize) }, (_, index) =>
    workflow.getWorkingPreviewOptions(id, { page: index + 1 })))
  assert.deepEqual(pages.flatMap(result => result.items), full)
  const search = await workflow.getWorkingPreviewOptions(id, { page: 1, search: '/kazan/giga-18' })
  assert.deepEqual(search.items.map(item => item.path), ['/kazan/giga-18'])
  const empty = await workflow.getWorkingPreviewOptions(id, { page: 1, search: 'ни-одного-совпадения', preferred: '/faq' })
  assert.deepEqual(empty.items, [])
  assert.equal(empty.selected.path, '/faq')
})

test('selected page refuses a changed revision or editorial base and retains errors in unrelated working data', async () => {
  const source = overviewSource()
  const site = { id: source.site.id, workingRevision: 4, publishedRevision: 3 }
  const prisma = { $transaction: fn => fn({ site: { findUnique: async () => site } }) }
  const catalog = new SiteCatalogService({})
  let captures = 0
  const captureOptions = []
  catalog.captureSourceBySiteId = async (_siteId, _transaction, options) => {
    captures++
    captureOptions.push(options)
    return { ...source, publicationBaseId: 'baseline-a' }
  }
  catalog.listBySiteId = async () => catalog.renderSource(source)
  const service = new PublicationWorkflowService(prisma, catalog)
  await assert.rejects(service.getWorkingPreviewPage(site.id, '/faq', 3, 'baseline-a'), error => error.getStatus() === 409)
  assert.equal(captures, 0)
  await assert.rejects(service.getWorkingPreviewPage(site.id, '/faq', 4, 'baseline-b'), error => error.getStatus() === 409)
  const selected = await service.getWorkingPreviewPage(site.id, '/faq', 4, 'baseline-a')
  assert.equal(selected.path, '/faq')
  assert.equal(selected.publishedRevision, 3)
  const home = await service.getWorkingPreviewPage(site.id, '/', 4, 'baseline-a')
  assert.equal(home.path, '/')
  assert.deepEqual(captureOptions, [{}, {}, { compactHomeTariffDescriptions: true }])
  source.cities[0].pages[0].slug = 'broken-other-city-home'
  const exactError = /должна иметь пустой slug/
  await assert.rejects(service.getWorkingPreview(site.id), exactError)
  await assert.rejects(service.getWorkingPreviewPage(site.id, '/faq', 4, 'baseline-a'), exactError)
})

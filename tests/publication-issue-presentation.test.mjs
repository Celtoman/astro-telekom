import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicationIssuePresentation } from '../apps/admin/src/lib/publication-issue-presentation.mjs'

test('collection issue names the actual field and deep-links to the same site editor', () => {
  const view = publicationIssuePresentation({ template: 'CITY_HOME', block: 'tariff_grid', field: 'text', code: 'TARIFF_COLLECTION_NOT_READY', path: '/{city}' }, 'site & one')
  assert.equal(view.heading, 'Главная города · Тарифы города')
  assert.equal(view.field, 'Описание')
  const url = new URL(view.href, 'https://admin.test')
  assert.equal(url.pathname, '/templates/tariffs')
  assert.equal(url.searchParams.get('siteId'), 'site & one')
  assert.equal(url.searchParams.get('field'), 'text')
  assert.equal(view.showPath, false)
})

test('first-screen links preserve kind; tariff links use real entity ids, never route guesses', () => {
  const home = publicationIssuePresentation({ template: 'HOME', block: 'home.hero', field: 'image', code: 'FIRST_SCREEN_NOT_READY', path: '/' }, 'site')
  assert.equal(new URL(home.href, 'https://admin.test').searchParams.get('kind'), 'HOME')
  assert.equal(home.field, 'Изображение')
  assert.equal(publicationIssuePresentation({ template: 'CITY_TARIFF_DETAIL', block: 'cinemas', path: '/city/slug' }, 'site').href, null)
  assert.equal(publicationIssuePresentation({ template: 'CITY_TARIFF_DETAIL', block: 'cinemas', entityId: 'id/one' }, 'site').href, '/tariffs/edit?id=id%2Fone')
})

test('system and historical errors do not blame an invented block or root page', () => {
  const system = publicationIssuePresentation({ code: 'CATALOG_RENDER', path: '/', message: 'Поле text' }, 'site')
  assert.equal(system.heading, 'Не удалось проверить сборку сайта')
  assert.equal(system.field, null)
  assert.equal(system.href, null)
  assert.equal(system.showPath, false)
  const old = publicationIssuePresentation({ code: 'PAGE_BLOCKS', path: '/city', message: 'Поле text' }, 'site')
  assert.equal(old.field, null)
  assert.match(old.action, /Источник не уточнён/)
})

test('service data issues identify the data owner without inventing a public URL or editor', () => {
  const view = publicationIssuePresentation({ context: 'SERVICE_DATA', pageType: 'INTERNET', block: 'tariff_grid', field: 'limit', path: '/kazan' }, 'site')
  assert.match(view.heading, /Служебные данные города · Интернет/)
  assert.equal(view.field, 'Число карточек')
  assert.equal(view.href, null)
  assert.match(view.action, /менять блок «Тарифы города» не требуется/)
})

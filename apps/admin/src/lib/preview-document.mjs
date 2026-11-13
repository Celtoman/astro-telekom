import { renderOfficialSiteIntro,renderOfficialSiteBody } from '../../../web/src/lib/official-site-render.ts'
import { renderAccountIntro, renderAccountBody } from '../../../web/src/lib/account-page-render.ts'
import { renderAddressOnlyPreview } from '../../../web/src/lib/address-only-render.ts'
import { renderAddressIntro, renderAddressResults, renderAddressTariffs } from '../../../web/src/lib/address-page-render.ts'
import { renderTariffCollection, projectCityHomeBlocks, sortCollectionTariffs } from '../../../api/src/tariff-collection-model.ts'
import { tariffView, publishedTariffFacts } from '../../../api/src/tariff-view.ts'
import { renderCityComparison, renderRegionalCities, renderCityContacts, projectBenefitFacts } from '../../../web/src/lib/city-home-render.ts'
import { publicDisplayForCatalog } from '../../../web/src/lib/public-display.ts'
import { heroFacts } from '../../../web/src/data/hero-facts.ts'
import { legalSections } from '../../../web/src/data/legal-pages.ts'
import { renderLegalDocument } from '../../../web/src/lib/legal-document-render.ts'
import { renderCitiesDirectory } from '../../../web/src/lib/cities-directory-render.ts'
import { parseRedTitle } from '../../../api/src/home-hero-model.ts'
import { generalHomeCatalog, generalHomeBlock } from '../../../web/src/data/general-home.ts'
import { renderProviderAbout, renderBenefits, renderConnectionSteps, renderMovix, renderMorePossibilities, renderConnectionHelp, renderCityDirectory, renderHomeFaq, renderAddressEntry } from '../../../web/src/lib/general-home-render.ts'
import { renderHomeHeader, renderHomeFooter } from '../../../web/src/lib/general-home-shell.ts'
import { publishedMoscow } from '../../../web/src/lib/city-context.mjs'

const list = value => Array.isArray(value) ? value : []
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback
const html = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const wrap = (name, body) => `<div class="preview-${name}">${body}</div>`
const cityBySlug = (catalog, slug) => list(catalog.cities).find(city => city.slug === slug)
const pageByType = (catalog, type) => list(catalog.globalPages).find(page => page.type === type)
// Raw API rows always pass through the same strict model as apps/web. A ready
// TariffView is also accepted by standalone rendering tests and snapshot clients.
const tariffsOf = city => list(city?.tariffs).map(tariff => tariff.pricing ? tariff : tariffView(tariff))
const cityNameIn = city => text(city?.namePrepositional, text(city?.nameIn, text(city?.name)))
const inactiveLink = (label, className = '') => `<a class="${className}" aria-disabled="true">${html(label)}</a>`
const button = (label, className = 'button') => `<button type="button" class="${className}" disabled>${html(label)}</button>`

function routeLabel(catalog, route) {
  const city = cityBySlug(catalog, route.citySlug)
  if (route.kind === 'HOME') return 'Главная сайта'
  if (route.kind === 'CITY_HOME') return city?.name || route.citySlug
  if (route.kind === 'CITY_ADDRESS_CHECK') return `Проверка подключения — ${city?.name || route.citySlug}`
  if (route.kind === 'CITY_TARIFF_DETAIL') return `${list(city?.tariffs).find(tariff => tariff.slug === route.tariffSlug)?.name || route.tariffSlug} — ${city?.name || route.citySlug}`
  return pageByType(catalog, route.pageType)?.title || route.pageType || route.path
}
export function previewRouteOptions(catalog) {
  return list(catalog?.routes).map(route => ({ path: String(route.path || ''), kind: String(route.kind || ''), label: routeLabel(catalog, route) }))
}
function asset(catalog, path) {
  if (catalog.previewAssets?.[path]) return catalog.previewAssets[path]
  if (/^https:\/\//i.test(path)) {
    try { const url = new URL(path); if (!url.username && !url.password) return url.href } catch { /* invalid content URL */ }
    return ''
  }
  const domain = text(catalog.site?.domain)
  return /^\/[\w/.-]+$/.test(path) && /^[a-z0-9.-]+$/i.test(domain) ? `https://${domain}${path}` : ''
}
function image(catalog, path, alt = '', extra = '') {
  const source = asset(catalog, path)
  return source ? `<img src="${html(source)}" alt="${html(alt)}" referrerpolicy="no-referrer" ${extra}>` : ''
}
function addressEntry(catalog, data) {
  return wrap('address', `<div class="address-check-root embedded hero-address"><div class="address-entry"><div><div class="address-form"><label>Адрес</label><div class="address-field">${image(catalog, '/images/figma/map-pin.svg', '', 'class="address-icon" width="20" height="20"')}<input type="text" disabled aria-label="Адрес" placeholder="${html(text(data.addressPlaceholder, 'Введите ваш адрес'))}"></div><p class="address-hint">Начните вводить город и адрес, затем выберите подходящий вариант.</p><button class="button" data-submit disabled>${html(text(data.checkButtonText, 'Проверить'))}</button></div></div></div></div>`)
}
function renderHero(catalog, data, city, variant) {
  const facts = variant === 'city' ? `<dl class="service-facts" aria-label="Параметры опубликованных доступных тарифов">${heroFacts(tariffsOf(city)).map(fact => `<div class="service-fact" data-hero-fact="${fact.id}"><dt><span class="fact-icon"><picture><source media="(min-width: 621px) and (max-width: 1100px)" srcset="${html(asset(catalog, `/images/figma/${fact.icon}.svg`))}">${image(catalog, `/images/figma/${fact.icon}-blue.svg`, '', 'width="22" height="22"')}</picture></span><span class="fact-label">${fact.label}</span></dt><dd>${html(fact.value)}</dd></div>`).join('')}</dl>` : ''
  const chips = ['Бесплатная проверка', 'Точные результаты', 'Поможем с подключением'].map((fallback, index) => ({ label: Array.isArray(data.chips) ? String(data.chips[index]) : fallback, icon: ['shield-check', 'check', 'headphones'][index] }))
  const address = city ? addressEntry(catalog, data) : `<div class="city-first-check">${button(text(data.addressPlaceholder, 'Введите ваш адрес'), 'address-choice')}${button(text(data.checkButtonText, 'Проверить'), 'check-choice')}</div>`
  return wrap('hero', `<section class="home-hero" data-home-hero="${variant}" ${variant === 'city' ? 'data-block-type="hero" data-city-first-screen' : ''}><div class="hero-container"><div class="hero-card"><div class="hero-copy"><h1>${html(data.title)}</h1><p class="hero-body">${html(data.text)}</p>${facts}${address}${variant === 'general' ? `<ul class="info-chips">${chips.map(chip => `<li>${image(catalog, `/images/figma/${chip.icon}.svg`, '', 'width="20" height="20"')}<span>${html(chip.label)}</span></li>`).join('')}</ul>` : inactiveLink(text(data.tariffsCtaText, 'Посмотреть тарифы'), 'tariffs-cta')}</div><figure class="hero-media">${image(catalog, text(data.image, '/images/figma/home-hero.png'), text(data.imageAlt, 'Wi-Fi-роутер, ТВ-приставка и пульт для домашнего подключения'), 'width="1448" height="1086"')}</figure></div></div></section>`)
}
function renderHome(catalog) {
  if (catalog.generalHome) return renderFullGeneralHome(catalog)
  const data = catalog.homeHero || { title: `Подключение домашнего интернета и телевидения ${text(catalog.site?.name, 'Дом.ру')}`, text: 'Укажите адрес, чтобы проверить возможность подключения Дом.ру в вашем доме и узнать о доступных услугах.' }
  if (catalog.homeHeroVersion === '2.0.0') return renderHomeHero1d(catalog, data)
  return renderHero(catalog, data, list(catalog.cities).find(city => city.slug === 'moskva'), 'general')
}
function renderFullGeneralHome(catalog) {
  const home = generalHomeCatalog(catalog.generalHome)
  const options = { interactive: false, asset: path => asset(catalog, path), phone: catalog.site.connectionPhone, callbackWithinMinutes: catalog.site.publicDisplay.callbackWithinMinutes }
  const data = type => generalHomeBlock(home, type)
  const body = `<div data-home-block="home.hero">${renderHomeHero1d(catalog, data('home.hero'))}</div>` + wrap('generalhome', [
    renderAddressEntry(data('home.address_check'), options),
    renderProviderAbout(data('home.provider_about'), options),
    renderBenefits(projectBenefitFacts(data('home.benefits'), catalog.site.publicDisplay, { kind: 'HOME' }), options),
    renderConnectionSteps(data('home.connection_steps'), options),
    renderMovix(data('home.movix'), options),
    renderMorePossibilities(data('home.more_possibilities'), options),
    renderConnectionHelp(data('home.connection_help'), options),
    renderCityDirectory(data('home.city_directory'), catalog.cities, options),
    renderHomeFaq(data('home.faq'), options),
  ].join(''))
  return wrap('generalcomposition', `<div class="general-home-composition" data-general-home-composition data-home-composition-version="${home.version}">${body}</div>`)
}
function renderHomeHero1d(catalog, data) {
  const popular = ['Москва', 'Санкт-Петербург', 'Екатеринбург', 'Иркутск', 'Казань', 'Самара', 'Саратов'].map(name => list(catalog.cities).find(city => city.name === name)).filter(Boolean)
  return wrap('generalhero', `<section class="general-home-hero" data-general-home-hero data-home-hero="city-search"><div class="hero-container"><div class="hero-card"><div class="hero-copy"><h1>${parseRedTitle(data.title).map(part => part.red ? `<span class="title-red">${html(part.text)}</span>` : html(part.text)).join('')}</h1><p class="hero-body">${html(data.text)}</p><div class="city-form"><div class="city-search-row"><div class="city-field-stack"><div class="city-search-field">${image(catalog, '/images/figma/hero1d-desktop-imglocationicon.svg', '', 'width="24" height="24"')}<input type="search" disabled aria-label="Поиск города" placeholder="${html(data.cityPlaceholder)}"></div></div>${button(data.searchButtonText, 'search-button')}</div></div><div class="popular-cities">${[popular.slice(0,4),popular.slice(4)].map((row,index)=>`<div class="popular-row">${row.map(city => `<a class="popular-city" aria-disabled="true"><span class="chip-surface">${html(city.name)}</span></a>`).join('')}${index===1?inactiveLink(data.allCitiesText,'all-cities-link'):''}</div>`).join('')}</div></div><ol class="city-steps">${data.steps.map((step, index) => `<li><div class="icon-circle"><picture><source media="(max-width:620px)" srcset="${html(asset(catalog, `/images/figma/hero1d-mobile-imgicon${index || ''}.svg`))}"><source media="(max-width:1100px)" srcset="${html(asset(catalog, `/images/figma/hero1d-tablet-imgicon${index || ''}.svg`))}">${image(catalog, `/images/figma/hero1d-desktop-imgicon${index || ''}.svg`)}</picture></div><div class="step-copy"><span class="step-number">0${index + 1}</span><h2>${html(step.title)}</h2><p>${html(step.text)}</p></div></li>`).join('')}</ol></div></div></section>`)
}
function renderBlock(block, city) {
  const data = record(block.data), title = html(text(data.title)), items = list(data.items)
  const heading = label => `<div class="section-heading"><span class="section-kicker">${label}</span><h2>${title}</h2></div>`
  const cards = (className, kind) => items.map((item, index) => `<article class="card ${className}"><span class="feature-mark">${kind === 'service' ? '→' : String(index + 1).padStart(2, '0')}</span><h3>${html(item.title)}</h3><p>${html(item.text)}</p>${kind === 'service' && ['INTERNET', 'INTERNET_TV', 'TV'].includes(item.pageType) ? button('Проверить подключение', 'card-link link-button') : ''}</article>`).join('')
  if (block.blockType === 'tariff_grid') {
    return wrap('collection', renderTariffCollection(data, tariffsOf(city), { interactive: false }))
  }
  if (block.blockType === 'service_grid') return items.length ? `<section class="section container" data-block-type="service_grid">${heading('Выберите услугу')}<div class="service-grid">${cards('service-card', 'service')}</div></section>` : ''
  if (block.blockType === 'feature_grid') return `<section class="section feature-section" data-block-type="feature_grid"><div class="container">${heading('Главное')}<div class="feature-grid feature-grid-count-${Math.min(items.length, 4)}">${cards('feature-card')}</div></div></section>`
  if (block.blockType === 'steps') return `<section class="section container" data-block-type="steps">${heading('Простой процесс')}<ol class="steps-grid steps-grid-count-${Math.min(items.length, 4)}">${items.map((item, index) => `<li><span class="step-number">${index + 1}</span><div><h3>${html(item.title)}</h3><p>${html(item.text)}</p></div></li>`).join('')}</ol></section>`
  if (block.blockType === 'faq') return `<section class="section faq-section" data-block-type="faq"><div class="container faq-layout"><div class="section-heading"><span class="section-kicker">Помощь</span><h2>${title}</h2><p>Коротко отвечаем на вопросы о выборе и подключении.</p></div><div class="faq-list">${items.map(item => `<details><summary>${html(item.question)}</summary><p>${html(item.answer)}</p></details>`).join('')}</div></div></section>`
  if (block.blockType === 'rich_text') return `<section class="section container narrow" data-block-type="rich_text"><h2>${title}</h2><p class="lead">${html(data.text)}</p></section>`
  return ''
}
function renderCity(catalog, route) {
  const city = cityBySlug(catalog, route.citySlug)
  const page = list(city?.pages).find(page => page.type === 'HOME' && page.slug === '')
  if (!page) throw new Error('HOME маршрута предпросмотра не найдена')
  const blocks = projectCityHomeBlocks(list(page.blocks)), hero = blocks.find(block => block.blockType === 'hero')
  if (!hero) throw new Error('HOME маршрута предпросмотра не содержит hero')
  if (page.content?.homeCompositionVersion === '3.0.0') {
    const options = { interactive: false, asset: path => asset(catalog, path), phone: catalog.site.connectionPhone, callbackWithinMinutes: catalog.site.publicDisplay.callbackWithinMinutes };
    const tariffs = tariffsOf(city), collection = blocks.find(block => block.blockType === 'tariff_grid');
    const render = block => {
      const data = block.data;
      switch (block.blockType) {
        case 'hero': return renderHero(catalog, data, city, 'city');
        case 'tariff_grid': return wrap('collection', renderTariffCollection(data, tariffs, options));
        case 'city.comparison': return wrap('cityhome', renderCityComparison(data, sortCollectionTariffs(tariffs, collection.data.sort), options));
        case 'city.help': return wrap('generalhome', renderConnectionHelp(data, options));
        case 'city.benefits': return wrap('generalhome', renderBenefits(projectBenefitFacts(data, catalog.site.publicDisplay, { kind: 'CITY_HOME', maxSpeedMbps: publishedTariffFacts(tariffs).maxSpeed }), options));
        case 'city.connection_steps': return wrap('generalhome', renderConnectionSteps(data, options));
        case 'city.movix': return wrap('generalhome', renderMovix(data, options));
        case 'city.regional_cities': { const html = renderRegionalCities(data, city, catalog.cities, options); return html ? wrap('cityhome', html) : ''; }
        case 'city.faq': return data.items.length ? wrap('generalhome', renderHomeFaq(data, options)) : '';
        case 'city.contacts': return wrap('cityhome', renderCityContacts(data, catalog.site, options));
        default: throw new Error(`Неизвестный блок городской страницы: ${block.blockType}`);
      }
    };
    return wrap('citycomposition', `<div class="city-home-composition" data-city-home-composition>${blocks.map(block => { const body = render(block); return body ? `<div data-city-block="${html(block.blockType)}">${body}</div>` : ''; }).join('')}</div>`);
  }
  return renderHero(catalog, record(hero.data), city, 'city') + wrap('blocks', blocks.filter(block => block.blockType !== 'hero').map(block => renderBlock(block, city)).join(''))
}
function renderTariff(catalog, route) {
  const city = cityBySlug(catalog, route.citySlug), tariff = tariffsOf(city).find(item => item.slug === route.tariffSlug)
  if (!tariff) throw new Error('Тариф маршрута предпросмотра не найден')
  const section = (id, label, title, content, soft = false) => `<section class="section ${soft ? 'soft-section' : 'container'}" data-tariff-block="${id}">${soft ? '<div class="container">' : ''}${label ? `<span class="section-kicker">${label}</span>` : ''}<h2>${title}</h2>${content}${soft ? '</div>' : ''}</section>`
  const equipment = tariff.equipment.map(item => `<article class="card" data-equipment-code="${html(item.code)}"><h3>${html(item.title)}</h3><ul class="option-list">${item.options.map(option => `<li><span>${html(option.label)}</span><strong>${html(option.amountLabel)}${option.months ? ` на ${option.months} ${monthWord(option.months)}` : ''}</strong></li>`).join('')}<li><span>Без оборудования</span><strong>${html(item.alternative)}</strong></li></ul></article>`).join('')
  const services = tariff.services.map(service => `<article class="card" data-service-code="${html(service.code)}"><h3>${html(service.title)}</h3><p>${html(service.statusLabel)}</p>${service.monthlyPriceLabel ? `<p><strong>${html(service.monthlyPriceLabel)}</strong></p>` : ''}${service.oneTimeCharges.length ? `<ul class="charge-list">${service.oneTimeCharges.map(item => `<li>${html(item.label)}: <strong>${html(item.amountLabel)}</strong></li>`).join('')}</ul>` : ''}</article>`).join('')
  const related = tariffsOf(city).filter(item => item.slug !== tariff.slug).slice(0, 3)
  const faq = [
    ['Как узнать, доступен ли тариф по моему адресу?', 'Введите город, улицу и дом в форме выше. Техническая доступность проверяется для точного адреса.'],
    ['Какая стоимость будет после заявки?', 'На странице показаны опубликованные условия тарифа. Итоговую стоимость, оборудование и доступные опции подтвердит оператор перед подключением.'],
    ['Можно ли выбрать другой тариф?', `Да. Ниже и на странице города показаны другие опубликованные предложения для ${cityNameIn(city)}.`],
  ]
  return wrap('tariff', `<article class="tariff-detail" data-tariff-detail><div class="container"><nav class="breadcrumbs">${inactiveLink('Главная')}<span>/</span>${inactiveLink(city.name)}<span>/</span><span>${html(tariff.name)}</span></nav><section class="tariff-hero" data-tariff-block="hero"><div class="tariff-copy"><div class="tariff-labels"><span class="service-label">${html(tariff.service)}</span>${tariff.badge ? `<span class="badge">${html(tariff.badge)}</span>` : ''}</div><h1>${html(tariff.name)}</h1>${tariff.subtitle ? `<p class="subtitle">${html(tariff.subtitle)}</p>` : ''}<dl class="tariff-facts">${tariff.baseComponents.map(item => `<div class="${item.included ? '' : 'is-missing'}" data-component="${html(item.code)}"><dt>${html(item.title)}</dt><dd>${html(item.value)}</dd></div>`).join('')}<div><dt>Доступность</dt><dd>${tariff.availability ? 'Проверяется по адресу' : 'Тариф в архиве'}</dd></div></dl></div><aside class="price-panel" aria-label="Стоимость тарифа">${tariff.promoText ? `<span class="promo">${html(tariff.promoText)}</span>` : ''}${tariff.pricing.standardLabel ? `<del class="standard-price">${html(tariff.pricing.standardLabel)}</del>` : ''}<div class="price">${html(tariff.pricing.currentLabel)}</div>${tariff.connection ? `<p>${html(tariff.connection)}</p>` : ''}${button('Подключить')}<small>Окончательные условия и техническую возможность подтвердит оператор.</small></aside></section></div>
    ${tariff.description ? `<section class="section container details-section" data-tariff-block="description"><div><span class="section-kicker">Состав тарифа</span><h2>Что входит</h2></div><p class="details-copy">${html(tariff.description)}</p></section>` : ''}
    ${tariff.cinemas.length ? section('cinemas', '', 'Подписки в тарифе', `<div class="cinema-list">${tariff.cinemas.map(item => `<span class="cinema-chip" data-cinema-code="${html(item.code)}">${html(item.title)}</span>`).join('')}</div>`) : ''}
    ${equipment ? section('equipment', 'Оборудование', 'Варианты для подключения', `<div class="cards">${equipment}</div>`, true) : ''}
    ${tariff.game || services ? section('services', 'Дополнительные возможности', 'Сервисы и игры', `<div class="cards">${tariff.game ? `<article class="card accent-card" data-game-code="${html(tariff.game.code)}"><span class="card-eyebrow">Игровое предложение</span><h3>${html(tariff.game.title)}</h3><p>${html(tariff.game.statusLabel)}</p></article>` : ''}${services}</div>`) : ''}
    ${tariff.pricing.currentAmount !== null ? `<section class="section container" data-tariff-block="configurator"><div class="tariff-configurator"><h2>Соберите свой тариф</h2><p>Дополнительное оборудование и услуги не выбраны по умолчанию.</p>${tariff.equipment.map(item => `<fieldset disabled><legend>${html(item.title)}</legend><select aria-label="${html(item.title)}"><option>У меня свой / не нужно</option>${item.options.map(option => `<option>${html(option.label)} — ${html(option.amountLabel)}</option>`).join('')}</select></fieldset>`).join('')}<p>Расчёт комплектации доступен на сайте. В предпросмотре интерактивные действия отключены.</p></div></section>` : ''}
    <section class="section address-section" data-tariff-block="address"><div class="container address-layout"><div><span class="section-kicker">Проверка подключения</span><h2>Доступен ли тариф по вашему адресу</h2><p>Введите точный адрес. Если подключение возможно, форма предложит оставить номер для оформления заявки.</p></div>${button('Проверить адрес', 'button address-button')}</div></section>
    ${related.length ? section('related', 'Другие варианты', `Похожие тарифы в ${html(cityNameIn(city))}`, `<div class="cards related-cards">${related.map(item => `<article class="card"><span class="service-label">${html(item.service)}</span><h3>${html(item.name)}</h3><p>${html(item.speed)}</p>${item.cardFeature ? `<p>${html(item.cardFeature)}</p>` : ''}<div class="related-price">${html(item.price)}</div>${inactiveLink('Подробнее о тарифе →', 'card-link')}</article>`).join('')}</div>`) : ''}
    <section class="section soft-section" data-tariff-block="faq"><div class="container faq-layout"><div><span class="section-kicker">Вопросы и ответы</span><h2>О тарифе и подключении</h2></div><div class="faq-list">${faq.map(([question, answer]) => `<details><summary>${html(question)}</summary><p>${html(answer)}</p></details>`).join('')}</div></div></section></article>`)
}
function monthWord(count) { const last = count % 10; return count % 100 >= 11 && count % 100 <= 14 ? 'месяцев' : last === 1 ? 'месяц' : last >= 2 && last <= 4 ? 'месяца' : 'месяцев' }
function renderCities(catalog) {
  return wrap('cities', renderCitiesDirectory({ cities: list(catalog.cities), interactive: false, asset: path => asset(catalog, path) }))
}
function renderGlobal(catalog, route) {
  const page = pageByType(catalog, route.pageType)
  if (!page) throw new Error('Общая страница маршрута предпросмотра не найдена')
  if (route.pageType === 'OFFICIAL_SITE') { const options={interactive:false,asset:path=>asset(catalog,path)}; return wrap('officialsite', `<div class="official-page">${renderOfficialSiteIntro(page.content,options)}${renderAddressOnlyPreview(options.asset,{matchRuntime:true})}${renderOfficialSiteBody(page.content,options)}</div>`) }
  if (route.pageType === 'ACCOUNT') { const options = { interactive: false, asset: path => asset(catalog, path) }; return wrap('account', `<div class="account-page">${renderAccountIntro(page.content, catalog.site, options)}${renderAddressOnlyPreview(options.asset)}${renderAccountBody(page.content, catalog.site, options)}</div>`) }
  if (route.pageType === 'CITIES') return renderCities(catalog)
  const coverage = route.pageType === 'COVERAGE', cities = list(catalog.cities)
  const sections = legalSections(route.pageType, text(catalog.site?.domain, 'tv-internet-dom.ru'))
  if (['PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY'].includes(route.pageType)) {
    return wrap('legal', renderLegalDocument({
      title: typeof page.title === 'string' ? page.title : '',
      introduction: !sections.length && typeof page.content?.text === 'string' ? page.content.text : '',
      sections: [...sections, ...list(page.blocks).filter(block => block.blockType === 'rich_text').map(block => ({
        title: typeof block.data?.title === 'string' ? block.data.title : '',
        paragraphs: typeof block.data?.text === 'string' && block.data.text ? [block.data.text] : [],
      }))],
      interactive: false,
      asset: path => asset(catalog, path),
    }))
  }
  return `<section class="hero"><div class="container"><span class="eyebrow">Дом.ру</span><h1>${html(page.title)}</h1>${coverage && page.content?.text ? `<p class="lead">${html(page.content.text)}</p>` : ''}</div></section>` + (coverage ? `<section class="section container"><h2>Проверка подключения по городам</h2>${cities.length ? `<div class="grid">${cities.map(city => `<article class="card"><h3>${html(city.name)}</h3><p>Откройте страницу города и укажите адрес для проверки технической возможности.</p>${button('Проверить адрес →', 'card-link link-button')}</article>`).join('')}</div>` : '<p class="lead">Опубликованных городов пока нет.</p>'}</section>` : `<section class="section container legal-copy">${!sections.length && page.content?.text ? `<p>${html(page.content.text)}</p>` : ''}${sections.map(section => `<section><h2>${html(section.title)}</h2>${section.paragraphs.map(paragraph => `<p>${html(paragraph)}</p>`).join('')}</section>`).join('')}${list(page.blocks).filter(block => block.blockType === 'rich_text').map(block => `<section>${block.data?.title ? `<h2>${html(block.data.title)}</h2>` : ''}${block.data?.text ? `<p>${html(block.data.text)}</p>` : ''}</section>`).join('')}${!sections.length && !page.content?.text && !list(page.blocks).length ? '<p class="lead">Содержание страницы пока не опубликовано.</p>' : ''}</section>`)
}
function renderAddress(catalog, route) {
  const city = cityBySlug(catalog, route.citySlug);
  const page = list(city?.pages).find(page => page.type === 'ADDRESS_CHECK' && route.path === `/${city.slug}/${page.slug}`);
  if (!page) throw new Error('ADDRESS маршрута предпросмотра не найдена');
  const tariffs = tariffsOf(city);
  const options = { interactive: false, asset: path => asset(catalog, path), phone: catalog.site.connectionPhone, callbackWithinMinutes: catalog.site.publicDisplay.callbackWithinMinutes };
  const render = block => {
    const data = block.data;
    switch (block.blockType) {
      case 'address.intro': return renderAddressIntro(data, city, options);
      case 'address.check': return wrap('generalhome', renderAddressEntry(data, options));
      case 'address.results': return renderAddressResults(data, options);
      case 'address.tariffs': return wrap('collection', renderAddressTariffs(data, tariffs, options));
      case 'address.connection_steps': return wrap('generalhome', renderConnectionSteps(data, options));
      case 'address.benefits': return wrap('generalhome', renderBenefits(projectBenefitFacts(data, catalog.site.publicDisplay, { kind: 'CITY_HOME', maxSpeedMbps: publishedTariffFacts(tariffs).maxSpeed }), options));
      case 'address.help': return wrap('generalhome', renderConnectionHelp(data, options));
      case 'address.faq': return data.items.length ? wrap('generalhome', renderHomeFaq(data, { ...options, firstFaqOpen: true })) : '';
      default: throw new Error(`Неизвестный блок ADDRESS: ${block.blockType}`);
    }
  };
  return wrap('addresspage', `<div class="address-page-composition" data-address-page-composition>${list(page.blocks).map(block => { const body = render(block); return body ? `<div data-address-block="${html(block.blockType)}">${body}</div>` : ''; }).join('')}</div>`);
}
export function previewStyleText(publicStyles) {
  return publicStyles.replaceAll('</style', '<\\/style') + '[class^="preview-"]{display:contents}a[aria-disabled],button:disabled{cursor:default}'
}
export function buildPreviewDocument(catalog, routePath, publicStyles = '', assets = {}, override) {
  const published = item => !item.status || item.status === 'PUBLISHED'
  catalog = { ...catalog, previewAssets: assets, globalPages: list(catalog.globalPages).filter(published), cities: list(catalog.cities).filter(published).map(city => ({ ...city, pages: list(city.pages).filter(published), tariffs: list(city.tariffs).filter(published) })) }
  catalog.site = { ...catalog.site, publicDisplay: publicDisplayForCatalog(catalog.site, catalog.generalHome) };
  const route = override ? {kind:'EDITORIAL_PREVIEW',path:routePath} : list(catalog?.routes).find(item => item.path === routePath)
  if (!route) throw new Error('Маршрут отсутствует в рабочем Release 1 inventory')
  // This long illustrated page can exceed the optional font loading window on
  // its first iframe render. Wait for the embedded fonts instead of retaining
  // fallback metrics in the accepted Screens composition.
  if (route.pageType === 'OFFICIAL_SITE') publicStyles = publicStyles.replaceAll('font-display: optional;', 'font-display: swap;')
  const city = route.citySlug ? cityBySlug(catalog, route.citySlug) : null
  const shellOptions = { interactive: false, asset: path => asset(catalog, path), city: city || publishedMoscow(catalog.cities) || undefined }
  let content
  if (override) content = override.body
  else if (route.kind === 'HOME') content = renderHome(catalog)
  else if (route.kind === 'CITY_HOME') content = renderCity(catalog, route)
  else if (route.kind === 'CITY_ADDRESS_CHECK') content = renderAddress(catalog, route)
  else if (route.kind === 'CITY_TARIFF_DETAIL') content = renderTariff(catalog, route)
  else if (route.kind === 'GLOBAL_PAGE') content = renderGlobal(catalog, route)
  else throw new Error('Тип маршрута не поддерживается предпросмотром')
  const assetOrigins = [...new Set(Object.values(assets).filter(value => /^https?:\/\//.test(value)).map(value => new URL(value).origin))].map(html).join(' ')
  return `<!doctype html><html lang="ru" class="full-general-home"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https: ${assetOrigins}; font-src data:"><title>${html(override?.title || routeLabel(catalog, route))} — предпросмотр</title><style>${previewStyleText(publicStyles)}</style></head><body class="general-home-page${route.kind === 'CITY_HOME' && city?.pages?.find(page => page.type === 'HOME' && page.slug === '')?.content?.homeCompositionVersion === '3.0.0' ? ' city-home-page' : ''}">${wrap('homeshell', renderHomeHeader(catalog.site, shellOptions))}<main>${content}</main>${wrap('homeshell', renderHomeFooter(catalog.site, { ...shellOptions, footerProfile: route.pageType === 'OFFICIAL_SITE' ? 'OFFICIAL_SITE' : undefined }))}</body></html>`
}

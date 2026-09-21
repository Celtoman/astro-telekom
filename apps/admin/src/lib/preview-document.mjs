function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function cityBySlug(catalog, slug) {
  return list(catalog.cities).find((city) => city?.slug === slug)
}

function tariffBySlug(city, slug) {
  return list(city?.tariffs).find((tariff) => tariff?.slug === slug)
}

function pageByType(catalog, type) {
  return list(catalog.globalPages).find((page) => page?.type === type)
}

function homePage(city) {
  return list(city?.pages).find((page) => page?.type === "HOME")
}

function routeLabel(catalog, route) {
  if (route.kind === "HOME") return "Главная сайта"
  if (route.kind === "CITY_HOME") {
    return cityBySlug(catalog, route.citySlug)?.name || route.citySlug || "Страница города"
  }
  if (route.kind === "CITY_TARIFF_DETAIL") {
    const city = cityBySlug(catalog, route.citySlug)
    const tariff = tariffBySlug(city, route.tariffSlug)
    return `${tariff?.name || route.tariffSlug || "Тариф"} — ${city?.name || route.citySlug || "город"}`
  }
  if (route.kind === "GLOBAL_PAGE") {
    return pageByType(catalog, route.pageType)?.title || route.pageType || "Общая страница"
  }
  return route.path
}

export function previewRouteOptions(catalog) {
  return list(catalog?.routes).map((route) => ({
    path: String(route.path || ""),
    kind: String(route.kind || ""),
    label: routeLabel(catalog, route),
  }))
}

function card(title, body, extra = "") {
  return `<article class="card">${extra}<h3>${escapeHtml(title)}</h3>${body ? `<p>${escapeHtml(body)}</p>` : ""}</article>`
}

function renderHeader(catalog, city) {
  const siteName = text(catalog.site?.name, "Дом.ру")
  const phone = text(catalog.site?.connectionPhone)
  return `<header class="site-header"><div class="container header-inner"><span class="brand">${escapeHtml(siteName)}</span><nav aria-label="Основная навигация"><span>Тарифы</span><span>Проверка адреса</span><span>Города</span></nav>${phone ? `<span class="header-phone">${escapeHtml(phone)}</span>` : ""}</div></header>`
}

function renderFooter(catalog) {
  return `<footer><div class="container"><strong>${escapeHtml(text(catalog.site?.name, "Дом.ру"))}</strong><p>Сайт партнера. Предпросмотр рабочей версии.</p></div></footer>`
}

function renderSiteHome(catalog) {
  const siteName = text(catalog.site?.name, "Дом.ру")
  const cities = list(catalog.cities).slice(0, 6)
  return `<section class="hero"><div class="container"><span class="kicker">${escapeHtml(siteName)}</span><h1>Домашний интернет и телевидение ${escapeHtml(siteName)}</h1><p class="lead">Выберите город, чтобы посмотреть доступные услуги, тарифы и проверку подключения по адресу.</p><span class="button">Выбрать город</span></div></section><section class="section container"><h2>Популярные города</h2>${cities.length ? `<div class="cards">${cities.map((city) => card(text(city.name, city.slug), "Домашний интернет, телевидение и актуальные предложения.", '<span class="mark">→</span>')).join("")}</div>` : '<p class="empty">Опубликованных городов пока нет.</p>'}</section>`
}

function tariffStats(tariffs) {
  const speeds = tariffs.map((tariff) => tariff.speedMbps).filter((value) => typeof value === "number" && Number.isFinite(value))
  const prices = tariffs.map((tariff) => tariff.priceAmount).filter((value) => typeof value === "number" && Number.isFinite(value))
  return {
    maximumSpeed: speeds.length ? Math.max(...speeds) : null,
    minimumPrice: prices.length ? Math.min(...prices) : null,
  }
}

function renderCityHero(catalog, city, page, hero) {
  const data = record(hero?.data)
  const tariffs = list(city.tariffs)
  const { maximumSpeed, minimumPrice } = tariffStats(tariffs)
  return `<section class="city-first"><div class="container stack"><div class="city-hero"><div class="city-copy"><span class="kicker">${escapeHtml(text(data.eyebrow, `Дом.ру в ${text(city.nameIn, city.name)}`))}</span><h1>${escapeHtml(text(data.title, page?.title || `Домашний интернет в ${text(city.nameIn, city.name)}`))}</h1><p class="lead">${escapeHtml(text(data.text, "Сравните тарифы и проверьте возможность подключения по вашему адресу."))}</p><dl class="proof"><div><dt>Опубликовано</dt><dd>${tariffs.length} тарифов</dd></div><div><dt>Скорость</dt><dd>${maximumSpeed === null ? "Уточняется" : `до ${escapeHtml(maximumSpeed)} Мбит/с`}</dd></div><div><dt>Стоимость</dt><dd>${minimumPrice === null ? "Уточняется" : `от ${escapeHtml(minimumPrice)} ₽/мес.`}</dd></div></dl></div><div class="hero-visual" aria-hidden="true"><span>Wi-Fi</span></div></div><div class="actions"><article class="panel"><span class="kicker">Проверка доступности</span><h2>Проверим возможность подключения по вашему адресу</h2><p>Введите город, улицу и дом. В предпросмотре форма отключена.</p><div class="fake-form"><span>Город, улица, дом</span><b>Проверить адрес</b></div></article><aside class="panel"><span class="kicker">Помощь с выбором</span><h2>Получить консультацию</h2><p>Оператор уточнит условия тарифов и ответит на вопросы.</p><strong class="phone">${escapeHtml(text(catalog.site?.connectionPhone, "Телефон уточняется"))}</strong></aside></div></div></section>`
}

function renderTariffGrid(city) {
  const tariffs = list(city.tariffs)
  return `<section class="section container"><div class="section-heading"><span class="kicker">Доступные варианты</span><h2>Все тарифы Дом.ру</h2></div>${tariffs.length ? `<div class="tariffs">${tariffs.map((tariff) => `<article class="card tariff"><div><span class="muted-label">${escapeHtml(text(tariff.service, "Услуга"))}</span><h3>${escapeHtml(text(tariff.name, tariff.slug))}</h3><p>${escapeHtml(text(tariff.speed, "Условия уточняются"))}</p></div><div><div class="price">${escapeHtml(text(tariff.price, "Цена уточняется"))}</div>${tariff.connection ? `<p>${escapeHtml(tariff.connection)}</p>` : ""}<span class="button block">Проверить подключение</span></div></article>`).join("")}</div>` : '<p class="empty">Опубликованные тарифы пока не добавлены.</p>'}</section>`
}

function renderItemsBlock(block, index) {
  const data = record(block.data)
  const items = list(data.items)
  const title = text(data.title)
  if (block.blockType === "service_grid") {
    return `<section class="section container"><span class="kicker">Выберите услугу</span><h2>${escapeHtml(title)}</h2><div class="cards">${items.map((item) => card(text(item?.title), text(item?.text), '<span class="mark">→</span>')).join("")}</div></section>`
  }
  if (block.blockType === "feature_grid") {
    return `<section class="section ${index % 2 ? "soft" : ""}"><div class="container"><span class="kicker">Главное</span><h2>${escapeHtml(title)}</h2><div class="cards">${items.map((item, itemIndex) => card(text(item?.title), text(item?.text), `<span class="mark">${String(itemIndex + 1).padStart(2, "0")}</span>`)).join("")}</div></div></section>`
  }
  if (block.blockType === "steps") {
    return `<section class="section container"><span class="kicker">Простой процесс</span><h2>${escapeHtml(title)}</h2><ol class="steps">${items.map((item, itemIndex) => `<li><span>${itemIndex + 1}</span><div><h3>${escapeHtml(text(item?.title))}</h3><p>${escapeHtml(text(item?.text))}</p></div></li>`).join("")}</ol></section>`
  }
  if (block.blockType === "faq") {
    return `<section class="section soft"><div class="container faq"><div><span class="kicker">Помощь</span><h2>${escapeHtml(title)}</h2><p>Коротко отвечаем на вопросы о выборе и подключении.</p></div><div>${items.map((item) => `<details><summary>${escapeHtml(text(item?.question))}</summary><p>${escapeHtml(text(item?.answer))}</p></details>`).join("")}</div></div></section>`
  }
  if (block.blockType === "rich_text") {
    return `<section class="section container narrow"><h2>${escapeHtml(title)}</h2><p class="lead">${escapeHtml(text(data.text))}</p></section>`
  }
  return ""
}

function renderCityHome(catalog, route) {
  const city = cityBySlug(catalog, route.citySlug)
  if (!city) throw new Error("Город маршрута предпросмотра не найден")
  const page = homePage(city)
  if (!page) throw new Error("HOME маршрута предпросмотра не найдена")
  const blocks = list(page.blocks)
  const hero = blocks.find((block) => block?.blockType === "hero")
  if (!hero) throw new Error("HOME маршрута предпросмотра не содержит hero")
  return renderCityHero(catalog, city, page, hero) + blocks.filter((block) => block?.blockType !== "hero").map((block, index) => block.blockType === "tariff_grid" ? renderTariffGrid(city) : renderItemsBlock(block, index)).join("")
}

function renderTariffDetail(catalog, route) {
  const city = cityBySlug(catalog, route.citySlug)
  const tariff = tariffBySlug(city, route.tariffSlug)
  if (!city || !tariff) throw new Error("Тариф маршрута предпросмотра не найден")
  const attributes = record(tariff.attributes)
  const subtitle = text(attributes.card_subtitle, text(attributes.promo_feature))
  const description = text(attributes.opisanie_tarifa)
  const related = list(city.tariffs).filter((item) => item?.slug !== tariff.slug).slice(0, 3)
  return `<article class="tariff-detail"><div class="container"><div class="breadcrumbs">Главная / ${escapeHtml(text(city.name, city.slug))} / ${escapeHtml(text(tariff.name, tariff.slug))}</div><section class="tariff-hero"><div class="tariff-copy"><span class="kicker">${escapeHtml(text(tariff.service, "Услуга"))}</span><h1>${escapeHtml(text(tariff.name, tariff.slug))}</h1>${subtitle ? `<p class="lead">${escapeHtml(subtitle)}</p>` : ""}<dl class="proof"><div><dt>Скорость</dt><dd>${escapeHtml(text(tariff.speed, "Уточняется"))}</dd></div><div><dt>Доступность</dt><dd>${tariff.availability === false ? "Временно недоступен" : "Проверяется по адресу"}</dd></div></dl></div><aside class="price-panel">${tariff.promoText ? `<span class="pill">${escapeHtml(tariff.promoText)}</span>` : ""}<div class="price">${escapeHtml(text(tariff.price, "Цена уточняется"))}</div>${tariff.connection ? `<p>${escapeHtml(tariff.connection)}</p>` : ""}<span class="button block">Проверить адрес</span><small>Окончательные условия подтвердит оператор.</small></aside></section></div>${description ? `<section class="section container two-columns"><div><span class="kicker">Состав тарифа</span><h2>Что входит</h2></div><p class="lead">${escapeHtml(description)}</p></section>` : ""}<section class="section soft"><div class="container two-columns"><div><span class="kicker">Проверка подключения</span><h2>Доступен ли тариф по вашему адресу</h2></div><div class="fake-form"><span>Город, улица, дом</span><b>Проверить адрес</b></div></div></section>${related.length ? `<section class="section container"><span class="kicker">Другие варианты</span><h2>Похожие тарифы в ${escapeHtml(text(city.nameIn, city.name))}</h2><div class="cards">${related.map((item) => card(text(item.name, item.slug), `${text(item.speed)} · ${text(item.price)}`)).join("")}</div></section>` : ""}</article>`
}

function renderGlobalPage(catalog, route) {
  const page = pageByType(catalog, route.pageType)
  if (!page) throw new Error("Общая страница маршрута предпросмотра не найдена")
  const content = record(page.content)
  const blocks = list(page.blocks).filter((block) => block?.blockType === "rich_text")
  const title = text(page.title, route.pageType)
  if (route.pageType === "CITIES") {
    return `<section class="hero"><div class="container"><span class="kicker">Дом.ру</span><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(text(content.text, "Выберите город обслуживания."))}</p></div></section><section class="section container"><div class="cards">${list(catalog.cities).map((city) => card(text(city.name, city.slug), "Открыть страницу города")).join("")}</div></section>`
  }
  const coverage = route.pageType === "COVERAGE"
    ? `<section class="section container"><h2>Проверка подключения по городам</h2><div class="cards">${list(catalog.cities).map((city) => card(text(city.name, city.slug), "Укажите адрес для проверки технической возможности.")).join("")}</div></section>`
    : ""
  const copy = [text(content.text), ...blocks.flatMap((block) => {
    const data = record(block.data)
    return [text(data.title), text(data.text)].filter(Boolean)
  })].filter(Boolean)
  return `<section class="hero"><div class="container"><span class="kicker">Дом.ру</span><h1>${escapeHtml(title)}</h1>${coverage && text(content.text) ? `<p class="lead">${escapeHtml(text(content.text))}</p>` : ""}</div></section>${coverage || `<section class="section container narrow legal">${copy.length ? copy.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") : '<p class="empty">Содержание страницы пока не опубликовано.</p>'}</section>`}`
}

const styles = `
  *{box-sizing:border-box}html{font-family:Inter,Arial,sans-serif;color:#18202a;background:#fff}body{margin:0;background:#f6f7f9}.container{width:min(1200px,calc(100% - 32px));margin:0 auto}.site-header{position:sticky;top:0;z-index:5;border-bottom:1px solid #e4e9ef;background:rgba(255,255,255,.96)}.header-inner{display:flex;min-height:72px;align-items:center;gap:28px}.brand{font-size:24px;font-weight:900}.header-inner nav{display:flex;gap:22px;margin-right:auto}.header-inner nav span,.header-phone{font-weight:700}.hero{padding:72px 0;background:#eaf7ff}.hero h1,.city-copy h1,.tariff-copy h1{max-width:820px;margin:14px 0 18px;font-size:clamp(40px,5.5vw,68px);line-height:.98;letter-spacing:-.05em}.kicker{color:#c91f5c;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.lead{max-width:760px;color:#526071;font-size:19px;line-height:1.55}.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;border-radius:14px;padding:11px 20px;color:#fff;background:#c91f5c;font-weight:800}.block{width:100%}.section{padding:64px 0}.section h2,.panel h2{margin:9px 0 26px;font-size:clamp(30px,4vw,46px);line-height:1.08;letter-spacing:-.04em}.soft{background:#edf4fb}.cards,.tariffs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card,.panel,.tariff-copy,.price-panel{border:1px solid #dce5ee;border-radius:24px;padding:26px;background:#fff;box-shadow:0 14px 40px rgba(21,40,66,.07)}.card h3{margin:12px 0 8px;font-size:22px}.card p,.panel p,.faq p,.legal p{color:#526071;line-height:1.55}.mark{display:grid;width:44px;height:44px;place-items:center;border-radius:14px;color:#c91f5c;background:#fde8f0;font-weight:850}.city-first{padding:18px 0 30px}.stack{display:grid;gap:14px}.city-hero{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr);overflow:hidden;border:1px solid #dcecf7;border-radius:30px;background:#eaf7ff}.city-copy{align-self:center;padding:44px}.hero-visual{display:grid;min-height:400px;place-items:center;background:radial-gradient(circle,#ec6b9a 0 22%,#e93c78 23% 38%,#d9f1ff 39%)}.hero-visual span{color:#fff;font-size:48px;font-weight:900}.proof{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:26px 0 0}.proof div{border:1px solid rgba(255,255,255,.85);border-radius:16px;padding:13px;background:rgba(255,255,255,.72)}.proof dt{margin-bottom:5px;color:#697789;font-size:12px;font-weight:700}.proof dd{margin:0;font-weight:850}.actions{display:grid;grid-template-columns:2fr 1fr;gap:14px}.fake-form{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:16px;border:1px solid #cbd5e1;border-radius:14px;padding:8px 8px 8px 18px;color:#697789;background:#fff}.fake-form b{border-radius:10px;padding:11px 15px;color:#fff;background:#c91f5c}.phone{display:block;margin-top:28px;font-size:26px}.tariff{display:flex;min-height:330px;flex-direction:column;justify-content:space-between}.muted-label,.breadcrumbs{color:#697789;font-size:14px}.price{margin:24px 0 10px;font-size:32px;font-weight:900}.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:0;list-style:none}.steps li{display:flex;gap:14px;border-top:2px solid #dbe3ec;padding-top:18px}.steps li>span{display:grid;flex:0 0 42px;height:42px;place-items:center;border-radius:50%;color:#fff;background:#18202a;font-weight:800}.steps h3{margin:8px 0}.steps p{margin:0;color:#526071}.faq{display:grid;grid-template-columns:.7fr 1.3fr;gap:50px}.faq details{margin-bottom:10px;border:1px solid #dce5ee;border-radius:18px;padding:0 20px;background:#fff}.faq summary{padding:20px 28px 20px 0;font-size:18px;font-weight:750}.faq p{padding-bottom:18px}.breadcrumbs{padding:22px 0 4px}.tariff-hero{display:grid;grid-template-columns:1.4fr .6fr;gap:18px;padding:18px 0 34px}.tariff-copy{padding:48px;background:#eaf7ff}.price-panel{display:flex;flex-direction:column;justify-content:center}.price-panel small{margin-top:14px;color:#697789;line-height:1.4}.pill{display:inline-flex;border-radius:999px;padding:7px 11px;color:#8d1744;background:#fde8f0;font-size:13px;font-weight:800}.two-columns{display:grid;grid-template-columns:.7fr 1.3fr;gap:50px}.narrow{max-width:880px}.legal p{font-size:18px;line-height:1.7;white-space:pre-line}.empty{border:1px dashed #cbd5e1;border-radius:16px;padding:24px;color:#526071}footer{padding:40px 0;color:#526071;background:#18202a}footer strong{color:#fff}
  @media(max-width:900px){.header-inner nav{display:none}.city-hero,.tariff-hero,.two-columns,.faq{grid-template-columns:1fr}.hero-visual{min-height:320px}.actions{grid-template-columns:1fr}.cards,.tariffs{grid-template-columns:repeat(2,minmax(0,1fr))}.proof{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:620px){.container{width:min(100% - 20px,1200px)}.header-inner{min-height:62px}.header-phone{display:none}.hero{padding:50px 0}.hero h1,.city-copy h1,.tariff-copy h1{font-size:42px}.city-copy,.tariff-copy,.price-panel{padding:24px 20px}.hero-visual{min-height:250px}.proof,.cards,.tariffs,.steps{grid-template-columns:1fr}.section{padding:48px 0}.fake-form{align-items:stretch;flex-direction:column}.faq{gap:20px}}
`

export function buildPreviewDocument(catalog, routePath) {
  const route = list(catalog?.routes).find((candidate) => candidate?.path === routePath)
  if (!route) throw new Error("Маршрут отсутствует в рабочем Release 1 inventory")
  const city = route.citySlug ? cityBySlug(catalog, route.citySlug) : null
  let content
  if (route.kind === "HOME") content = renderSiteHome(catalog)
  else if (route.kind === "CITY_HOME") content = renderCityHome(catalog, route)
  else if (route.kind === "CITY_TARIFF_DETAIL") content = renderTariffDetail(catalog, route)
  else if (route.kind === "GLOBAL_PAGE") content = renderGlobalPage(catalog, route)
  else throw new Error("Тип маршрута не поддерживается предпросмотром")
  const title = `${routeLabel(catalog, route)} — предпросмотр`
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>${renderHeader(catalog, city)}<main>${content}</main>${renderFooter(catalog)}</body></html>`
}

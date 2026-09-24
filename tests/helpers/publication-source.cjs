const globalPages = [
  ['COVERAGE', 'karta-pokrytiya-provaydera'],
  ['CITIES', 'goroda-obsluzhivaniya'],
  ['PRIVACY', 'politika-konfidencialnosti'],
  ['PERSONAL_DATA_CONSENT', 'soglasie-na-obrabotku-personalnyh-dannyh'],
  ['COOKIE_POLICY', 'politika-obrabotki-faylov-kuki'],
];

function cityHome(id) {
  return {
    id: `home-${id}`, type: 'HOME', slug: '', title: 'Домашний интернет', content: {}, seo: {},
    blocks: [
      { id: `${id}-hero`, blockType: 'hero', position: 10, visible: true, data: { title: 'Домашний интернет', text: 'Проверьте подключение.' } },
      { id: `${id}-services`, blockType: 'service_grid', position: 20, visible: true, data: { title: 'Услуги', items: [{ pageType: 'INTERNET', title: 'Интернет', text: 'Тарифы для дома.' }] } },
      { id: `${id}-tariffs`, blockType: 'tariff_grid', position: 30, visible: true, data: { title: 'Тарифы', serviceType: 'INTERNET', limit: 6 } },
      { id: `${id}-steps`, blockType: 'steps', position: 40, visible: true, data: { title: 'Подключение', items: [{ title: 'Проверка', text: 'Укажите адрес.' }, { title: 'Заявка', text: 'Оставьте заявку.' }] } },
      { id: `${id}-equipment`, blockType: 'feature_grid', position: 50, visible: true, data: { title: 'Оборудование', items: [{ title: 'Wi-Fi', text: 'Уточните условия.' }] } },
      { id: `${id}-benefits`, blockType: 'feature_grid', position: 60, visible: true, data: { title: 'Преимущества', items: [{ title: 'Проверка', text: 'До заявки.' }] } },
      { id: `${id}-faq`, blockType: 'faq', position: 70, visible: true, data: { title: 'Вопросы', items: [{ question: 'Как подключиться?', answer: 'Оставьте заявку.' }] } },
    ],
  };
}

function city(slug, tariffs = []) {
  return {
    id: `city-${slug}`, name: slug, namePrepositional: slug, slug, content: {}, seo: {},
    region: { name: 'Регион', slug: 'region' },
    pages: [cityHome(slug)],
    tariffs: tariffs.map((tariffSlug) => ({
      id: `tariff-${slug}-${tariffSlug}`, slug: tariffSlug, name: tariffSlug,
      standardPrice: '700', promoPrice: null, connectionFee: null, attributes: {}, seo: {},
    })),
  };
}

function publicationSource(cities = []) {
  return {
    site: {
      id: 'site-1', name: 'Дом.ру', slug: 'domru-site', domain: 'example.test', status: 'PUBLISHED',
      connectionPhone: '78005557244', supportPhone: '78002507777', settings: {},
      provider: { name: 'Дом.ру', settings: {} },
    },
    cities,
    globalPages: globalPages.map(([type, slug]) => ({ id: `page-${type}`, type, slug, title: type, blocks: [], content: {}, seo: {} })),
    redirects: [],
    sitemapExclusions: [],
    seoTemplates: ['HOME', 'CITY_HOME', 'CITY_TARIFF_DETAIL', ...globalPages.map(([type]) => type)]
      .map((kind) => ({
        kind,
        titleTemplate: `Заголовок ${kind}${kind === 'CITY_HOME' ? ' {CITY_NAME}' : kind === 'CITY_TARIFF_DETAIL' ? ' {TARIFF_NAME} {CITY_NAME}' : ''}`,
        descriptionTemplate: `Описание ${kind}`,
        indexState: 'INDEX',
      })),
  };
}

module.exports = { publicationSource, city };

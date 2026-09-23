const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CitiesController } = require('../apps/api/dist/cities.controller.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { buildReleaseOneRoutes } = require('../apps/api/dist/public-route-policy.js');

const releaseOneGlobalPages = [
  { type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera' },
  { type: 'CITIES', slug: 'goroda-obsluzhivaniya' },
  { type: 'PRIVACY', slug: 'politika-konfidencialnosti' },
  { type: 'PERSONAL_DATA_CONSENT', slug: 'soglasie-na-obrabotku-personalnyh-dannyh' },
  { type: 'COOKIE_POLICY', slug: 'politika-obrabotki-faylov-kuki' },
];

const canonicalHome = (id = 'home') => ({
  id,
  slug: '',
  type: 'HOME',
  status: 'PUBLISHED',
  content: {},
  seo: {},
  blocks: [
    { id: `${id}-hero`, blockType: 'hero', position: 10, visible: true, data: { title: 'Домашний интернет', text: 'Проверьте подключение по адресу.' } },
    { id: `${id}-services`, blockType: 'service_grid', position: 20, visible: true, data: { title: 'Услуги', items: [{ pageType: 'INTERNET', title: 'Интернет', text: 'Тарифы для дома.' }] } },
    { id: `${id}-tariffs`, blockType: 'tariff_grid', position: 30, visible: true, data: { title: 'Тарифы', serviceType: 'INTERNET', limit: 6, morePageType: 'INTERNET' } },
    { id: `${id}-steps`, blockType: 'steps', position: 40, visible: true, data: { title: 'Как подключиться', items: [{ title: 'Укажите адрес', text: 'Выберите адрес.' }, { title: 'Подтвердите заявку', text: 'Дождитесь звонка.' }] } },
    { id: `${id}-equipment`, blockType: 'feature_grid', position: 50, visible: true, data: { title: 'Оборудование', items: [{ title: 'Wi-Fi', text: 'Условия уточнит оператор.' }] } },
    { id: `${id}-benefits`, blockType: 'feature_grid', position: 60, visible: true, data: { title: 'Преимущества', items: [{ title: 'Проверка адреса', text: 'До оформления заявки.' }] } },
    { id: `${id}-faq`, blockType: 'faq', position: 70, visible: true, data: { title: 'Вопросы и ответы', items: [{ question: 'Как подключиться?', answer: 'Оставьте заявку.' }] } },
  ],
});

const controllerFor = (prisma) => {
  const catalog = new SiteCatalogService(prisma);
  return new CitiesController(catalog, {
    getPublishedCatalog: (siteSlug) => catalog.list(siteSlug),
    getPublishedCity: (siteSlug, citySlug) => catalog.getCity(siteSlug, citySlug),
  });
};

test('public catalog returns the successful publication snapshot instead of working rows', async () => {
  const snapshot = {
    site: { name: 'Дом.ру', slug: 'domru-site' },
    globalPages: [], routes: [], redirects: [], cities: [{ id: 'city-published', slug: 'kazan' }],
  };
  const controller = new CitiesController(
    { getCity: async () => assert.fail('working city queried'), cityResponse: () => {}, pageResponse: () => {}, effectiveRedirects: () => {} },
    { getPublishedCatalog: async (siteSlug) => {
      assert.equal(siteSlug, 'domru-site');
      return snapshot;
    } },
  );

  assert.equal(await controller.list('domru-site'), snapshot);
});

test('Release 1 route policy rejects missing, extra and colliding route sources', () => {
  assert.throws(() => buildReleaseOneRoutes([{ slug: 'kazan' }], releaseOneGlobalPages.slice(0, 4)), /Не опубликована обязательная/);
  assert.throws(() => buildReleaseOneRoutes([{ slug: 'kazan' }], [...releaseOneGlobalPages, { type: 'FAQ', slug: 'faq' }]), /ровно 5/);
  assert.throws(() => buildReleaseOneRoutes([{ slug: 'goroda-obsluzhivaniya' }], releaseOneGlobalPages), /Конфликт маршрута Release 1/);
  assert.throws(
    () => buildReleaseOneRoutes([{ slug: 'kazan', tariffs: [{ slug: 'giga-500' }, { slug: 'giga-500' }] }], releaseOneGlobalPages),
    /Конфликт маршрута Release 1.*kazan\/giga-500/,
  );
});

test('Release 1 route policy includes a detail URL for every published tariff source', () => {
  const routes = buildReleaseOneRoutes([
    { slug: 'kazan', tariffs: [{ slug: 'giga-500' }, { slug: 'giga-800-tv' }] },
    { slug: 'perm', tariffs: [{ slug: 'giga-300' }] },
  ], releaseOneGlobalPages);

  assert.deepEqual(routes.slice(-5), [
    { id: 'CITY_HOME', kind: 'CITY_HOME', path: '/kazan', citySlug: 'kazan' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: '/kazan/giga-500', citySlug: 'kazan', tariffSlug: 'giga-500' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: '/kazan/giga-800-tv', citySlug: 'kazan', tariffSlug: 'giga-800-tv' },
    { id: 'CITY_HOME', kind: 'CITY_HOME', path: '/perm', citySlug: 'perm' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: '/perm/giga-300', citySlug: 'perm', tariffSlug: 'giga-300' },
  ]);
});

test('public city catalog returns only published entities for one published site', async () => {
  const calls = {};
  const controller = controllerFor({
    site: {
      findFirst: async (query) => {
        calls.site = query;
        return {
          id: 'site-1',
          name: 'Дом.ру',
          slug: 'domru-site',
          domain: 'partner.example.test',
          connectionPhone: '78005553535',
          supportPhone: '78002507777',
          settings: { content: { phone: '8 (800) 555-35-35' } },
          provider: { name: 'Дом.ру', settings: { content: { brand: 'Дом.ру' } } },
        };
      },
    },
    city: {
      findMany: async (query) => {
        calls.cities = query;
        return [{
          id: 'city-1',
          siteId: 'site-1',
          regionId: 'region-1',
          name: 'Казань',
          slug: 'kazan',
          namePrepositional: 'Казани',
          status: 'PUBLISHED',
          seo: {},
          content: {},
          region: { name: 'Республика Татарстан', slug: 'tatarstan', content: {} },
          pages: [{
            id: 'page-1', slug: 'internet', type: 'INTERNET', status: 'PUBLISHED', content: {}, seo: {},
            blocks: [{ id: 'block-1', blockType: 'hero', position: 10, visible: true, data: { title: 'Интернет {CITY_NAME_PREPOSITIONAL}', text: 'Проверьте подключение по адресу.' } }],
          }, canonicalHome()],
          tariffs: [{ id: 'tariff-1', slug: 'giga-500', status: 'PUBLISHED', seo: {} }],
        }];
      },
    },
    page: {
      findMany: async (query) => {
        calls.pages = query;
        return [
          { id: 'coverage', siteId: 'site-1', cityId: null, slug: 'karta-pokrytiya-provaydera', type: 'COVERAGE', title: 'Карта покрытия {PROVIDER_NAME}', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] },
          { id: 'cities', siteId: 'site-1', cityId: null, slug: 'goroda-obsluzhivaniya', type: 'CITIES', title: 'Города обслуживания', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] },
          { id: 'privacy', siteId: 'site-1', cityId: null, slug: 'politika-konfidencialnosti', type: 'PRIVACY', title: 'Политика конфиденциальности', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] },
          { id: 'consent', siteId: 'site-1', cityId: null, slug: 'soglasie-na-obrabotku-personalnyh-dannyh', type: 'PERSONAL_DATA_CONSENT', title: 'Согласие', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] },
          { id: 'cookies', siteId: 'site-1', cityId: null, slug: 'politika-obrabotki-faylov-kuki', type: 'COOKIE_POLICY', title: 'Cookie', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] },
        ];
      },
    },
    redirect: {
      findMany: async (query) => {
        calls.redirects = query;
        return [
          { id: 'redirect-1', sourcePath: '/old/', targetPath: '/kazan/', status: 'PUBLISHED' },
          { id: 'redirect-stale', sourcePath: '/stale', targetPath: '/draft-city', status: 'PUBLISHED' },
          { id: 'redirect-occupied', sourcePath: '/kazan', targetPath: '/', status: 'PUBLISHED' },
        ];
      },
    },
    sitemapExclusion: {
      findMany: async (query) => {
        calls.sitemapExclusions = query;
        return [{ path: '/kazan/giga-500', reason: 'Управляемое исключение' }];
      },
    },
  });

  const result = await controller.list('domru-site');

  assert.deepEqual(calls.site.where, { slug: 'domru-site', status: 'PUBLISHED' });
  assert.deepEqual(calls.site.include.provider.select, { name: true, settings: true });
  assert.deepEqual(calls.cities.where, { siteId: 'site-1', status: 'PUBLISHED' });
  assert.deepEqual(calls.cities.include.pages.where, { status: 'PUBLISHED' });
  assert.deepEqual(calls.cities.include.pages.include.blocks.where, { visible: true, archivedAt: null });
  assert.deepEqual(calls.cities.include.pages.include.blocks.orderBy, [{ position: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(calls.cities.include.region.select, { name: true, slug: true });
  assert.deepEqual(calls.cities.include.tariffs.where, { status: 'PUBLISHED', availability: 'ACTIVE' });
  assert.deepEqual(calls.pages.where, { siteId: 'site-1', cityId: null, status: 'PUBLISHED' });
  assert.deepEqual(calls.pages.include.blocks.where, { visible: true, archivedAt: null });
  assert.deepEqual(calls.redirects.where, { siteId: 'site-1', status: 'PUBLISHED' });
  assert.deepEqual(calls.sitemapExclusions.where, { siteId: 'site-1' });
  assert.deepEqual(result.site, { name: 'Дом.ру', slug: 'domru-site', domain: 'partner.example.test', connectionPhone: '+7 (800) 555-35-35', supportPhone: '+7 (800) 250-77-77' });
  assert.equal(result.cities.length, 1);
  assert.equal(result.cities[0].namePrepositional, 'Казани');
  assert.equal('supportPhone' in result.cities[0], false);
  assert.deepEqual(result.cities[0].region, { name: 'Республика Татарстан', slug: 'tatarstan' });
  assert.equal(result.cities[0].pages[0].slug, 'internet');
  assert.equal(result.cities[0].pages[0].blocks[0].blockType, 'hero');
  assert.equal(result.cities[0].pages[0].blocks[0].data.title, 'Интернет Казани');
  assert.equal(result.cities[0].tariffs[0].slug, 'giga-500');
  assert.deepEqual(result.globalPages.map((page) => page.type), ['COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY']);
  assert.equal(result.globalPages[0].title, 'Карта покрытия Дом.ру');
  assert.deepEqual(result.routes.map((route) => route.path), [
    '/',
    '/karta-pokrytiya-provaydera',
    '/goroda-obsluzhivaniya',
    '/politika-konfidencialnosti',
    '/soglasie-na-obrabotku-personalnyh-dannyh',
    '/politika-obrabotki-faylov-kuki',
    '/kazan',
    '/kazan/giga-500',
  ]);
  assert.deepEqual(result.redirects, [{ id: 'redirect-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' }]);
  assert.deepEqual(result.sitemap, { excludedPaths: ['/kazan/giga-500'] });
});

test('public city catalog does not apply removed city or region content and SEO overrides', () => {
  const catalog = new SiteCatalogService({});
  const site = {
    settings: {
      content: {
        hero: { title: 'Заголовок сайта', cta: { label: 'Подключить', href: '/kazan' } },
        cards: ['Карточка сайта'],
      },
    },
    provider: {
      settings: {
        content: {
          hero: { eyebrow: 'Дом.ру', cta: { analyticsId: 'provider-cta' } },
          legalNote: 'Условия провайдера',
        },
      },
    },
  };
  const city = {
    id: 'city-1',
    siteId: 'site-1',
    regionId: 'region-1',
    name: 'Казань',
    slug: 'kazan',
    status: 'PUBLISHED',
    content: { hero: { title: 'Интернет в Казани' } },
    seo: { openGraph: { title: 'Казань', image: '/city.jpg' }, robots: { index: true, follow: true } },
    region: { name: 'Татарстан', slug: 'tatarstan', content: { hero: { cta: { label: 'Проверить адрес' } } } },
    pages: [
      canonicalHome(),
      {
        id: 'internet',
        slug: 'internet',
        type: 'INTERNET',
        status: 'PUBLISHED',
        content: { hero: { cta: { label: 'Выбрать тариф' } }, cards: [] },
        seo: { openGraph: { title: 'Домашний интернет' }, robots: null },
        blocks: [{ id: 'hero', blockType: 'hero', position: 10, visible: true, data: { title: 'Интернет', text: 'Проверьте адрес.' } }],
      },
    ],
    tariffs: [{ id: 'tariff', slug: 'giga-500', status: 'PUBLISHED', seo: { openGraph: { title: 'Гига 500' }, robots: { follow: false } } }],
  };

  const result = catalog.cityResponse(city, site);
  const internet = result.pages.find((page) => page.id === 'internet');

  assert.deepEqual(internet.content, {
    hero: {
      eyebrow: 'Дом.ру',
      title: 'Заголовок сайта',
      cta: { analyticsId: 'provider-cta', label: 'Выбрать тариф', href: '/kazan' },
    },
    legalNote: 'Условия провайдера',
    cards: [],
  });
  assert.deepEqual(internet.seo, {
    openGraph: { title: 'Домашний интернет' },
    robots: null,
  });
  assert.deepEqual(result.tariffs[0].seo, {
    openGraph: { title: 'Гига 500' },
    robots: { follow: false },
  });
});

test('public city catalog fails closed when a stored visible block violates its type contract', () => {
  const controller = controllerFor({});
  const city = {
    id: 'city-1',
    siteId: 'site-1',
    regionId: 'region-1',
    name: 'Казань',
    slug: 'kazan',
    status: 'PUBLISHED',
    content: {},
    seo: {},
    region: { content: {} },
    pages: [canonicalHome(), {
      id: 'page-1',
      slug: 'internet',
      type: 'INTERNET',
      status: 'PUBLISHED',
      content: {},
      seo: {},
      blocks: [{ id: 'legacy-block', blockType: 'hero', position: 10, visible: true, data: { title: 'Неполный hero' } }],
    }],
    tariffs: [],
  };
  const site = { settings: {}, provider: { settings: {} } };

  assert.throws(
    () => controller.cityResponse(city, site),
    error => error.getStatus() === 400 && /text/.test(error.message),
  );
});

test('public city catalog requires exactly one visible hero when a published page uses blocks', () => {
  const controller = controllerFor({});
  const baseCity = {
    id: 'city-1', siteId: 'site-1', regionId: 'region-1', name: 'Казань', slug: 'kazan', status: 'PUBLISHED',
    content: {}, seo: {}, region: { content: {} }, tariffs: [],
  };
  const site = { settings: {}, provider: { settings: {} } };
  const hero = { id: 'hero-1', blockType: 'hero', position: 10, visible: true, data: { title: 'Интернет', text: 'Проверка по адресу.' } };
  const richText = { id: 'text-1', blockType: 'rich_text', position: 20, visible: true, data: { title: 'Условия', text: 'Подробное описание.' } };
  const page = (blocks) => ({ id: 'page-1', slug: 'internet', type: 'INTERNET', status: 'PUBLISHED', content: {}, seo: {}, blocks });

  for (const blocks of [[richText], [hero, { ...hero, id: 'hero-2', position: 20 }]]) {
    assert.throws(
      () => controller.cityResponse({ ...baseCity, pages: [canonicalHome(), page(blocks)] }, site),
      error => error.getStatus() === 400 && /hero/.test(error.message),
    );
  }
});

test('public city catalog rejects a published city HOME without the canonical block sequence', () => {
  const controller = controllerFor({});
  const city = {
    id: 'city-1', siteId: 'site-1', regionId: 'region-1', name: 'Альметьевск', slug: 'almetyevsk', status: 'PUBLISHED',
    content: {}, seo: {}, region: { name: 'Татарстан', slug: 'tatarstan', content: {} }, tariffs: [],
    pages: [{ id: 'page-1', slug: '', type: 'HOME', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] }],
  };
  const site = { settings: {}, provider: { settings: {} } };

  assert.throws(
    () => controller.cityResponse(city, site),
    error => error.getStatus() === 400 && /HOME.*каноническ/i.test(error.message),
  );
});

test('public city catalog rejects duplicate or noncanonical published city HOME pages before rendering', () => {
  const controller = controllerFor({});
  const baseCity = {
    id: 'city-1', siteId: 'site-1', regionId: 'region-1', name: 'Альметьевск', slug: 'almetyevsk', status: 'PUBLISHED',
    content: {}, seo: {}, region: { name: 'Татарстан', slug: 'tatarstan', content: {} }, tariffs: [],
  };
  const site = { settings: {}, provider: { settings: {} } };
  const home = (id, slug) => ({ id, slug, type: 'HOME', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] });

  assert.throws(
    () => controller.cityResponse({ ...baseCity, pages: [home('canonical', ''), home('legacy', 'home')] }, site),
    error => error.getStatus() === 400 && /ровно одна.*HOME/i.test(error.message),
  );
  assert.throws(
    () => controller.cityResponse({ ...baseCity, pages: [home('legacy', 'home')] }, site),
    error => error.getStatus() === 400 && /пустой slug/i.test(error.message),
  );
});

test('public city catalog rejects an unpublished or unknown site', async () => {
  const controller = controllerFor({
    site: { findFirst: async () => null },
    city: { findMany: async () => assert.fail('cities queried for missing site') },
    page: { findMany: async () => assert.fail('pages queried for missing site') },
    redirect: { findMany: async () => assert.fail('redirects queried for missing site') },
  });

  await assert.rejects(controller.list('draft-site'), /Site not found/);
});

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

const controllerFor = (prisma) => {
  const catalog = new SiteCatalogService(prisma);
  return new CitiesController(catalog, {
    getPublishedCatalog: (siteSlug) => catalog.list(siteSlug),
    getPublishedCity: (siteSlug, citySlug) => catalog.getCity(siteSlug, citySlug),
  });
};

test('public catalog returns the successful publication snapshot instead of working rows', async () => {
  const snapshot = {
    site: { name: 'Дом.ру', slug: 'domru-kazan' },
    globalPages: [], routes: [], redirects: [], cities: [{ id: 'city-published', slug: 'kazan' }],
  };
  const controller = new CitiesController(
    { getCity: async () => assert.fail('working city queried'), cityResponse: () => {}, pageResponse: () => {}, effectiveRedirects: () => {} },
    { getPublishedCatalog: async (siteSlug) => {
      assert.equal(siteSlug, 'domru-kazan');
      return snapshot;
    } },
  );

  assert.equal(await controller.list('domru-kazan'), snapshot);
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
          slug: 'domru-kazan',
          domain: 'partner.example.test',
          settings: { content: { phone: '8 (800) 555-35-35' } },
          provider: { settings: { content: { brand: 'Дом.ру' } } },
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
          phone: null,
          supportPhone: '8 (800) 250-77-77',
          seo: {},
          content: {},
          region: { name: 'Республика Татарстан', slug: 'tatarstan', content: {} },
          pages: [{
            id: 'page-1', slug: 'internet', type: 'INTERNET', status: 'PUBLISHED', content: {}, seo: {},
            blocks: [{ id: 'block-1', blockType: 'hero', position: 10, visible: true, data: { title: 'Интернет', text: 'Проверьте подключение по адресу.' } }],
          }],
          tariffs: [{ id: 'tariff-1', slug: 'giga-500', status: 'PUBLISHED', seo: {} }],
        }];
      },
    },
    page: {
      findMany: async (query) => {
        calls.pages = query;
        return [
          { id: 'coverage', siteId: 'site-1', cityId: null, slug: 'karta-pokrytiya-provaydera', type: 'COVERAGE', title: 'Карта покрытия', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] },
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
  });

  const result = await controller.list('domru-kazan');

  assert.deepEqual(calls.site.where, { slug: 'domru-kazan', status: 'PUBLISHED' });
  assert.deepEqual(calls.cities.where, { siteId: 'site-1', status: 'PUBLISHED' });
  assert.deepEqual(calls.cities.include.pages.where, { status: 'PUBLISHED' });
  assert.deepEqual(calls.cities.include.pages.include.blocks.where, { visible: true, archivedAt: null });
  assert.deepEqual(calls.cities.include.pages.include.blocks.orderBy, [{ position: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(calls.cities.include.region.select, { name: true, slug: true, content: true });
  assert.deepEqual(calls.cities.include.tariffs.where, { status: 'PUBLISHED' });
  assert.deepEqual(calls.pages.where, { siteId: 'site-1', cityId: null, status: 'PUBLISHED' });
  assert.deepEqual(calls.pages.include.blocks.where, { visible: true, archivedAt: null });
  assert.deepEqual(calls.redirects.where, { siteId: 'site-1', status: 'PUBLISHED' });
  assert.deepEqual(result.site, { name: 'Дом.ру', slug: 'domru-kazan', domain: 'partner.example.test' });
  assert.equal(result.cities.length, 1);
  assert.equal(result.cities[0].namePrepositional, 'Казани');
  assert.equal(result.cities[0].supportPhone, '8 (800) 250-77-77');
  assert.deepEqual(result.cities[0].region, { name: 'Республика Татарстан', slug: 'tatarstan' });
  assert.equal(result.cities[0].pages[0].slug, 'internet');
  assert.equal(result.cities[0].pages[0].blocks[0].blockType, 'hero');
  assert.equal(result.cities[0].tariffs[0].slug, 'giga-500');
  assert.deepEqual(result.globalPages.map((page) => page.type), ['COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY']);
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
    pages: [{
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
      () => controller.cityResponse({ ...baseCity, pages: [page(blocks)] }, site),
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

test('public city catalog rejects an unpublished or unknown site', async () => {
  const controller = controllerFor({
    site: { findFirst: async () => null },
    city: { findMany: async () => assert.fail('cities queried for missing site') },
    page: { findMany: async () => assert.fail('pages queried for missing site') },
    redirect: { findMany: async () => assert.fail('redirects queried for missing site') },
  });

  await assert.rejects(controller.list('draft-site'), /Site not found/);
});

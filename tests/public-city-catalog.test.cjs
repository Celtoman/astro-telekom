const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CitiesController } = require('../apps/api/dist/cities.controller.js');

test('public city catalog returns only published entities for one published site', async () => {
  const calls = {};
  const controller = new CitiesController({
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
          region: { content: {} },
          pages: [{
            id: 'page-1', slug: 'internet', type: 'INTERNET', status: 'PUBLISHED', content: {}, seo: {},
            blocks: [{ id: 'block-1', blockType: 'hero', position: 10, visible: true, data: { title: 'Интернет', text: 'Проверьте подключение по адресу.' } }],
          }],
          tariffs: [{ id: 'tariff-1', slug: 'giga-500', status: 'PUBLISHED', seo: {} }],
        }];
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
  assert.deepEqual(calls.cities.include.pages.include.blocks.where, { visible: true });
  assert.deepEqual(calls.cities.include.pages.include.blocks.orderBy, [{ position: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(calls.cities.include.tariffs.where, { status: 'PUBLISHED' });
  assert.deepEqual(calls.redirects.where, { siteId: 'site-1', status: 'PUBLISHED' });
  assert.deepEqual(result.site, { name: 'Дом.ру', slug: 'domru-kazan', domain: 'partner.example.test' });
  assert.equal(result.cities.length, 1);
  assert.equal(result.cities[0].namePrepositional, 'Казани');
  assert.equal(result.cities[0].supportPhone, '8 (800) 250-77-77');
  assert.equal(result.cities[0].pages[0].slug, 'internet');
  assert.equal(result.cities[0].pages[0].blocks[0].blockType, 'hero');
  assert.equal(result.cities[0].tariffs[0].slug, 'giga-500');
  assert.deepEqual(result.redirects, [{ id: 'redirect-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' }]);
});

test('public city catalog fails closed when a stored visible block violates its type contract', () => {
  const controller = new CitiesController({});
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
  const controller = new CitiesController({});
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

test('public city catalog rejects an unpublished or unknown site', async () => {
  const controller = new CitiesController({
    site: { findFirst: async () => null },
    city: { findMany: async () => assert.fail('cities queried for missing site') },
    redirect: { findMany: async () => assert.fail('redirects queried for missing site') },
  });

  await assert.rejects(controller.list('draft-site'), /Site not found/);
});

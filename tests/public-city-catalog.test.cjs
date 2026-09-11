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
          seo: {},
          content: {},
          region: { content: {} },
          pages: [{ id: 'page-1', slug: 'internet', type: 'INTERNET', status: 'PUBLISHED', content: {}, seo: {}, blocks: [] }],
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
  assert.deepEqual(calls.cities.include.tariffs.where, { status: 'PUBLISHED' });
  assert.deepEqual(calls.redirects.where, { siteId: 'site-1', status: 'PUBLISHED' });
  assert.deepEqual(result.site, { name: 'Дом.ру', slug: 'domru-kazan', domain: 'partner.example.test' });
  assert.equal(result.cities.length, 1);
  assert.equal(result.cities[0].namePrepositional, 'Казани');
  assert.equal(result.cities[0].pages[0].slug, 'internet');
  assert.equal(result.cities[0].tariffs[0].slug, 'giga-500');
  assert.deepEqual(result.redirects, [{ id: 'redirect-1', sourcePath: '/old', targetPath: '/kazan', status: 'PUBLISHED' }]);
});

test('public city catalog rejects an unpublished or unknown site', async () => {
  const controller = new CitiesController({
    site: { findFirst: async () => null },
    city: { findMany: async () => assert.fail('cities queried for missing site') },
    redirect: { findMany: async () => assert.fail('redirects queried for missing site') },
  });

  await assert.rejects(controller.list('draft-site'), /Site not found/);
});

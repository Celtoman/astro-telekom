const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { AdminPagesController } = require('../apps/api/dist/admin-pages.controller.js');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');
const { publicationSource, city } = require('./helpers/publication-source.cjs');

test('working catalog takes metadata only from site SEO templates', () => {
  const source = publicationSource([city('kazan', ['giga'])]);
  source.globalPages[0].seo = { title: 'Локальный title общей страницы' };
  source.cities[0].pages[0].seo = { title: 'Локальный title городской HOME' };
  source.cities[0].tariffs[0].seo = { title: 'Локальный title тарифа' };

  const catalog = new SiteCatalogService({}).renderSource(source, new Date('2026-09-25T00:00:00.000Z'));

  assert.deepEqual(catalog.globalPages[0].seo, {});
  assert.deepEqual(catalog.cities[0].pages[0].seo, {});
  assert.deepEqual(catalog.cities[0].tariffs[0].seo, {});
  assert.equal(catalog.seoByPath['/kazan/giga'].title, 'Заголовок CITY_TARIFF_DETAIL giga kazan');
});

test('legacy Page and Tariff SEO JSON cannot be written through admin mutations', async () => {
  let transactions = 0;
  const prisma = { $transaction: async () => { transactions += 1; assert.fail('legacy SEO reached a write transaction'); } };
  const pages = new AdminPagesController(prisma, {});
  const tariffs = new AdminTariffsController(prisma);

  await assert.rejects(pages.create({ type: 'COVERAGE', cityId: null, slug: 'karta-pokrytiya-provaydera', seo: { title: 'old' } }), /SEO.*шаблон/i);
  await assert.rejects(pages.update('page-1', { seo: { title: 'old' } }), /SEO.*шаблон/i);
  await assert.rejects(tariffs.create({ seo: { title: 'old' } }), /SEO.*шаблон/i);
  await assert.rejects(tariffs.update('tariff-1', { seo: { title: 'old' } }), /SEO.*шаблон/i);
  assert.equal(transactions, 0);
});

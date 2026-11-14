const { officialSiteSource } = require('./official-site-source.cjs');
const { speedTestPageDefaults } = require('../../apps/api/dist/speed-test-page-defaults.js');
const { SPEED_TEST_PAGE_SLUG } = require('../../apps/api/dist/speed-test-page-model.js');
function speedTestSource() {
  const source = structuredClone(officialSiteSource());
  source.globalPages.push({ id: 'page-speed-test', siteId: source.site.id, type: 'SPEED_TEST', cityId: null, slug: SPEED_TEST_PAGE_SLUG, title: 'Проверка скорости интернета', status: 'PUBLISHED', blocks: [], content: speedTestPageDefaults() });
  source.seoTemplates.push({ id: 'seo-speed-test', kind: 'SPEED_TEST', titleTemplate: 'Проверка скорости интернета — Дом.ру', descriptionTemplate: 'Измерьте входящую и исходящую скорость, пинг и джиттер. Как провести проверку и понять результаты.', indexState: 'INDEX' });
  return source;
}
module.exports = { speedTestSource };

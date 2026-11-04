const { cityHomeSource } = require('./city-home-source.cjs');
const { ADDRESS_PAGE_METADATA, ADDRESS_PAGE_SLUG } = require('../../apps/api/dist/address-page-model.js');
const { addressPageDefaultBlocks } = require('../../apps/api/dist/address-page-defaults.js');
function addressPageSource() {
  const source = cityHomeSource();
  source.pageTemplates.push({ id: 'address-template', kind: 'CITY_ADDRESS_CHECK', status: 'PUBLISHED', titleTemplate: 'Проверка Дом.ру в {CITY_NAME_PREPOSITIONAL}', content: { ...ADDRESS_PAGE_METADATA },
    blocks: addressPageDefaultBlocks().map((b, i) => ({ ...b, id: `address-${i}`, position: (i + 1) * 10, visible: true })) });
  for (const city of source.cities) city.pages.push({ id: `address-page-${city.slug}`, type: 'ADDRESS_CHECK', status: 'PUBLISHED', slug: ADDRESS_PAGE_SLUG, templateId: 'address-template', blocks: [] });
  source.seoTemplates.push({ kind: 'CITY_ADDRESS_CHECK', titleTemplate: 'Проверка Дом.ру в {CITY_NAME_PREPOSITIONAL}', descriptionTemplate: 'Проверка адреса Дом.ру в {CITY_NAME_PREPOSITIONAL}', indexState: 'INDEX' });
  return source;
}
module.exports = { addressPageSource };

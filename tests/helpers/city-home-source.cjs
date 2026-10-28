const { publicationSource, city } = require('./publication-source.cjs');
const { cityHomeDefaultBlocks } = require('../../apps/api/dist/city-home-defaults.js');
const { CITY_HOME_METADATA } = require('../../apps/api/dist/city-home-model.js');
const { sitePublicDisplayDefaults } = require('../../apps/api/dist/site-public-display.js');
function cityHomeSource() {
  const source = publicationSource([city('kazan', ['giga-300-tv', 'giga-500-tv', 'gamer-300-tv', 'giga-800-tv', 'giga-300-movix', 'giga-1000-tv']), city('naberezhnye-chelny', ['internet']), city('nizhnekamsk', ['internet'])]);
  const names = ['Казань', 'Набережные Челны', 'Нижнекамск'];
  for (const [index, current] of source.cities.entries()) {
    Object.assign(current, { name: names[index], namePrepositional: index === 0 ? 'Казани' : names[index], status: 'PUBLISHED', region: { name: 'Татарстан', slug: 'tatarstan' } });
    current.pages[0].status = 'PUBLISHED'; current.pages[0].templateId = 'city-template';
    for (const tariff of current.tariffs) Object.assign(tariff, { status: 'PUBLISHED', speed: 500, availability: true });
  }
  const labels = ['Гига+ 300 + ТВ', 'Гига+ 500 + ТВ', 'Геймер+ 300 Lesta + ТВ', 'Гига+ 800 + ТВ', 'Гига 300 Movix', 'Гига+ 1000 + ТВ'];
  const prices = [950, 1100, 1200, 1300, 1440, 1700], speeds = [300, 500, 300, 800, 300, 1000];
  for (const [index, tariff] of source.cities[0].tariffs.entries()) Object.assign(tariff, {
    name: labels[index], standardPrice: String(prices[index]), speed: speeds[index], serviceType: index === 4 ? 'INTERNET' : 'INTERNET_TV',
    attributes: { ...(index === 4 ? {} : { tv_channels_total: 190, tv_channels_hd: 77 }), online_cinemas: 'ivi,start,kinopoisk',
      ...(index === 0 ? { badge_text: 'Популярный выбор', is_sticky: true } : {}), ...(index === 2 ? { srv_gaming_status: 'INCLUDED', game_code: 'lesta' } : {}) },
  });
  source.site.settings = { publicDisplay: sitePublicDisplayDefaults() };
  source.globalPages.forEach(page => { page.status = 'PUBLISHED'; });
  source.pageTemplates = [{ id: 'city-template', siteId: 'site-1', kind: 'CITY_HOME', status: 'PUBLISHED', titleTemplate: 'Домашний интернет в {CITY_NAME_PREPOSITIONAL}',
    content: { ...CITY_HOME_METADATA, firstScreenPassportVersion: '1.0.0', tariffCollectionPassportVersion: '1.0.0' },
    blocks: cityHomeDefaultBlocks().map((block, index) => ({ ...block, id: `city-block-${index}`, position: (index + 1) * 10, visible: true })) }];
  return source;
}
module.exports = { cityHomeSource };

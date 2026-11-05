const { addressPageSource } = require('./address-page-source.cjs');
const { accountPageDefaults } = require('../../apps/api/dist/account-page-defaults.js');
const { ACCOUNT_PAGE_SLUG } = require('../../apps/api/dist/account-page-model.js');
function accountPageSource() {
  const source = addressPageSource();
  source.globalPages.push({ id: 'page-account', siteId: source.site.id, type: 'ACCOUNT', cityId: null, slug: ACCOUNT_PAGE_SLUG, title: 'Личный кабинет Дом.ру', status: 'PUBLISHED', blocks: [], content: accountPageDefaults() });
  source.seoTemplates.push({ id: 'seo-account', kind: 'ACCOUNT', titleTemplate: 'Личный кабинет Дом.ру — вход и инструкции', descriptionTemplate: 'Вход, восстановление доступа, оплата и приложение Дом.ру.', indexState: 'INDEX' });
  return source;
}
module.exports = { accountPageSource };

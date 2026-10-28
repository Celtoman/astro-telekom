const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { cityHomeDefaultBlocks } = require('../apps/api/dist/city-home-defaults.js');
const { CITY_HOME_METADATA } = require('../apps/api/dist/city-home-model.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { sitePublicDisplayDefaults } = require('../apps/api/dist/site-public-display.js');
const viewFile = join(__dirname, '../apps/api/dist/city-home-view.js');
const cityHomeFromTemplate = (...args) => {
  assert.ok(existsSync(viewFile), 'versioned CITY template view must exist');
  return require(viewFile).cityHomeFromTemplate(...args);
};
function fixture() {
  const template = { id: 'city-template', siteId: 's1', kind: 'CITY_HOME', status: 'PUBLISHED', titleTemplate: 'Интернет в {CITY_NAME_PREPOSITIONAL}',
    content: { ...CITY_HOME_METADATA, firstScreenPassportVersion: '1.0.0', tariffCollectionPassportVersion: '1.0.0' },
    blocks: cityHomeDefaultBlocks().map((block, index) => ({ ...block, id: `city-block-${index}`, position: (index + 1) * 10, visible: true })) };
  return {
    site: { id: 's1', name: 'Дом.ру', slug: 'domru-site', domain: 'example.org', connectionPhone: '78005557244', supportPhone: '78002507777', settings: { publicDisplay: sitePublicDisplayDefaults() }, provider: { name: 'Дом.ру', settings: {} } },
    cities: [{ id: 'c1', name: 'Казань', namePrepositional: 'Казани', nameGenitive: 'Казани', slug: 'kazan', status: 'PUBLISHED', region: { name: 'Татарстан', slug: 'tatarstan' },
      pages: [{ id: 'p1', type: 'HOME', status: 'PUBLISHED', slug: '', templateId: template.id, content: {}, blocks: [] }],
      tariffs: [{ id: 't1', slug: 'internet', name: 'Интернет 500', status: 'PUBLISHED', availability: 'ACTIVE', serviceType: 'INTERNET', speed: 500, standardPrice: '799', promoPrice: '599', attributes: {} }],
    }],
    globalPages: [
      ['COVERAGE', 'karta-pokrytiya-provaydera'], ['CITIES', 'goroda-obsluzhivaniya'], ['PRIVACY', 'politika-konfidencialnosti'],
      ['PERSONAL_DATA_CONSENT', 'soglasie-na-obrabotku-personalnyh-dannyh'], ['COOKIE_POLICY', 'politika-obrabotki-faylov-kuki'],
    ].map(([type, slug], index) => ({ id: `g${index}`, type, slug, status: 'PUBLISHED', title: type, content: {}, blocks: [] })),
    pageTemplates: [template], redirects: [], sitemapExclusions: [],
    seoTemplates: ['HOME', 'CITY_HOME', 'CITY_TARIFF_DETAIL', 'COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY']
      .map(kind => ({ kind, titleTemplate: `Заголовок ${kind}`, descriptionTemplate: `Описание ${kind}`, indexState: 'INDEX' })),
  };
}

test('CITY view requires explicit implementation/version, complete identities and system positions', () => {
  const source = fixture(), template = source.pageTemplates[0];
  const result = cityHomeFromTemplate(template);
  assert.equal(result.version, '3.0.0');
  assert.equal(result.blocks.length, 10);
  assert.equal(result.blocks[0].id, 'city-block-0');
  for (const change of [t => { t.content.homeCompositionVersion = '99.0.0'; }, t => { delete t.content.cityHomeImplementationVersion; },
    t => { t.blocks[1].position = 10; }, t => { t.blocks[1].id = t.blocks[0].id; }, t => { t.blocks[2].visible = false; },
    t => { t.content.firstScreenPassportVersion = '99.0.0'; }, t => { t.content.tariffCollectionPassportVersion = '99.0.0'; }]) {
    const changed = structuredClone(template); change(changed);
    assert.throws(() => cityHomeFromTemplate(changed));
  }
  const legacy = { ...template, content: { homeCompositionVersion: '2.0.0' }, blocks: template.blocks.slice(0, 2) };
  assert.equal(cityHomeFromTemplate(legacy), null);
});

test('v3 preserves hidden historical rows without exposing or re-enabling them', () => {
  const source = fixture(), template = source.pageTemplates[0];
  template.blocks.push({ id: 'legacy-steps', blockType: 'steps', position: 1040, visible: false, data: { title: 'Прежний блок' } });
  assert.equal(cityHomeFromTemplate(template).blocks.length, 10);
  const { validateCityHomeBlocks } = require('../apps/api/dist/block-validation.js');
  assert.doesNotThrow(() => validateCityHomeBlocks(template.blocks, 'Казань', '3.0.0'));
  assert.equal(template.blocks.at(-1).id, 'legacy-steps');
});

test('catalog projects all CITY fields and shared values without mutating authored source', () => {
  const source = fixture(), before = structuredClone(source);
  source.site.settings.publicDisplay.callbackWithinMinutes = 20;
  before.site.settings.publicDisplay.callbackWithinMinutes = 20;
  const result = new SiteCatalogService({}).renderSource(source, new Date('2026-10-28T00:00:00Z'));
  assert.deepEqual(source, before);
  assert.equal(result.site.publicDisplay.callbackWithinMinutes, 20);
  assert.deepEqual(result.cities[0].tariffFacts, { minPrice: 599, maxSpeed: 500, maxChannels: null });
  const blocks = result.cities[0].pages[0].blocks;
  assert.equal(blocks.length, 10);
  assert.equal(blocks.find(b => b.blockType === 'city.contacts').data.title, 'Контакты Дом.ру в Казани');
  const faq = blocks.find(b => b.blockType === 'city.faq').data.items;
  assert.equal(faq.length, 5, 'the TV question is hidden when no TV channels are known');
  assert.ok(faq.some(item => item.answer.includes('20 минут')));
  assert.ok(faq.some(item => item.answer.includes('599 ₽')));
  assert.ok(faq.some(item => item.answer.includes('500 Мбит/с')));
  assert.ok(result.variableUsages.some(item => item.code === 'CITY_MAX_CHANNELS'), 'hidden source retains variable usage evidence');
});

test('a published city without tariffs blocks a new v3 catalog and identifies the city', () => {
  const source = fixture(); source.cities[0].tariffs = [];
  assert.throws(() => new SiteCatalogService({}).renderSource(source), /Казань.*тариф|тариф.*Казань/i);
});

test('FAQ hides a whole pair for a missing token, preserves plain answers and can have no visible pairs', () => {
  const source = fixture(), faq = source.pageTemplates[0].blocks.find(b => b.blockType === 'city.faq');
  faq.data.items = [{ question: 'Сколько каналов?', answer: '{CITY_MAX_CHANNELS}' }];
  const result = new SiteCatalogService({}).renderSource(source);
  assert.deepEqual(result.cities[0].pages[0].blocks.find(b => b.blockType === 'city.faq').data.items, []);
  faq.data.items.push({ question: 'Как подключиться?', answer: 'Оставьте заявку.' });
  const next = new SiteCatalogService({}).renderSource(source);
  assert.deepEqual(next.cities[0].pages[0].blocks.find(b => b.blockType === 'city.faq').data.items, [{ question: 'Как подключиться?', answer: 'Оставьте заявку.' }]);
});

test('publication preflight uses the same city aggregates and shared settings as the catalog', () => {
  const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
  const result = validatePublicationSource(fixture(), { appVersion: 'test', siteRevision: 7, now: new Date('2026-10-28T00:00:00Z') }, (source, now) => new SiteCatalogService({}).renderSource(source, now));
  const falseEmpty = result.report.issues.filter(issue => issue.code === 'VARIABLE_EMPTY' && /CITY_MIN_PRICE|CITY_MAX_SPEED|CONNECTION_HOURS|ONLINE_APPLICATIONS_HOURS|CALLBACK_WITHIN_MINUTES/.test(issue.message));
  assert.deepEqual(falseEmpty, []);
});

test('preflight locates an empty published city and corrupt shared settings as blocking issues', () => {
  const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
  const source = fixture(); source.cities[0].tariffs = [];
  source.site.settings.publicDisplay.version = '99.0.0';
  const result = validatePublicationSource(source, { appVersion: 'test', siteRevision: 7 }, (value, now) => new SiteCatalogService({}).renderSource(value, now));
  assert.ok(result.report.issues.some(issue => issue.code === 'CITY_TARIFFS_REQUIRED' && issue.path === '/kazan' && issue.message.includes('Казань')));
  assert.ok(result.report.issues.some(issue => issue.code === 'SITE_VALUES' && issue.severity === 'BLOCKING'));
  assert.equal(result.catalog, null);
});

module.exports = { fixture };

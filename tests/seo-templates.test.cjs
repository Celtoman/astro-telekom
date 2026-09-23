const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function seoModule() {
  try {
    return require('../apps/api/dist/seo-templates.js');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') assert.fail('SEO template resolver is not implemented');
    throw error;
  }
}

const templates = () => [
  { kind: 'HOME', titleTemplate: 'Интернет {PROVIDER_NAME}', descriptionTemplate: 'Тарифы для дома.', indexState: 'INDEX' },
  { kind: 'COVERAGE', titleTemplate: 'Карта покрытия', descriptionTemplate: 'Города на карте.', indexState: 'INDEX' },
  { kind: 'CITIES', titleTemplate: 'Города', descriptionTemplate: 'Все города.', indexState: 'INDEX' },
  { kind: 'PRIVACY', titleTemplate: 'Политика', descriptionTemplate: 'Политика сайта.', indexState: 'INDEX' },
  { kind: 'PERSONAL_DATA_CONSENT', titleTemplate: 'Согласие', descriptionTemplate: 'Согласие на обработку.', indexState: 'INDEX' },
  { kind: 'COOKIE_POLICY', titleTemplate: 'Cookie', descriptionTemplate: 'Правила cookie.', indexState: 'INDEX' },
  { kind: 'CITY_HOME', titleTemplate: 'Интернет в {CITY_NAME_PREPOSITIONAL}', descriptionTemplate: 'Тарифы в {CITY_NAME_PREPOSITIONAL}.', indexState: 'INDEX' },
  { kind: 'CITY_TARIFF_DETAIL', titleTemplate: '{TARIFF_NAME} в {CITY_NAME_PREPOSITIONAL}', descriptionTemplate: 'Тариф {TARIFF_NAME} от {TARIFF_PRICE} ₽.', indexState: 'INDEX' },
];

const input = () => ({
  site: { connectionPhone: '78005557244', supportPhone: '78002507777' },
  provider: { name: 'Дом.ру' },
  now: new Date('2026-09-24T00:00:00.000Z'),
  routes: [
    { id: 'HOME', kind: 'HOME', path: '/' },
    { id: 'COVERAGE', kind: 'GLOBAL_PAGE', pageType: 'COVERAGE', path: '/karta-pokrytiya-provaydera' },
    { id: 'CITIES', kind: 'GLOBAL_PAGE', pageType: 'CITIES', path: '/goroda-obsluzhivaniya' },
    { id: 'PRIVACY', kind: 'GLOBAL_PAGE', pageType: 'PRIVACY', path: '/politika-konfidencialnosti' },
    { id: 'PERSONAL_DATA_CONSENT', kind: 'GLOBAL_PAGE', pageType: 'PERSONAL_DATA_CONSENT', path: '/soglasie-na-obrabotku-personalnyh-dannyh' },
    { id: 'COOKIE_POLICY', kind: 'GLOBAL_PAGE', pageType: 'COOKIE_POLICY', path: '/politika-obrabotki-faylov-kuki' },
    { id: 'CITY_HOME', kind: 'CITY_HOME', citySlug: 'kazan', path: '/kazan' },
    { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', citySlug: 'kazan', tariffSlug: 'giga', path: '/kazan/giga' },
  ],
  cities: [{ slug: 'kazan', name: 'Казань', namePrepositional: 'Казани', tariffs: [{ slug: 'giga', name: 'Гига', standardPrice: '599' }] }],
  templates: templates(),
});

test('SEO templates resolve exactly once per Release 1 route with city and tariff context', () => {
  const { resolveSeoTemplates } = seoModule();
  const result = resolveSeoTemplates(input());
  assert.equal(Object.keys(result.byPath).length, 8);
  assert.deepEqual(result.byPath['/'], { title: 'Интернет Дом.ру', description: 'Тарифы для дома.', indexState: 'INDEX', ogTitle: 'Интернет Дом.ру', ogDescription: 'Тарифы для дома.', ogImage: '/images/home-connection-equipment.webp' });
  assert.deepEqual(result.byPath['/kazan'], { title: 'Интернет в Казани', description: 'Тарифы в Казани.', indexState: 'INDEX', ogTitle: 'Интернет в Казани', ogDescription: 'Тарифы в Казани.', ogImage: '/images/home-connection-equipment.webp' });
  assert.deepEqual(result.byPath['/kazan/giga'], { title: 'Гига в Казани', description: 'Тариф Гига от 599 ₽.', indexState: 'INDEX', ogTitle: 'Гига в Казани', ogDescription: 'Тариф Гига от 599 ₽.', ogImage: '/images/home-connection-equipment.webp' });
  assert.deepEqual(result.warnings, []);
});

test('SEO publication rejects missing templates, wrong context, empty sources and unresolved placeholders', () => {
  const { resolveSeoTemplates } = seoModule();
  const missing = input();
  missing.templates.pop();
  assert.throws(() => resolveSeoTemplates(missing), /шаблон.*CITY_TARIFF_DETAIL/i);
  const wrongContext = input();
  wrongContext.templates[0].titleTemplate = 'Интернет в {CITY_NAME}';
  assert.throws(() => resolveSeoTemplates(wrongContext), /контекст|CITY_NAME/i);
  const emptySource = input();
  emptySource.cities[0].tariffs[0].standardPrice = null;
  assert.throws(() => resolveSeoTemplates(emptySource), /TARIFF_PRICE|пуст/i);
  const placeholder = input();
  placeholder.templates[0].descriptionTemplate = 'Звоните {UNKNOWN_CODE}';
  assert.throws(() => resolveSeoTemplates(placeholder), /UNKNOWN_CODE/i);
});

test('SEO length and duplicate diagnostics warn without blocking publication', () => {
  const { resolveSeoTemplates } = seoModule();
  const data = input();
  data.templates[0].titleTemplate = 'Длинный '.repeat(12);
  data.templates[1].descriptionTemplate = 'Повтор';
  data.templates[2].descriptionTemplate = 'Повтор';
  const result = resolveSeoTemplates(data);
  assert.equal(result.byPath['/'].title, data.templates[0].titleTemplate.trim());
  assert.ok(result.warnings.some((warning) => warning.code === 'LONG_TITLE' && warning.path === '/'));
  assert.ok(result.warnings.some((warning) => warning.code === 'DUPLICATE_DESCRIPTION' && warning.path === '/goroda-obsluzhivaniya'));
});

test('Open Graph uses explicit templates and falls back independently to SEO and the site image', () => {
  const { resolveSeoTemplates, DEFAULT_SITE_IMAGE_PATH } = seoModule();
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'apps/web/public', DEFAULT_SITE_IMAGE_PATH.slice(1))), true);
  const data = input();
  data.templates[0].ogTitleTemplate = 'Подключите {PROVIDER_NAME}';
  data.templates[0].ogDescriptionTemplate = 'Специальное описание';
  data.templates[0].ogImageUrl = 'https://cdn.example.ru/share.webp';
  const result = resolveSeoTemplates(data);
  assert.deepEqual(result.byPath['/'], {
    title: 'Интернет Дом.ру', description: 'Тарифы для дома.', indexState: 'INDEX',
    ogTitle: 'Подключите Дом.ру', ogDescription: 'Специальное описание', ogImage: 'https://cdn.example.ru/share.webp',
  });
  assert.equal(result.byPath['/kazan'].ogTitle, result.byPath['/kazan'].title);
  assert.equal(result.byPath['/kazan'].ogDescription, result.byPath['/kazan'].description);
  assert.equal(result.byPath['/kazan'].ogImage, '/images/home-connection-equipment.webp');
});

test('Open Graph rejects wrong variable context and invalid or unavailable image paths', () => {
  const { resolveSeoTemplates } = seoModule();
  for (const [field, value, pattern] of [
    ['ogTitleTemplate', '{CITY_NAME}', /CITY_NAME|контекст/i],
    ['ogDescriptionTemplate', '{UNKNOWN_CODE}', /UNKNOWN_CODE/i],
    ['ogImageUrl', '/images/missing.webp', /изображен|asset/i],
    ['ogImageUrl', 'javascript:alert(1)', /изображен|URL/i],
    ['ogImageUrl', 'https://cdn.example.ru/{CITY_NAME}.webp', /переменн|URL/i],
  ]) {
    const data = input();
    data.templates[0][field] = value;
    assert.throws(() => resolveSeoTemplates(data), pattern, `${field}: ${value}`);
  }
});

test('SEO templates are site-scoped, uniquely typed and additively backfilled without deleting legacy SEO', () => {
  const root = path.resolve(__dirname, '..');
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const model = schema.match(/model SeoTemplate \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(model, /siteId\s+String/);
  assert.match(model, /kind\s+SeoTemplateKind/);
  assert.match(model, /titleTemplate\s+String/);
  assert.match(model, /descriptionTemplate\s+String/);
  assert.match(model, /indexState\s+SeoIndexState/);
  assert.match(model, /ogTitleTemplate\s+String\?/);
  assert.match(model, /ogDescriptionTemplate\s+String\?/);
  assert.match(model, /ogImageUrl\s+String\?/);
  assert.match(model, /@@unique\(\[siteId, kind\]\)/);
  const migrationPath = path.join(root, 'prisma/migrations/0047_seo_templates/migration.sql');
  assert.equal(fs.existsSync(migrationPath), true, 'additive SEO template migration missing');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  for (const kind of ['HOME', 'COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY', 'CITY_HOME', 'CITY_TARIFF_DETAIL']) {
    assert.match(migration, new RegExp(`'${kind}'`));
  }
  assert.doesNotMatch(migration, /DROP\s+(COLUMN|TABLE)/i);
  const ogMigration = fs.readFileSync(path.join(root, 'prisma/migrations/0048_seo_open_graph/migration.sql'), 'utf8');
  for (const field of ['ogTitleTemplate', 'ogDescriptionTemplate', 'ogImageUrl']) assert.match(ogMigration, new RegExp(`ADD COLUMN "${field}" TEXT`));
  assert.doesNotMatch(ogMigration, /DROP\s+(COLUMN|TABLE)/i);
});

test('working catalog resolves site SEO templates before a publication snapshot is captured', async () => {
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const queries = {};
  const prisma = {
    site: { findFirst: async (query) => {
      queries.site = query;
      return {
        id: 'site-1', name: 'Дом.ру', slug: 'domru-site', domain: null,
        connectionPhone: '78005557244', supportPhone: '78002507777',
        settings: {}, provider: { name: 'Дом.ру', settings: {} },
      };
    } },
    city: { findMany: async () => [] },
    page: { findMany: async () => [
      { id: 'coverage', type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera', title: 'Карта', seo: {}, content: {}, blocks: [] },
      { id: 'cities', type: 'CITIES', slug: 'goroda-obsluzhivaniya', title: 'Города', seo: {}, content: {}, blocks: [] },
      { id: 'privacy', type: 'PRIVACY', slug: 'politika-konfidencialnosti', title: 'Политика', seo: {}, content: {}, blocks: [] },
      { id: 'consent', type: 'PERSONAL_DATA_CONSENT', slug: 'soglasie-na-obrabotku-personalnyh-dannyh', title: 'Согласие', seo: {}, content: {}, blocks: [] },
      { id: 'cookie', type: 'COOKIE_POLICY', slug: 'politika-obrabotki-faylov-kuki', title: 'Cookie', seo: {}, content: {}, blocks: [] },
    ] },
    redirect: { findMany: async () => [] },
    sitemapExclusion: { findMany: async () => [] },
    seoTemplate: { findMany: async (query) => { queries.seo = query; return templates().map((item) => item.kind === 'COVERAGE' ? { ...item, indexState: 'NOINDEX' } : item); } },
  };
  const catalog = await new SiteCatalogService(prisma).listBySiteId('site-1');
  assert.deepEqual(queries.seo.where, { siteId: 'site-1' });
  assert.deepEqual(catalog.seoByPath['/'], { title: 'Интернет Дом.ру', description: 'Тарифы для дома.', indexState: 'INDEX', ogTitle: 'Интернет Дом.ру', ogDescription: 'Тарифы для дома.', ogImage: '/images/home-connection-equipment.webp' });
  assert.equal(Object.keys(catalog.seoByPath).length, 6);
  assert.deepEqual(catalog.sitemap.excludedPaths, ['/karta-pokrytiya-provaydera']);
  assert.deepEqual(catalog.seoWarnings, []);
});

test('SEO template update is guarded by the site revision and creates one attributed working revision', async () => {
  let SeoTemplateService;
  try {
    ({ SeoTemplateService } = require('../apps/api/dist/seo-template.service.js'));
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') assert.fail('SEO template update service is not implemented');
    throw error;
  }
  const current = { id: 'template-1', siteId: 'site-1', kind: 'CITY_HOME', titleTemplate: 'До', descriptionTemplate: 'Описание до', indexState: 'INDEX' };
  const calls = { write: null, revision: null };
  const transaction = {
    site: { findUnique: async () => ({ id: 'site-1', workingRevision: 4, publishedRevision: 3 }) },
    seoTemplate: {
      findUnique: async () => current,
      update: async (query) => { calls.write = query; return { ...current, ...query.data }; },
    },
  };
  const service = new SeoTemplateService(
    { $transaction: async (callback) => callback(transaction) },
    { recordWorkingRevision: async (_transaction, revision) => { calls.revision = revision; return { siteRevision: 5 }; } },
  );
  const result = await service.update('site-1', 'CITY_HOME', {
    expectedWorkingRevision: 4,
    titleTemplate: 'Интернет в {CITY_NAME_PREPOSITIONAL}',
    descriptionTemplate: 'Тарифы города',
    indexState: 'INDEX',
    ogTitleTemplate: 'Подключение в {CITY_NAME_PREPOSITIONAL}',
    ogDescriptionTemplate: null,
    ogImageUrl: 'https://cdn.example.ru/share.webp',
  }, 'admin-1');
  assert.equal(calls.write.where.id, 'template-1');
  assert.equal(calls.write.data.ogTitleTemplate, 'Подключение в {CITY_NAME_PREPOSITIONAL}');
  assert.equal(calls.write.data.ogDescriptionTemplate, null);
  assert.equal(calls.write.data.ogImageUrl, 'https://cdn.example.ru/share.webp');
  assert.equal(calls.revision.entityType, 'SITE');
  assert.equal(calls.revision.siteId, 'site-1');
  assert.equal(calls.revision.actorId, 'admin-1');
  assert.equal(calls.revision.source, 'admin-seo-templates');
  assert.equal(result.workingRevision, 5);
  await assert.rejects(() => service.update('site-1', 'CITY_HOME', {
    expectedWorkingRevision: 3, titleTemplate: 'Другой', descriptionTemplate: 'Текст', indexState: 'INDEX',
  }, 'admin-1'), /ревизи|верси/i);
});

test('SEO editor returns raw templates and both preview snapshots without hiding an invalid draft', async () => {
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  const site = { id: 'site-1', slug: 'domru-site', workingRevision: 5, publishedRevision: 4 };
  const prisma = {
    site: { findUnique: async () => site },
    seoTemplate: { findMany: async () => templates() },
  };
  const publications = {
    getWorkingPreview: async () => { throw new Error('SEO-переменная недоступна'); },
    getPublishedCatalog: async () => ({ seoByPath: { '/': { title: 'Опубликовано', description: 'Текст', indexState: 'INDEX' } } }),
  };
  const result = await new SeoTemplateService(prisma, publications).get('site-1');
  assert.equal(result.templates.length, 8);
  assert.equal(result.workingRevision, 5);
  assert.match(result.workingError, /SEO-переменная/);
  assert.equal(result.publishedByPath['/'].title, 'Опубликовано');
});

test('SEO editor reports legacy row-level metadata that may differ from new templates', async () => {
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  const site = { id: 'site-1', slug: 'domru-site', workingRevision: 5, publishedRevision: 4 };
  const catalog = {
    routes: [{ id: 'HOME', path: '/' }], seoByPath: { '/': { title: 'New', description: 'New', indexState: 'INDEX' } },
    globalPages: [{ seo: { title: 'Старый title' } }],
    cities: [{ pages: [{ seo: {} }], tariffs: [{ seo: { description: 'Старый description' } }] }],
  };
  const service = new SeoTemplateService(
    { site: { findUnique: async () => site }, seoTemplate: { findMany: async () => templates() } },
    { getWorkingPreview: async () => ({ catalog }), getPublishedCatalog: async () => catalog },
  );
  assert.equal((await service.get('site-1')).legacySeoCount, 2);
});

test('transition to noindex requires confirmation of exact affected route count', async () => {
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  const current = { id: 'template-1', siteId: 'site-1', kind: 'CITY_HOME', titleTemplate: 'До', descriptionTemplate: 'Текст', indexState: 'INDEX' };
  const transaction = {
    site: { findUnique: async () => ({ id: 'site-1', workingRevision: 4, publishedRevision: 3 }) },
    seoTemplate: { findUnique: async () => current, update: async ({ data }) => ({ ...current, ...data }) },
  };
  const service = new SeoTemplateService(
    { $transaction: async (callback) => callback(transaction) },
    {
      getWorkingPreview: async () => ({ workingRevision: 4, catalog: { routes: [
        { id: 'CITY_HOME', path: '/kazan' }, { id: 'CITY_HOME', path: '/moskva' }, { id: 'HOME', path: '/' },
      ] } }),
      recordWorkingRevision: async () => ({ siteRevision: 5 }),
    },
  );
  const body = { expectedWorkingRevision: 4, titleTemplate: 'До', descriptionTemplate: 'Текст', indexState: 'NOINDEX' };
  await assert.rejects(() => service.update('site-1', 'CITY_HOME', body), /2.*подтверж|подтверж.*2/i);
  const result = await service.update('site-1', 'CITY_HOME', { ...body, confirmNoindexCount: 2 });
  assert.equal(result.indexState, 'NOINDEX');
});

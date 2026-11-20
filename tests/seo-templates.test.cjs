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
    pageTemplate: { findMany: async () => [] },
  };
  const catalog = await new SiteCatalogService(prisma).listBySiteId('site-1');
  assert.deepEqual(queries.seo.where, { siteId: 'site-1' });
  assert.deepEqual(catalog.seoByPath['/'], { title: 'Интернет Дом.ру', description: 'Тарифы для дома.', indexState: 'INDEX', ogTitle: 'Интернет Дом.ру', ogDescription: 'Тарифы для дома.', ogImage: '/images/home-connection-equipment.webp' });
  assert.equal(Object.keys(catalog.seoByPath).length, 6);
  assert.ok(catalog.variableUsages.some((usage) => usage.entityType === 'SEO_TEMPLATE' && usage.code === 'PROVIDER_NAME' && usage.path === 'seoTemplates[HOME].titleTemplate'));
  assert.equal(catalog.variableUsageVersion, 2);
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

test('SEO editor rejects invalid variable codes in every text field before starting a write', async () => {
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  let transactions = 0;
  const service = new SeoTemplateService({ $transaction: async () => { transactions++; throw new Error('unexpected write'); } }, {});
  const valid = { expectedWorkingRevision: 4, titleTemplate: 'Заголовок', descriptionTemplate: 'Описание', indexState: 'INDEX' };
  for (const [field, value, pattern] of [
    ['titleTemplate', 'Тариф {UNKNOWN_TITLE}', /UNKNOWN_TITLE/],
    ['descriptionTemplate', 'Описание {UNKNOWN_DESCRIPTION}', /UNKNOWN_DESCRIPTION/],
    ['ogTitleTemplate', 'OG {UNKNOWN_OG_TITLE}', /UNKNOWN_OG_TITLE/],
    ['ogDescriptionTemplate', 'OG {UNKNOWN_OG_DESCRIPTION}', /UNKNOWN_OG_DESCRIPTION/],
    ['descriptionTemplate', 'https://example.com/{CITY_NAME}', /ссылк|URL/i],
    ['ogTitleTemplate', '<b>{CITY_NAME}</b>', /HTML/i],
  ]) {
    await assert.rejects(() => service.update('site-1', 'CITY_HOME', { ...valid, [field]: value }), pattern, `${field}: ${value}`);
  }
  assert.equal(transactions, 0);
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

test('SEO settings read only templates and revision metadata, even when preview is blocked', async () => {
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  const site = { id: 's', slug: 'site', workingRevision: 8, publishedRevision: 7 };
  const client = {
    site: { findUnique: async ({ where }) => { assert.deepEqual(where, { id: 's' }); return site; } },
    seoTemplate: { findMany: async () => templates() },
  };
  const service = new SeoTemplateService({ $transaction: async (cb, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return cb(client);
  } }, {
    getWorkingPreview: () => assert.fail('settings cannot render any route'),
    getPublishedSnapshot: () => assert.fail('settings cannot load published snapshot'),
  });
  const result = await service.getSettings('s');
  assert.deepEqual(result, { ...site, templates: templates() });
  assert.equal(Object.hasOwn(result, 'routes'), false);
});

test('explicit SEO review scopes page and URL, preserves old missing metadata and verifies both revisions', async () => {
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  let workingRevision = 8;
  let published = { id: 'pub-next', catalog: {} };
  let reads = 0, failure = null;
  const routes = [{ id: 'HOME', path: '/' }, ...Array.from({ length: 207 }, (_, index) => ({ id: 'CITY_HOME', path: `/city-${index+1}` }))];
  const resolved = { title:'SEO для URL', description:'Описание', indexState:'NOINDEX' };
  const diagnostic = { path: '/city-101', code: 'LONG_TITLE', length: 80 };
  const service = new SeoTemplateService({
    site: { findUnique: async () => ({ id: 's', slug: 'site', workingRevision }) },
  }, {
    getWorkingPreview: async (id, projection) => {
      assert.equal(id, 's');
      assert.equal(projection, 'SEO');
      reads++;
      if (failure) throw new Error(failure);
      return { workingRevision, catalog: {
        routes, seoByPath: { '/city-101': resolved },
        seoWarnings: [diagnostic, { path:'/city-102', code:'LONG_TITLE' }],
      } };
    },
    getPublishedSnapshot: async () => published,
  });
  const input = { kind: 'CITY_HOME', workingRevision: 8, page: 3, path: '/city-101' };
  const result = await service.review('s', input);
  assert.equal(result.total, 207);
  assert.equal(result.routes.length, 50);
  assert.equal(result.routes[0], '/city-101');
  assert.deepEqual(result.detail, { path:'/city-101', working: resolved, published: null, publishedPublicationId:'pub-next', warnings:[diagnostic] });
  await assert.rejects(service.review('s', { ...input, publishedPublicationId: 'pub-older-same-revision' }), error => error.getStatus() === 409);
  await assert.rejects(service.review('s', { ...input, path: '/' }), error => error.getStatus() === 404);
  assert.equal((await service.review('s', { ...input, path: undefined, page: 5 })).routes.length, 7);
  published = { ...published, catalog: { seoByPath: { '/city-101': { ...resolved, indexState:'INDEX' } } } };
  assert.equal((await service.review('s', input)).detail.published.indexState, 'INDEX');

  failure = 'Ошибка в блоке другого города';
  const blocked = await service.review('s', input);
  assert.deepEqual(blocked.routes, []);
  assert.equal(blocked.detail, null);
  assert.equal(blocked.workingError, failure);
  assert.equal(reads, 6);
  workingRevision++;
  await assert.rejects(service.review('s', input), error => error.getStatus() === 409);
  assert.equal(reads, 6, 'stale inputs must fail before rendering the catalogue');
});


function seoContinuationFixture(t) {
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  const provider = process.env.REBUILD_PROVIDER;
  delete process.env.REBUILD_PROVIDER;
  t.after(() => { if (provider !== undefined) process.env.REBUILD_PROVIDER = provider; });
  const routes = [{ id: 'HOME', path: '/' }, ...Array.from({ length: 207 }, (_, index) => ({
    id: 'CITY_HOME', path: `/city-${index + 1}`,
  }))];
  const working = { title: 'Одинаковый заголовок', indexState: 'NOINDEX', ogImage: '/images/home-connection-equipment.webp' };
  const published = { title: 'Обслуживаемый заголовок', indexState: 'INDEX' };
  const warning = { path: '/city-102', code: 'DUPLICATE_TITLE', relatedPath: '/city-2' };
  const state = {
    workingRevision: 8, generation: 1, publishedId: 'pub-8', renders: 0, fullPublishedReads: 0,
    catalog: { routes, seoByPath: { '/city-102': working }, seoWarnings: [warning] },
    publishedCatalog: { seoByPath: { '/city-102': published } }, queries: [],
  };
  const store = {
    site: { findUnique: async ({ where }) => ({ id: where.id, slug: where.id, workingRevision: state.workingRevision }) },
    $queryRaw: async query => {
      assert.match(query.text, /s\.slug = .*p\.status = 'SUCCEEDED'/);
      assert.equal(query.values.at(-1), 'site');
      assert.doesNotMatch(query.text, /SELECT p\.catalog/);
      const path = query.values.length > 1 ? query.values[0] : null;
      state.queries.push(path ?? null);
      state.onPublishedDetail?.(path);
      return state.publishedId ? [{ id: state.publishedId, catalogGeneration: state.generation,
        metadata: state.publishedCatalog.seoByPath?.[path] ?? null }] : [];
    },
  };
  const publications = {
    getWorkingPreview: async (_siteId, projection) => {
      assert.equal(projection, 'SEO');
      state.renders++;
      state.onRender?.();
      if (state.failure) throw new Error(state.failure);
      return { workingRevision: state.workingRevision, catalog: state.catalog };
    },
    getPublishedSnapshot: async () => {
      state.fullPublishedReads++;
      return { id: state.publishedId, catalog: state.publishedCatalog };
    },
  };
  return { service: new SeoTemplateService(store, publications), state, store, publications, working, published, warning };
}

test('explicit SEO review computes once and returns identical pages/details from one revision', async t => {
  const { service, state, working, published, warning } = seoContinuationFixture(t);
  const firstQuery = { kind: 'CITY_HOME', workingRevision: 8, page: 1 };
  const detailQuery = { ...firstQuery, page: 3, path: '/city-102' };
  const legacyFirst = await service.review('site', firstQuery);
  const legacyDetail = await service.review('site', detailQuery);
  const renders = state.renders;
  const { reviewId, ...first } = await service.review('site', { ...firstQuery, startReview: true });
  assert.match(reviewId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(first, legacyFirst);
  const detail = await service.review('site', { ...detailQuery, reviewId, publishedPublicationId: 'pub-8' });
  assert.deepEqual(detail, { ...legacyDetail, reviewId });
  assert.deepEqual(detail.detail, { path: '/city-102', working, published, publishedPublicationId: 'pub-8', warnings: [warning] });
  assert.equal(detail.routes.length, 50);
  const lastPage = await service.review('site', { ...firstQuery, page: 5, reviewId });
  assert.equal(lastPage.total, 207);
  assert.deepEqual(lastPage.routes, Array.from({ length: 7 }, (_, index) => `/city-${201 + index}`));
  assert.equal(state.renders - renders, 1);
  assert.equal(state.fullPublishedReads, 2, 'Only the comparison with the old client reads full snapshots');
  assert.deepEqual(state.queries, [null, '/city-1', '/city-102', '/city-201']);
});

test('SEO continuation rejects stale identity, generation, category, instance and expired review', async t => {
  const { service, state, store, publications } = seoContinuationFixture(t);
  const { SeoTemplateService } = require('../apps/api/dist/seo-template.service.js');
  const query = { kind: 'CITY_HOME', workingRevision: 8, page: 1 };
  const start = () => service.review('site', { ...query, startReview: true });
  const expired = error => error.getStatus() === 409 && /устарела или недоступна/.test(error.message);
  const publicationChanged = error => error.getStatus() === 409 && /Опубликованный снимок изменился/.test(error.message);
  const { reviewId } = await start();
  await assert.rejects(service.review('other-site', { ...query, reviewId }), expired);
  await assert.rejects(service.review('site', { ...query, kind: 'HOME', reviewId }), expired);
  await assert.rejects(new SeoTemplateService(store, publications).review('site', { ...query, reviewId }), expired);
  await assert.rejects(service.review('site', { ...query, reviewId, path: '/' }), error => error.getStatus() === 404);
  await assert.rejects(service.review('site', { ...query, reviewId: 'invalid' }), error => error.getStatus() === 400);
  state.generation++;
  await assert.rejects(service.review('site', { ...query, reviewId, page: 6 }), publicationChanged);
  const next = (await start()).reviewId;
  state.publishedId = 'pub-9';
  await assert.rejects(service.review('site', { ...query, reviewId: next }), publicationChanged);
  state.workingRevision++;
  await assert.rejects(service.review('site', { ...query, reviewId }), error => error.getStatus() === 409 && /Рабочая ревизия/.test(error.message));
  state.workingRevision--;
  const oldest = (await start()).reviewId;
  for (let n = 0; n < 4; n++) await start();
  await assert.rejects(service.review('site', { ...query, reviewId: oldest }), expired);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const timed = (await start()).reviewId;
  t.mock.timers.tick(5 * 60_000);
  await assert.rejects(service.review('site', { ...query, reviewId: timed }), expired);
});

test('SEO cannot start a report across a serving switch or continue across a working change', async t => {
  const { service, state } = seoContinuationFixture(t);
  const query = { kind: 'CITY_HOME', workingRevision: 8, page: 1 };
  state.onRender = () => state.generation++;
  await assert.rejects(service.review('site', { ...query, startReview: true }), error =>
    error.getStatus() === 409 && /Опубликованный снимок изменился/.test(error.message));
  state.onRender = null;
  const { reviewId } = await service.review('site', { ...query, startReview: true });
  state.onPublishedDetail = () => state.workingRevision++;
  await assert.rejects(service.review('site', { ...query, reviewId }), error =>
    error.getStatus() === 409 && /Рабочая ревизия/.test(error.message));
});

test('SEO explicit report preserves historical absence and global working errors', async t => {
  const { service, state } = seoContinuationFixture(t);
  const query = { kind: 'CITY_HOME', workingRevision: 8, page: 1 };
  state.publishedCatalog = {};
  const initial = await service.review('site', { ...query, startReview: true });
  assert.equal(initial.detail.published, null);
  assert.equal(initial.detail.publishedPublicationId, 'pub-8');
  const detail = await service.review('site', { ...query, reviewId: initial.reviewId, path: '/city-102' });
  assert.equal(detail.detail.published, null);
  state.failure = 'Ошибка блоков другого города';
  const blocked = await service.review('site', { ...query, startReview: true, path: '/city-102' });
  assert.equal(blocked.workingError, state.failure);
  assert.equal(blocked.detail, null);
  assert.equal(blocked.reviewId, undefined);
});

test('SEO can still serve the compatibility page if the report exceeds the retained weight budget', async t => {
  const { service, state } = seoContinuationFixture(t);
  state.catalog.seoByPath['/city-207'] = { title: 'x'.repeat(8 * 1024 * 1024) };
  const result = await service.review('site', { kind: 'CITY_HOME', workingRevision: 8, page: 1, startReview: true });
  assert.equal(result.total, 207);
  assert.equal(result.routes.length, 50);
  assert.equal(result.reviewId, undefined);
  assert.equal(state.renders, 1);
});

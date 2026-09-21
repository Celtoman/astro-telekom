const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const repositoryRoot = join(__dirname, '..');

function loadSitemapModules() {
  try {
    return {
      ...require('../apps/api/dist/sitemap-policy.js'),
      ...require('../apps/api/dist/sitemap.service.js'),
      ...require('../apps/api/dist/admin-sitemap.controller.js'),
    };
  } catch {
    return {};
  }
}

function fixture({ currentExclusions = [], routes, latestPublication = null } = {}) {
  const created = [];
  const deleted = [];
  const revisions = [];
  const transactions = [];
  const site = {
    id: 'site-1', name: 'Дом.ру', slug: 'domru-site', domain: 'partner.example.test',
    status: 'PUBLISHED', workingRevision: 8, publishedRevision: 7,
  };
  const prisma = {
    site: { findUnique: async () => site },
    page: {
      findMany: async () => [{ id: 'global-draft', title: 'Черновик', type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera', status: 'DRAFT' }],
    },
    city: {
      findMany: async () => [{
        id: 'city-1', name: 'Казань', slug: 'kazan', status: 'PUBLISHED',
        tariffs: [
          { id: 'tariff-1', name: 'Гига 500', slug: 'giga-500', status: 'PUBLISHED' },
          { id: 'tariff-draft', name: 'Черновой тариф', slug: 'draft', status: 'DRAFT' },
        ],
      }],
    },
    sitemapExclusion: {
      findMany: async () => currentExclusions,
      deleteMany: async (query) => { deleted.push(query); return { count: currentExclusions.length }; },
      createMany: async ({ data }) => { created.push(...data); return { count: data.length }; },
    },
    sitePublication: { findFirst: async () => latestPublication },
  };
  prisma.$transaction = async (callback, options) => {
    transactions.push(options);
    return callback(prisma);
  };
  const catalog = {
    listBySiteId: async () => ({
      routes: routes ?? [
        { kind: 'HOME', path: '/' },
        { kind: 'CITY_HOME', path: '/kazan' },
        { kind: 'CITY_TARIFF_DETAIL', path: '/kazan/giga-500' },
      ],
    }),
  };
  const publications = {
    recordWorkingRevision: async (transaction, input) => {
      revisions.push({ transaction, input });
      return { siteRevision: 9 };
    },
  };
  return { prisma, catalog, publications, site, created, deleted, revisions, transactions };
}

test('sitemap policy builds escaped absolute XML and never excludes the root route', () => {
  const { buildSitemapIndexXml, buildSitemapXml, normalizeSitemapOrigin, validateSitemapExclusions } = loadSitemapModules();
  assert.equal(typeof buildSitemapXml, 'function', 'sitemap policy module must exist');
  assert.equal(normalizeSitemapOrigin('partner.example.test'), 'https://partner.example.test');
  assert.equal(
    buildSitemapXml('https://partner.example.test', ['/', '/kazan?x=1&y=2']),
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://partner.example.test/</loc></url><url><loc>https://partner.example.test/kazan?x=1&amp;y=2</loc></url></urlset>',
  );
  assert.equal(
    buildSitemapIndexXml('https://partner.example.test', ['sitemap-pages.xml', 'sitemap-cities.xml', 'sitemap-tariffs.xml']),
    '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://partner.example.test/sitemap-pages.xml</loc></sitemap><sitemap><loc>https://partner.example.test/sitemap-cities.xml</loc></sitemap><sitemap><loc>https://partner.example.test/sitemap-tariffs.xml</loc></sitemap></sitemapindex>',
  );
  assert.throws(
    () => validateSitemapExclusions([{ path: '/', reason: 'Скрыть' }], new Set(['/', '/kazan'])),
    /корневой URL/i,
  );
});

test('sitemap workspace reports origin, last generation, source status and managed exclusions', async () => {
  const { SitemapService } = loadSitemapModules();
  assert.equal(typeof SitemapService, 'function', 'sitemap service must exist');
  const f = fixture({
    currentExclusions: [{ id: 'ex-1', siteId: 'site-1', path: '/kazan/giga-500', reason: 'Не приоритетная страница', createdById: 'user-1' }],
    latestPublication: { id: 'pub-8', siteRevision: 8, status: 'FAILED', updatedAt: new Date('2026-09-16T10:00:00.000Z'), publishedAt: null, lastError: 'Build failed' },
  });
  const service = new SitemapService(f.prisma, f.catalog, f.publications);

  const workspace = await service.getWorkspace('site-1');

  assert.equal(workspace.origin, 'https://partner.example.test');
  assert.deepEqual(workspace.lastGeneration, {
    id: 'pub-8', siteRevision: 8, status: 'FAILED', generatedAt: new Date('2026-09-16T10:00:00.000Z'), lastError: 'Build failed',
  });
  assert.equal(workspace.validation.errors.length, 0);
  assert.equal(workspace.entries.find((entry) => entry.path === '/kazan').included, true);
  assert.equal(workspace.entries.find((entry) => entry.path === '/kazan').group, 'CITIES');
  assert.equal(workspace.entries.find((entry) => entry.path === '/kazan/giga-500').group, 'TARIFFS');
  assert.equal(workspace.entries.find((entry) => entry.path === '/kazan/giga-500').reason, 'Не приоритетная страница');
  assert.equal(workspace.entries.find((entry) => entry.path === '/kazan/draft').publishStatus, 'DRAFT');
  assert.equal(workspace.entries.find((entry) => entry.path === '/kazan/draft').eligible, false);
  assert.match(workspace.previews.index, /sitemap-pages\.xml/);
  assert.doesNotMatch(workspace.previews.tariffs, /giga-500/);
  assert.match(workspace.previews.cities, /https:\/\/partner\.example\.test\/kazan/);
});

test('replacing sitemap exclusions is atomic, revisioned and does not publish directly', async () => {
  const { SitemapService } = loadSitemapModules();
  assert.equal(typeof SitemapService, 'function', 'sitemap service must exist');
  const f = fixture();
  const service = new SitemapService(f.prisma, f.catalog, f.publications);

  const result = await service.replaceExclusions('site-1', {
    expectedWorkingRevision: 8,
    exclusions: [{ path: '/kazan/giga-500', reason: 'Не включать в карту сайта' }],
  }, 'user-1');

  assert.deepEqual(result, { changed: true, workingRevision: 9 });
  assert.equal(f.transactions[0].isolationLevel, 'Serializable');
  assert.equal(f.deleted.length, 1);
  assert.deepEqual(f.created, [{ siteId: 'site-1', path: '/kazan/giga-500', reason: 'Не включать в карту сайта', createdById: 'user-1' }]);
  assert.equal(f.revisions.length, 1);
  assert.equal(f.revisions[0].input.entityType, 'SITE');
  assert.equal(f.revisions[0].input.entityId, 'site-1');
  assert.equal(f.revisions[0].input.source, 'admin-sitemap');
  assert.deepEqual(f.revisions[0].input.changedFields, ['sitemapExclusions']);
  assert.equal('enqueue' in f.publications, false);
});

test('sitemap exclusions reject stale revisions, root, duplicates and unpublished paths before writing', async () => {
  const { SitemapService } = loadSitemapModules();
  assert.equal(typeof SitemapService, 'function', 'sitemap service must exist');
  const cases = [
    [{ expectedWorkingRevision: 7, exclusions: [] }, /рабочая ревизия/i],
    [{ expectedWorkingRevision: 8, exclusions: [{ path: '/', reason: 'Скрыть' }] }, /корневой URL/i],
    [{ expectedWorkingRevision: 8, exclusions: [{ path: '/draft', reason: 'Скрыть' }] }, /не является опубликованным маршрутом/i],
    [{ expectedWorkingRevision: 8, exclusions: [{ path: '/kazan', reason: 'Один' }, { path: '/kazan', reason: 'Два' }] }, /дублируется/i],
  ];
  for (const [body, pattern] of cases) {
    const f = fixture();
    await assert.rejects(new SitemapService(f.prisma, f.catalog, f.publications).replaceExclusions('site-1', body, 'user-1'), pattern);
    assert.equal(f.created.length, 0);
    assert.equal(f.deleted.length, 0);
    assert.equal(f.revisions.length, 0);
  }
});

test('sitemap persistence is normalized and wired into the protected API module', () => {
  const schema = readFileSync(join(repositoryRoot, 'prisma', 'schema.prisma'), 'utf8');
  const moduleSource = readFileSync(join(repositoryRoot, 'apps', 'api', 'src', 'module.ts'), 'utf8');
  const controllerSource = (() => {
    try { return readFileSync(join(repositoryRoot, 'apps', 'api', 'src', 'admin-sitemap.controller.ts'), 'utf8'); } catch { return ''; }
  })();
  assert.match(schema, /model SitemapExclusion[\s\S]*@@unique\(\[siteId, path\]\)/);
  assert.match(moduleSource, /AdminSitemapController/);
  assert.match(moduleSource, /SitemapService/);
  assert.match(controllerSource, /@UseGuards\(AdminTokenGuard\)/);
  assert.match(controllerSource, /@Get\('sites\/:siteId\/sitemap'\)/);
  assert.match(controllerSource, /@Put\('sites\/:siteId\/sitemap-exclusions'\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  editorialServingArticles, editorialServingPreview, editorialServingRouteInventory, editorialServingWorkingPreviewBase,
} = require('../apps/api/dist/editorial-serving-source.js');
const { EditorialPublicationService } = require('../apps/api/dist/editorial-publication.service.js');

const site = { id: 'site-1', slug: 'domru-site' };
const digest = catalog => createHash('sha256').update(JSON.stringify(catalog)).digest('hex');

test('editorial reads verify the served generation and pin a fallback to the same validation snapshot', async t => {
  const env = {
    REBUILD_PROVIDER: 'static', ADMIN_API_TOKEN: 'fixture-token',
    STATIC_PUBLICATION_URL: 'http://fixture:8081', SERVING_CATALOG_PROJECTIONS_ENABLED: 'true',
  };
  const oldEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  const first = { id: 'article-1', slug: 'article', revision: 1, title: 'Published before ACK' };
  const next = { ...first, revision: 2, title: 'Rebuilt under the same ID' };
  const original = {
    id: 'publication-a', siteId: site.id, siteRevision: 7, releaseSequence: 9, status: 'RUNNING',
    validationId: 'validation-a', catalogGeneration: 1, catalog: { site, editorial: { articles: [first] } },
  };
  const replacement = {
    ...original, validationId: 'validation-b', catalogGeneration: 2, status: 'PENDING',
    catalog: { site, editorial: { articles: [next] } },
  };
  let current = original, seal = true, complete = true, scoped = false, activeReads = 0, fullCatalogReads = 0;
  let activeDigest = digest(original.catalog);
  const fullSourceReads = [];
  t.mock.method(global, 'fetch', async () => {
    activeReads++;
    return Response.json({
      publicationId: original.id, siteId: site.id, siteSlug: site.slug,
      siteRevision: original.siteRevision, releaseSequence: original.releaseSequence, catalogDigest: activeDigest,
    });
  });
  const client = {
    $queryRaw: async query => {
      if (!query.text.includes('"SitePublicationProjection"')) {
        assert.ok(query.values.includes(current.validationId));
        return [{ articles: current.catalog.editorial.articles }];
      }
      assert.equal(query.values.at(-1), original.id);
      assert.match(query.text, /validation\.id = p\."validationId"/);
      assert.match(query.text, /p\."catalogGeneration" = projection\."catalogGeneration"/);
      const { catalog, ...metadata } = current;
      return [{
        ...metadata, catalogSiteSlug: site.slug, complete, digest: seal ? digest(catalog) : null,
        data: scoped ? { editorial: catalog.editorial } : { articles: catalog.editorial.articles },
      }];
    },
    sitePublication: {
      async findUnique({ where }) {
        assert.equal(where.id, original.id);
        fullCatalogReads++;
        return current;
      },
      async findFirst() { assert.fail('Static reads cannot fall back to the latest SQL publication'); },
    },
    sitePublicationValidation: {
      async findUnique({ where }) {
        fullSourceReads.push(where.id);
        return { sourceSnapshot: { site, cities: [], globalPages: [], editorial: original.catalog.editorial } };
      },
    },
  };

  assert.deepEqual(await editorialServingArticles(client, site, [first.id]), [first]);
  assert.equal(fullCatalogReads, 0);
  scoped = true;
  const preview = await editorialServingPreview(client, site, 'ARTICLE', first.id);
  assert.equal(preview.publication.validationId, original.validationId);
  assert.equal(preview.publication.catalogGeneration, 1);
  assert.equal(preview.editorial.articles[0].title, first.title);
  assert.equal('catalog' in preview.publication, false);

  activeDigest = '0'.repeat(64);
  scoped = false;
  await assert.rejects(editorialServingArticles(client, site, [first.id]), error => error.getStatus() === 503);
  assert.equal(fullCatalogReads, 0);

  activeDigest = digest(original.catalog);
  complete = false;
  const beforeFallback = activeReads;
  assert.deepEqual(await editorialServingArticles(client, site, [first.id]), [first]);
  assert.equal(fullCatalogReads, 1);
  assert.equal(activeReads - beforeFallback, 1);

  current = replacement;
  seal = false;
  await assert.rejects(editorialServingArticles(client, site, [first.id]), error => error.getStatus() === 503);
  assert.equal(fullCatalogReads, 2);
  seal = true;
  complete = true;
  await assert.rejects(editorialServingArticles(client, site, [first.id]), error => error.getStatus() === 503);
  assert.equal(fullCatalogReads, 2);

  activeDigest = digest(replacement.catalog);
  assert.deepEqual(await editorialServingArticles(client, site, [next.id]), [next]);
  assert.equal(fullCatalogReads, 2);
  const historical = await preview.loadHistoricalSource();
  assert.deepEqual(fullSourceReads, [original.validationId]);
  assert.equal(historical.editorial.articles[0].title, first.title);
});

test('general working preview uses the verified serving digest and pins incomplete and historical reads', async t => {
  const env = { REBUILD_PROVIDER: 'static', ADMIN_API_TOKEN: 'fixture-token', STATIC_PUBLICATION_URL: 'http://fixture:8081',
    SERVING_CATALOG_PROJECTIONS_ENABLED: 'true' };
  const oldEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const historical = { id: 'historical', siteId: site.id, siteRevision: 6, releaseSequence: 8, status: 'SUCCEEDED',
    validationId: 'validation-history', catalogGeneration: 1, catalog: { site, historical: true } };
  const running = { ...historical, id: 'running', siteRevision: 7, releaseSequence: 9, status: 'RUNNING',
    validationId: 'validation-running', catalogGeneration: 3, catalog: { site, historical: false } };
  const archive = publication => ({ site, cities: [], globalPages: [], redirects: [], editorial: { newsEnabled: true,
    categories: [], articles: [{ slug: publication.id, categoryId: null }] } });
  let active = running, invalidDigest = false, complete = true, missingProjectionData = false;
  let activeReads = 0, fullCatalogReads = 0, legacyReads = 0;
  const reads = [];
  t.mock.method(global, 'fetch', async () => {
    activeReads++;
    return Response.json({ publicationId: active.id, siteId: site.id, siteSlug: site.slug,
      siteRevision: active.siteRevision, releaseSequence: active.releaseSequence,
      catalogDigest: invalidDigest ? '0'.repeat(64) : digest(active.catalog) });
  });
  const client = {
    $queryRaw: async query => {
      if (!query.text.includes('"SitePublicationProjection"')) {
        const publication = [historical, running].find(item => query.values.includes(item.validationId));
        assert.ok(publication);
        reads.push(publication.validationId);
        return [{ editorial: archive(publication).editorial, redirects: [] }];
      }
      const publication = [historical, running].find(item => item.id === query.values.at(-1));
      assert.ok(publication);
      assert.match(query.text, /validation\.id = p\."validationId"/);
      assert.match(query.text, /p\."catalogGeneration" = projection\."catalogGeneration"/);
      const { catalog, ...metadata } = publication;
      return [{ ...metadata, catalogSiteSlug: site.slug, digest: digest(catalog), complete,
        data: missingProjectionData ? null : { editorial: archive(publication).editorial, redirects: [] } }];
    },
    sitePublication: {
      async findUnique({ where }) {
        fullCatalogReads++;
        return [historical, running].find(item => item.id === where.id);
      },
      async findFirst({ select }) {
        legacyReads++;
        assert.equal(select.catalog, undefined);
        const { catalog, ...metadata } = historical;
        return metadata;
      },
    },
    sitePublicationValidation: { async findUnique({ where }) {
      const publication = [historical, running].find(item => item.validationId === where.id);
      assert.ok(publication);
      reads.push(publication.validationId);
      return { sourceSnapshot: archive(publication) };
    } },
  };

  assert.equal((await editorialServingRouteInventory(client, site)).editorial.articles[0].slug, running.id);
  const frozen = await editorialServingWorkingPreviewBase(client, site);
  assert.equal(frozen.verifiedCatalogDigest, digest(running.catalog));
  assert.equal(frozen.publication.catalogGeneration, 3);
  assert.equal('catalog' in frozen.publication, false);
  assert.equal(fullCatalogReads, 0);

  invalidDigest = true;
  await assert.rejects(editorialServingRouteInventory(client, site), { status: 503 });
  await assert.rejects(editorialServingWorkingPreviewBase(client, site), { status: 503 });
  assert.equal(fullCatalogReads, 0);

  invalidDigest = false;
  active = historical;
  complete = false;
  const before = activeReads;
  const fallback = await editorialServingWorkingPreviewBase(client, site);
  assert.equal(fallback.source.editorial.articles[0].slug, historical.id);
  assert.equal(fallback.verifiedCatalogDigest, digest(historical.catalog));
  assert.equal(activeReads - before, 1);
  assert.deepEqual(reads, [historical.validationId]);
  assert.equal(fullCatalogReads, 1);

  complete = true;
  missingProjectionData = true;
  assert.equal((await editorialServingWorkingPreviewBase(client, site)).source.editorial.articles[0].slug, historical.id);
  assert.deepEqual(reads, [historical.validationId, historical.validationId]);
  assert.equal(fullCatalogReads, 1);
  await assert.rejects(editorialServingRouteInventory(client, site), { status: 409 });

  process.env.REBUILD_PROVIDER = 'webhook';
  const readsBeforeLegacy = activeReads;
  const legacy = await editorialServingWorkingPreviewBase(client, site);
  assert.equal(legacy.verifiedCatalogDigest, null);
  assert.equal(legacy.publication.id, historical.id);
  assert.equal(legacyReads, 1);
  assert.equal(activeReads, readsBeforeLegacy);
});

test('settings workspace preserves source values, availability and URL from the exact serving validation', async t => {
  const env = { REBUILD_PROVIDER: 'static', ADMIN_API_TOKEN: 'fixture-token', PUBLIC_SITE_URL: '',
    STATIC_PUBLICATION_URL: 'http://fixture:8081', SERVING_CATALOG_PROJECTIONS_ENABLED: 'true' };
  const oldEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  const catalog = { site: { ...site, domain: 'catalog.example' }, editorial: { settings: { heading: 'Unused catalog settings' } } };
  const publication = { id: 'active', siteId: site.id, siteRevision: 7, releaseSequence: 9, status: 'RUNNING',
    validationId: 'source-active', catalogGeneration: 1, catalog };
  const historical = { ...publication, id: 'history', status: 'SUCCEEDED', siteRevision: 6, releaseSequence: 8,
    validationId: 'source-history' };
  const fullSource = (editorial, extra) => ({
    site: { ...site, domain: 'source.example' }, cities: [], globalPages: [], editorial, ...extra,
  });
  const snapshots = new Map([
    [publication.validationId, fullSource({ settings: { heading: 'Working news', revision: 4 },
      notFound: { heading: 'Published 404', revision: 2 } })],
    [historical.validationId, fullSource({ articles: 'malformed', settings: { heading: 'Historical news', revision: 1 } })],
  ]);
  let active = publication, activeDigest = digest(catalog), complete = true, everPublished = true;
  let activeReads = 0, fullCatalogReads = 0;
  const sourceReads = [], compactReads = [];
  t.mock.method(global, 'fetch', async () => {
    activeReads++;
    const { siteId, siteRevision, releaseSequence, id } = active;
    return Response.json({ publicationId: id, siteId, siteSlug: site.slug, siteRevision, releaseSequence, catalogDigest: activeDigest });
  });
  function data(validationId, field) {
    compactReads.push(validationId);
    const source = snapshots.get(validationId);
    if (!source?.site || source.site.id !== site.id || !Array.isArray(source.cities) || !Array.isArray(source.globalPages)
      || (source.editorial?.articles != null && !Array.isArray(source.editorial.articles))) return null;
    const editorial = source.editorial;
    return { domain: source.site.domain,
      editorial: editorial && typeof editorial === 'object' && !Array.isArray(editorial)
        ? { newsEnabled: editorial.newsEnabled, [field]: editorial[field] ?? null } : null,
      requiresFullSource: editorial != null && (typeof editorial !== 'object' || Array.isArray(editorial)),
    };
  }
  const prisma = {
    async $queryRaw(query) {
      const field = query.values.find(value => ['settings', 'notFound'].includes(value));
      assert.ok(field);
      if (!query.text.includes('"SitePublicationProjection"')) {
        const validationId = query.values.find(value => snapshots.has(value));
        assert.equal(validationId, active.validationId);
        const selection = data(validationId, field);
        return selection ? [selection] : [];
      }
      assert.match(query.text, /validation\.id = p\."validationId"/);
      assert.match(query.text, /p\."catalogGeneration" = projection\."catalogGeneration"/);
      assert.equal(query.values.at(-1), active.id);
      const { catalog, ...metadata } = active;
      return [{ ...metadata, catalogSiteSlug: site.slug, digest: digest(catalog), complete,
        data: complete ? data(active.validationId, field) : null }];
    },
    sitePublication: {
      async findUnique({ where }) { fullCatalogReads++; assert.equal(where.id, active.id); return active; },
      async findFirst({ select }) {
        assert.equal(select.catalog, undefined);
        assert.equal(process.env.REBUILD_PROVIDER, 'webhook');
        return historical;
      },
    },
    sitePublicationValidation: {
      async findUnique({ where }) {
        sourceReads.push(where.id);
        return { sourceSnapshot: snapshots.get(where.id) };
      },
    },
  };
  const contents = { NEWS_SETTINGS: { heading: 'Working news' }, NOT_FOUND: { heading: 'Working 404' } };
  const service = new EditorialPublicationService(prisma, {
    async read(_site, kind) { return { id: kind, content: contents[kind], revision: 5, updatedAt: null, missingFields: [] }; },
    async row() { return { everPublished }; },
    async requireSite() { return site; },
  });
  const workspace = kind => service.workspace(site.id, kind, 'settings');
  const expected = (kind, state, published, revision, publicUrl, publishedAvailable = true) => ({
    id: kind, content: contents[kind], revision: 5, updatedAt: null, missingFields: [], published,
    publishedAvailable, publishedRevision: revision, state, publicUrl, pendingRemoval: false, categoryNames: {},
  });

  assert.deepEqual(await workspace('NEWS_SETTINGS'),
    expected('NEWS_SETTINGS', 'PUBLISHED', contents.NEWS_SETTINGS, 4, 'https://source.example/news'));
  assert.deepEqual(await workspace('NOT_FOUND'),
    expected('NOT_FOUND', 'CHANGED', { heading: 'Published 404' }, 2, null));
  assert.equal(fullCatalogReads, 0);
  assert.deepEqual(sourceReads, []);

  activeDigest = '0'.repeat(64);
  assert.deepEqual(await workspace('NEWS_SETTINGS'), expected('NEWS_SETTINGS', 'UNKNOWN', null, null, null, false));
  assert.equal(fullCatalogReads, 0);
  assert.deepEqual(sourceReads, []);
  activeDigest = digest(catalog);

  active = historical;
  complete = false;
  const beforeFallback = activeReads;
  assert.deepEqual(await workspace('NEWS_SETTINGS'),
    expected('NEWS_SETTINGS', 'CHANGED', { heading: 'Historical news' }, 1, 'https://source.example/news'));
  assert.equal(activeReads - beforeFallback, 1);
  assert.equal(fullCatalogReads, 1);
  assert.deepEqual(sourceReads, [historical.validationId]);
  assert.equal(compactReads.at(-1), historical.validationId);

  complete = true;
  snapshots.set(historical.validationId, fullSource({ newsEnabled: false, settings: { heading: 'Disabled' } }));
  assert.deepEqual(await workspace('NEWS_SETTINGS'), expected('NEWS_SETTINGS', 'WITHDRAWN', null, null, null));
  everPublished = false;
  snapshots.set(historical.validationId, fullSource({ settings: null }));
  process.env.PUBLIC_SITE_URL = 'https://configured.example';
  assert.deepEqual(await workspace('NEWS_SETTINGS'), expected('NEWS_SETTINGS', 'DRAFT', null, null, 'https://configured.example/news'));
  assert.deepEqual(await workspace('NOT_FOUND'), expected('NOT_FOUND', 'DRAFT', null, null, null));

  process.env.REBUILD_PROVIDER = 'webhook';
  const beforeLegacy = activeReads;
  snapshots.set(historical.validationId, fullSource('legacy malformed editorial'));
  assert.deepEqual(await workspace('NEWS_SETTINGS'), expected('NEWS_SETTINGS', 'DRAFT', null, null, 'https://configured.example/news'));
  assert.deepEqual(sourceReads, [historical.validationId, historical.validationId]);
  assert.equal(activeReads, beforeLegacy);
});

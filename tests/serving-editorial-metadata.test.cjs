const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  editorialServingArticles, editorialServingPreview, editorialServingRouteInventory, editorialServingWorkingPreviewBase,
} = require('../apps/api/dist/editorial-serving-source.js');

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

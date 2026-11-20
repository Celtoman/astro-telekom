const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  editorialServingArticles, editorialServingPreview,
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

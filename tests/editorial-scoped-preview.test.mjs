import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire, Module as NodeModule } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as newsRender from '../apps/web/src/lib/news-render.ts';
import { buildPreviewDocument } from '../apps/admin/src/lib/preview-document.mjs';

const require = createRequire(import.meta.url);
const apiRequire = createRequire(resolve('apps/api/package.json'));
const { Module } = apiRequire('@nestjs/common');
const { NestFactory } = apiRequire('@nestjs/core');
const { FastifyAdapter } = apiRequire('@nestjs/platform-fastify');
const { AdminTokenGuard } = require('../apps/api/dist/admin-token.guard.js');
const { ADMIN_SESSION_COOKIE, AuthService } = require('../apps/api/dist/auth.service.js');
const { AdminNewsController } = require('../apps/api/dist/admin-news.controller.js');
const { AdminNewsCategoriesController } = require('../apps/api/dist/admin-news-categories.controller.js');
const { AdminEditorialSettingsController } = require('../apps/api/dist/admin-editorial-settings.controller.js');
const { EditorialStoreService } = require('../apps/api/dist/editorial-store.service.js');
const { EditorialPublicationService } = require('../apps/api/dist/editorial-publication.service.js');
const { EditorialMediaRegistryService } = require('../apps/api/dist/editorial-media-registry.service.js');
const { EditorialMediaService } = require('../apps/api/dist/editorial-media.service.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const newsProjection = require('../apps/api/dist/news-projection.js');
const newsTypes = require('../apps/api/dist/news-types.js');
const { newsSource } = require('./helpers/news-source.cjs');
const { publicationSource } = require('./helpers/publication-source.cjs');

const ts = createRequire(resolve('apps/admin/package.json'))('typescript');
const filename = resolve('apps/admin/src/lib/editorial-preview-document.ts');
const documentModule = new NodeModule(filename);
documentModule.require = name => {
  if (name.endsWith('/data/news')) return {
    homeNews: editorial => editorial?.newsEnabled !== false ? newsProjection.sortedNews(editorial?.articles ?? []).slice(0, 3) : [],
  };
  if (name.endsWith('/news-projection')) return newsProjection;
  if (name.endsWith('/news-render')) return newsRender;
  if (name.endsWith('/news-types')) return newsTypes;
  if (name === './preview-document.mjs') return { buildPreviewDocument };
  throw new Error('Unexpected preview dependency ' + name);
};
documentModule._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { editorialPreviewDocument } = documentModule.exports;
const hash = value => createHash('sha256').update(value).digest('hex');

function fixture() {
  const source = newsSource(30);
  const assets = new Map();
  for (const article of source.editorial.articles) {
    const id = article.id;
    article.cover = { assetId: id, alt: 'Обложка' };
    article.body.content.push({ type: 'image', attrs: { assetId: id, alt: 'Иллюстрация' } });
    const variant = kind => ({
      key: hash(id) + '/' + hash(id + kind) + '.webp', sha256: hash(id + kind), width: 640, height: 360, bytes: 16,
    });
    assets.set(id, { cover: [variant('cover')], body: [variant('body')], social: [variant('social')] });
  }
  const article = source.editorial.articles[25];
  const { id, revision, dateModified, ...content } = article;
  const working = { id, revision: 2, content: {
    ...content, title: 'Точный черновик', slug: 'story-0', categoryId: 'new-category', related: { mode: 'manual', ids: ['news-3', 'news-8'] },
  } };
  const draftCategory = { id: 'new-category', revision: 2, content: { version: '1.0.0', name: 'Новая категория', slug: 'services', description: 'Превью категории', seo: {}, social: {} } };
  const settings = {
    NEWS_SETTINGS: { id: 'settings', revision: 2, content: { ...newsTypes.newsSettingsDefaults(), title: 'Точные настройки' } },
    NOT_FOUND: { id: 'not-found', revision: 2, content: { ...newsTypes.notFoundDefaults(), title: 'Точная 404' } },
  };
  const stats = { fullSource: 0, sourceProjection: 0, render: 0, batches: [] };
  const state = {
    source, assets, working, stats, publication: { id: 'publication', validationId: 'validation', siteId: source.site.id, status: 'SUCCEEDED' },
  };
  const prisma = {
    site: { findUnique: async ({ where }) => where.id === source.site.id ? source.site : null },
    sitePublication: { findFirst: async ({ where }) => where.siteId === source.site.id ? state.publication : null },
    sitePublicationValidation: { findUnique: async ({ where }) => {
      stats.fullSource++;
      return where.id === state.publication.validationId ? { sourceSnapshot: state.source } : null;
    } },
    $queryRaw: async sql => {
      stats.sourceProjection++;
      assert.ok(sql.values.includes(state.publication.validationId));
      assert.ok(sql.values.includes(source.site.id));
      const editorial = state.source.editorial;
      if (!editorial) return [{ editorial: null }];
      if (sql.text.includes("'notFound', source.editorial -> 'notFound'")) return [{ editorial: { notFound: editorial.notFound } }];
      const detailId = sql.values[0];
      const articles = editorial.articles.map(item => {
        if (item.id === detailId) return item;
        const { id, slug, revision, categoryId, publishedDate, title, summary, cover } = item;
        return { id, slug, revision, categoryId, publishedDate, title, summary, cover };
      });
      return [{ editorial: { ...editorial, media: undefined, articles, notFound: null } }];
    },
    newsArticle: { findFirst: async ({ where }) => where.siteId === source.site.id && where.id === working.id ? working : null },
    newsCategory: { findFirst: async ({ where }) => where.siteId === source.site.id && where.id === draftCategory.id ? draftCategory : null },
    editorialSettings: { findUnique: async ({ where }) => where.siteId_kind.siteId === source.site.id ? settings[where.siteId_kind.kind] : null },
    mediaAsset: { findMany: async ({ where }) => {
      assert.equal(where.siteId, source.site.id);
      assert.equal(where.ready, true);
      stats.batches.push(where.id.in);
      return where.id.in.flatMap(id => assets.has(id) ? [{ id, derivatives: assets.get(id) }] : []);
    } },
  };
  const store = new EditorialStoreService(prisma);
  const catalog = new SiteCatalogService(prisma);
  state.publication.catalog = catalog.renderSource(source);
  const render = catalog.renderSource.bind(catalog);
  catalog.renderSource = (...args) => { stats.render++; return render(...args); };
  const registry = new EditorialMediaRegistryService(new EditorialMediaService(prisma));
  const publications = new EditorialPublicationService(prisma, store, catalog, registry, {});
  return { ...state, state, store, publications, prisma };
}

test('guarded editorial preview uses exactly the selected surface and renders the same document', async () => {
  const { source, assets, working, publication, state, store, publications, stats } = fixture();
  class Fixture {}
  Module({
    controllers: [AdminNewsController, AdminNewsCategoriesController, AdminEditorialSettingsController],
    providers: [
      { provide: EditorialStoreService, useValue: store },
      { provide: EditorialPublicationService, useValue: publications },
      AdminTokenGuard,
      { provide: AuthService, useValue: { getUserByToken: async token => token === 'fixture-session' ? { id: 'editor' } : null } },
    ],
  })(Fixture);
  const app = await NestFactory.create(Fixture, new FastifyAdapter(), { logger: false, abortOnError: false });
  await app.register(apiRequire('@fastify/cookie'));
  app.setGlobalPrefix('api/v1');
  await app.init();
  const server = app.getHttpAdapter().getInstance();
  await server.ready();
  const prefix = '/api/v1/admin/sites/' + source.site.id;
  const article = '/news/' + working.id + '/preview';
  const request = (path, payload, authenticated = true) => server.inject({
    method: 'POST', url: prefix + path, payload,
    ...(authenticated ? { headers: { cookie: ADMIN_SESSION_COOKIE + '=fixture-session' } } : {}),
  });
  try {
    assert.equal((await request(article, { expectedRevision: 2, surface: 'article' }, false)).statusCode, 401);
    assert.equal((await request(article, { expectedRevision: 1, surface: 'article' })).statusCode, 409);
    assert.equal((await request(article, { expectedRevision: 2, surface: 'missing' })).statusCode, 400);
    assert.equal(stats.sourceProjection, 0);

    async function equivalent(path, mode, surface) {
      const input = { expectedRevision: 2, mode };
      const before = await request(path, input);
      const renders = stats.render, fullReads = stats.fullSource;
      stats.batches.length = 0;
      const after = await request(path, { ...input, surface });
      assert.equal(before.statusCode, 201, before.body);
      assert.equal(after.statusCode, 201, after.body);
      const oldPayload = before.json(), payload = after.json();
      if (!oldPayload.available) {
        assert.deepEqual(payload, oldPayload);
        return payload;
      }
      const oldDocument = editorialPreviewDocument(oldPayload, surface, '', {});
      const newDocument = editorialPreviewDocument(payload, surface, '', {});
      assert.deepEqual(newDocument, oldDocument);
      for (const key of ['mode', 'kind', 'entityId', 'revision', 'selectedRevision', 'publicationId']) {
        assert.equal(payload[key], oldPayload[key]);
      }
      const media = document => Object.fromEntries(Object.entries(document.mediaRequests).filter(([path]) => newDocument.document.includes(path)));
      assert.deepEqual(payload.mediaRequests, media(oldPayload));
      assert.equal(stats.render, renders);
      assert.equal(stats.fullSource, fullReads);
      assert.equal(payload.catalog.cities.some(city => city.tariffs || city.pages), false);
      assert.ok(after.body.length < before.body.length);
      assert.doesNotMatch(newDocument.document, /\shref=|<script\b/);
      return payload;
    }

    for (const mode of ['draft', 'published']) {
      const detail = await equivalent(article, mode, 'article');
      assert.equal(detail.editorial.articles.length, 4);
      assert.ok(detail.editorial.articles[0].body);
      assert.ok(detail.editorial.articles.slice(1).every(article => !article.body));
      assert.equal(stats.batches[0].length, 4);
      assert.equal(Object.keys(detail.mediaRequests).length, 5);
      if (mode === 'draft') assert.match(detail.view.notice, /адрес используется/);
      const list = await equivalent(article, mode, 'list');
      assert.equal(list.view.page, 3);
      assert.equal(list.view.total, 30);
      assert.ok(list.editorial.articles.every(article => !article.body));
      const home = await equivalent(article, mode, 'home');
      assert.equal(home.editorial.articles.length, 3);
      assert.match(home.view.notice, /не входит в три последних/);
      await equivalent('/news/categories/new-category/preview', mode, 'list');
      await equivalent('/editorial/news/preview', mode, 'list');
      const notFound = await equivalent('/editorial/not-found/preview', mode, 'list');
      assert.deepEqual(notFound.mediaRequests, {});
      assert.deepEqual(stats.batches, []);
    }

    // Historical catalog with no explicit shell settings is rendered from the same frozen validation.
    delete publication.catalog.site.publicDisplay;
    const legacy = await request(article, { expectedRevision: 2, mode: 'published' });
    const history = await request(article, { expectedRevision: 2, mode: 'published', surface: 'article' });
    assert.equal(history.statusCode, 201, history.body);
    assert.equal(history.json().publicationId, publication.id);
    assert.deepEqual(editorialPreviewDocument(history.json(), 'article', '', {}), editorialPreviewDocument(legacy.json(), 'article', '', {}));
    assert.equal(history.json().catalog.cities.some(city => city.tariffs || city.pages), false);

    state.source = publicationSource();
    const old404 = await request('/editorial/not-found/preview', { expectedRevision: 2, mode: 'published' });
    const historical404 = await request('/editorial/not-found/preview', { expectedRevision: 2, mode: 'published', surface: 'list' });
    assert.equal(historical404.statusCode, 201, historical404.body);
    assert.deepEqual(editorialPreviewDocument(historical404.json(), 'list', '', {}), editorialPreviewDocument(old404.json(), 'list', '', {}));
    state.source = source;

    assets.delete('news-29');
    assert.equal((await request(article, { expectedRevision: 2, surface: 'article' })).statusCode, 201);
    assets.delete(working.id);
    assert.equal((await request(article, { expectedRevision: 2, surface: 'article' })).statusCode, 404);
  } finally { await app.close(); }
});

test('targeted preview pins the active publication and rejects an unconfirmed catalog', async t => {
  const { source, working, publication, publications, prisma, stats } = fixture();
  Object.assign(publication, { status: 'RUNNING', siteRevision: 6, releaseSequence: 8 });
  prisma.sitePublication.findUnique = async ({ where }) => where.id === publication.id ? publication : null;
  prisma.sitePublication.findFirst = async () => assert.fail('A newer SQL publication must not replace the active one');
  const env = {
    REBUILD_PROVIDER: 'static', STATIC_PUBLICATION_URL: 'http://controller.invalid', ADMIN_API_TOKEN: 'fixture-preview-controller',
  };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const identity = {
    publicationId: publication.id, siteId: source.site.id, siteSlug: source.site.slug,
    siteRevision: publication.siteRevision, releaseSequence: publication.releaseSequence,
    catalogDigest: hash(JSON.stringify(publication.catalog)),
  };
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, 'http://controller.invalid/active');
    assert.equal(request.headers['x-admin-token'], env.ADMIN_API_TOKEN);
    return Response.json(identity);
  });
  const live = await publications.preview(source.site.id, 'ARTICLE', working.id, 2, 'published', 'article');
  assert.equal(live.publicationId, publication.id);
  assert.equal(live.selectedRevision, 1);
  assert.equal(stats.sourceProjection, 1);
  assert.equal(stats.fullSource, 0);

  identity.catalogDigest = '0'.repeat(64);
  await assert.rejects(publications.preview(source.site.id, 'ARTICLE', working.id, 2, 'published', 'article'), { status: 503 });
  assert.equal(stats.sourceProjection, 1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { firstValueFrom, defer } = require('../apps/api/node_modules/rxjs');

test('Nest HTTP catalog and quotes honor each serving context and reject a machine token as proxy proof', async () => {
  const { createServer } = require('node:http');
  const { Module } = require('../apps/api/node_modules/@nestjs/common');
  const { NestFactory } = require('../apps/api/node_modules/@nestjs/core');
  const { FastifyAdapter } = require('../apps/api/node_modules/@nestjs/platform-fastify');
  const { CitiesController } = require('../apps/api/dist/cities.controller.js');
  const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
  const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
  const { ServingPublicationInterceptor, derivePublicationProxyToken } = require('../apps/api/dist/serving-publication-context.js');
  const previous = { provider: process.env.REBUILD_PROVIDER, token: process.env.ADMIN_API_TOKEN, url: process.env.STATIC_PUBLICATION_URL };
  process.env.REBUILD_PROVIDER = 'static'; process.env.ADMIN_API_TOKEN = 's'.repeat(32);
  const publications = new Map(['pub-a', 'pub-b'].map((id, index) => [id, { id, siteId: 'site-1', siteRevision: 7 + index, status: 'RUNNING',
    catalog: { site: { slug: 'domru-site' }, marker: id, cities: [{ slug: 'kazan', name: id, tariffs: [{ id: 'tariff-1', slug: 'tariff', name: id,
      standardPrice: String(900 + 100 * index), connectionFee: '0', attributes: {} }] }] } }]));
  let activeReads = 0;
  const controller = createServer((request, response) => {
    assert.equal(request.headers['x-admin-token'], process.env.ADMIN_API_TOKEN); activeReads++;
    const publication = publications.get('pub-a');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ publicationId: publication.id, siteId: publication.siteId, siteSlug: 'domru-site', siteRevision: publication.siteRevision,
      catalogDigest: createHash('sha256').update(JSON.stringify(publication.catalog)).digest('hex') }));
  });
  let app;
  try {
    await new Promise(resolve => controller.listen(0, '127.0.0.1', resolve));
    process.env.STATIC_PUBLICATION_URL = `http://127.0.0.1:${controller.address().port}`;
    const catalogReads = [], projectionReads = [];
    const client = {
      sitePublication: {
        findUnique: async ({ where }) => {
          catalogReads.push(where.id);
          await new Promise(resolve => setTimeout(resolve, 5));
          return publications.get(where.id);
        },
        findFirst: async () => { throw new Error('No SQL latest fallback'); },
      },
      $queryRaw: async query => {
        const [citySlug, publicationId] = query.values.slice(-2);
        const tariffSlug = query.values.length === 3 ? query.values[0] : undefined;
        projectionReads.push({ citySlug, publicationId, tariffSlug });
        const publication = publications.get(publicationId);
        if (!publication) return [];
        const city = publication.catalog.cities.find(item => item.slug === citySlug);
        const value = tariffSlug === undefined ? city : city?.tariffs.find(item => item.slug === tariffSlug);
        return [{
          status: publication.status, siteId: publication.siteId, siteRevision: publication.siteRevision,
          catalogSiteSlug: publication.catalog.site.slug, cityFound: Boolean(city), value: value ?? null,
        }];
      },
    };
    class ServingTestModule {}
    Module({ controllers: [CitiesController], providers: [
      { provide: SiteCatalogService, useValue: {} },
      { provide: PublicationWorkflowService, useValue: new PublicationWorkflowService(client, {}) },
    ] })(ServingTestModule);
    app = await NestFactory.create(ServingTestModule, new FastifyAdapter(), { logger: false });
    app.useGlobalInterceptors(new ServingPublicationInterceptor()); app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1/public/sites/domru-site/cities`;
    const headers = id => ({ 'x-site-publication-id': id, 'x-site-publication-token': derivePublicationProxyToken(process.env.ADMIN_API_TOKEN) });
    const results = await Promise.all(['pub-a', 'pub-b'].map(async id => {
      const response = await fetch(base, { headers: headers(id) }); assert.equal(response.status, 200); return (await response.json()).marker;
    }));
    assert.deepEqual(results, ['pub-a', 'pub-b']); assert.equal(activeReads, 0);
    catalogReads.length = 0;
    const cityResults = await Promise.all(['pub-a', 'pub-b'].map(async id => {
      const response = await fetch(`${base}/kazan`, { headers: headers(id) });
      assert.equal(response.status, 200);
      return response.json();
    }));
    assert.deepEqual(cityResults, ['pub-a', 'pub-b'].map(id => publications.get(id).catalog.cities[0]));
    const quote = await fetch(`${base}/kazan/tariffs/tariff/quote`, { method: 'POST', headers: { ...headers('pub-b'), 'content-type': 'application/json' }, body: '{}' });
    assert.equal(quote.status, 200); assert.equal((await quote.json()).totals.monthly, 1000);
    assert.deepEqual(catalogReads, []);
    assert.equal(projectionReads.length, 3);
    assert.deepEqual(projectionReads.at(-1), { citySlug: 'kazan', publicationId: 'pub-b', tariffSlug: 'tariff' });
    assert.equal(activeReads, 0);

    publications.get('pub-a').status = 'SUCCEEDED';
    const rolledBack = await fetch(`${base}/kazan`, { headers: headers('pub-a') });
    assert.equal(rolledBack.status, 200); assert.equal((await rolledBack.json()).name, 'pub-a');
    publications.get('pub-b').status = 'FAILED';
    assert.equal((await fetch(`${base}/kazan`, { headers: headers('pub-b') })).status, 503);
    assert.equal((await fetch(`${base}/kazan`, { headers: headers('missing-publication') })).status, 503);
    assert.equal((await fetch(`${base}/missing-city`, { headers: headers('pub-a') })).status, 404);
    assert.equal((await fetch(base.replace('domru-site', 'foreign-site') + '/kazan', { headers: headers('pub-a') })).status, 404);
    assert.deepEqual(catalogReads, []);
    const projectionCount = projectionReads.length;
    const spoof = await fetch(`${base}/kazan`, { headers: { 'x-site-publication-id': 'pub-b', 'x-site-publication-token': process.env.ADMIN_API_TOKEN } });
    assert.equal(spoof.status, 200); assert.equal((await spoof.json()).name, 'pub-a'); assert.equal(activeReads, 1);
    assert.equal(projectionReads.length, projectionCount);
    assert.deepEqual(catalogReads, ['pub-a']);
  } finally {
    await app?.close(); await new Promise(resolve => controller.close(resolve));
    for (const [key, value] of [['REBUILD_PROVIDER', previous.provider], ['ADMIN_API_TOKEN', previous.token], ['STATIC_PUBLICATION_URL', previous.url]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('request context isolates simultaneous trusted Caddy publications and never reads the latest SQL snapshot', async () => {
  const { ServingPublicationInterceptor, derivePublicationProxyToken, servingPublication } = require('../apps/api/dist/serving-publication-context.js');
  const previousProvider = process.env.REBUILD_PROVIDER; const previousToken = process.env.ADMIN_API_TOKEN;
  process.env.REBUILD_PROVIDER = 'static'; process.env.ADMIN_API_TOKEN = 's'.repeat(32);
  try {
    const publications = new Map(['pub-a', 'pub-b'].map(id => [id, { id, siteId: 'site-1', siteRevision: 7, status: 'RUNNING', catalog: { site: { slug: 'domru-site' }, marker: id } }]));
    const client = { sitePublication: { findUnique: async ({ where }) => publications.get(where.id), findFirst: async () => { throw new Error('No latest SQL lookup is allowed'); } } };
    const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
    const workflow = new PublicationWorkflowService(client, {});
    const interceptor = new ServingPublicationInterceptor();
    const read = id => firstValueFrom(interceptor.intercept({ switchToHttp: () => ({ getRequest: () => ({ headers: {
      'x-site-publication-id': id, 'x-site-publication-token': derivePublicationProxyToken(process.env.ADMIN_API_TOKEN),
    } }) }) }, { handle: () => defer(async () => { await new Promise(resolve => setTimeout(resolve, id === 'pub-a' ? 15 : 1));
      assert.equal((await servingPublication(client, 'domru-site')).catalog.marker, id);
      return (await workflow.getPublishedCatalog('domru-site')).marker; }) }));
    assert.deepEqual(await Promise.all([read('pub-a'), read('pub-b')]), ['pub-a', 'pub-b']);
  } finally {
    if (previousProvider === undefined) delete process.env.REBUILD_PROVIDER; else process.env.REBUILD_PROVIDER = previousProvider;
    if (previousToken === undefined) delete process.env.ADMIN_API_TOKEN; else process.env.ADMIN_API_TOKEN = previousToken;
  }
});

test('direct and spoofed requests read actual controller state; unavailable or inconsistent serving fails closed', async () => {
  const { ServingPublicationInterceptor, servingPublication } = require('../apps/api/dist/serving-publication-context.js');
  const previous = { fetch: global.fetch, provider: process.env.REBUILD_PROVIDER, token: process.env.ADMIN_API_TOKEN, url: process.env.STATIC_PUBLICATION_URL };
  process.env.REBUILD_PROVIDER = 'static'; process.env.ADMIN_API_TOKEN = 's'.repeat(32); process.env.STATIC_PUBLICATION_URL = 'http://web:8081';
  const catalog = { site: { slug: 'domru-site' }, marker: 'actually served A' };
  const publication = { id: 'pub-a', siteId: 'site-1', siteRevision: 7, status: 'RUNNING', catalog };
  const active = { publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7, catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') };
  const client = { sitePublication: { findUnique: async ({ where }) => where.id === 'pub-a' ? publication : null, findFirst: async () => { throw new Error('Must not fall back to SQL'); } } };
  try {
    global.fetch = async (url, options) => { assert.equal(url, 'http://web:8081/active'); assert.equal(options.headers['x-admin-token'], process.env.ADMIN_API_TOKEN); return Response.json(active); };
    const interceptor = new ServingPublicationInterceptor();
    const spoofed = interceptor.intercept({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-site-publication-id': 'pub-b', 'x-site-publication-token': 'spoofed' } }) }) }, { handle: () => defer(async () => (await servingPublication(client, 'domru-site')).catalog.marker) });
    assert.equal(await firstValueFrom(spoofed), 'actually served A');
    active.catalogDigest = '0'.repeat(64);
    await assert.rejects(servingPublication(client, 'domru-site'), error => error.getStatus() === 503);
    global.fetch = async () => Response.json({ status: 'UNCERTAIN' }, { status: 202 });
    await assert.rejects(servingPublication(client, 'domru-site'), error => error.getStatus() === 503);
    global.fetch = async () => { throw new Error('Controller down'); };
    await assert.rejects(servingPublication(client, 'domru-site'), error => error.getStatus() === 503);
    process.env.REBUILD_PROVIDER = 'coolify';
    assert.equal(await servingPublication(client, 'domru-site'), null);
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [['REBUILD_PROVIDER', previous.provider], ['ADMIN_API_TOKEN', previous.token], ['STATIC_PUBLICATION_URL', previous.url]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('admin variable values and usages wait for SQL ACK while Caddy can serve RUNNING', async () => {
  const { createServer } = require('node:http');
  const { AdminVariableCatalogController } = require('../apps/api/dist/admin-variable-catalog.controller.js');
  const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
  const keys = ['REBUILD_PROVIDER', 'ADMIN_API_TOKEN', 'STATIC_PUBLICATION_URL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const site = { id: 'site-1', slug: 'domru-site', status: 'PUBLISHED', workingRevision: 8, publishedRevision: 7 };
  const snapshots = [
    { id: 'older', releaseSequence: 10, siteRevision: 7, status: 'SUCCEEDED', phone: '78002222222', usageCount: 1 },
    { id: 'confirmed', releaseSequence: 11, siteRevision: 7, status: 'SUCCEEDED', phone: '78003333333', usageCount: 2 },
    { id: 'serving', releaseSequence: 12, siteRevision: 7, status: 'RUNNING', phone: '78004444444', usageCount: 3 },
  ];
  for (const snapshot of snapshots) {
    snapshot.siteId = site.id;
    snapshot.catalog = { site: { slug: site.slug, connectionPhone: snapshot.phone }, cities: [], variableUsageVersion: 2 };
  }
  const running = snapshots.at(-1);
  const fakeCaddy = createServer((request, response) => {
    assert.equal(request.url, '/active');
    assert.equal(request.headers['x-admin-token'], process.env.ADMIN_API_TOKEN);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      publicationId: running.id, siteId: site.id, siteSlug: site.slug, siteRevision: running.siteRevision,
      releaseSequence: running.releaseSequence, catalogDigest: createHash('sha256').update(JSON.stringify(running.catalog)).digest('hex'),
    }));
  });
  const workflow = new PublicationWorkflowService({
    $transaction: async cb => cb({
      site: { findUnique: async () => ({ ...site, provider: { name: 'Дом.ру' } }) },
      city: { findMany: async () => [] },
    }),
    sitePublication: { findUnique: async ({ where }) => snapshots.find(item => item.id === where.id) },
    $queryRaw: async query => {
      assert.match(query.sql, /p.status = 'SUCCEEDED'/);
      assert.match(query.sql, /ORDER BY p."releaseSequence" DESC LIMIT 1/);
      const row = snapshots.filter(item => item.status === 'SUCCEEDED').at(-1);
      if (query.sql.includes('AS catalog')) {
        return [{ catalog: { ...row.catalog, publicationId: row.id, publishedUsageAvailable: true } }];
      }
      return [{ publicationId: row.id, data: { counts: { CONNECTION_PHONE: row.usageCount } } }];
    },
  }, {});
  const controller = new AdminVariableCatalogController(workflow, { list: async () => [] });
  const evidence = id => controller.usage(site.id, { workingRevision: '8', publishedPublicationId: id });
  try {
    await new Promise(resolve => fakeCaddy.listen(0, '127.0.0.1', resolve));
    process.env.REBUILD_PROVIDER = 'static';
    process.env.ADMIN_API_TOKEN = 'fixture-token';
    process.env.STATIC_PUBLICATION_URL = `http://127.0.0.1:${fakeCaddy.address().port}`;
    const active = await workflow.getPublishedCatalog(site.slug);
    assert.equal(active.site.connectionPhone, running.phone);
    const beforeAck = await controller.values(site.id);
    assert.equal(beforeAck.publishedRevision, 7);
    assert.equal(beforeAck.publishedPublicationId, 'confirmed');
    assert.equal(beforeAck.items.find(item => item.code === 'CONNECTION_PHONE').published.value, '+7 (800) 333-33-33');
    assert.equal((await evidence('confirmed')).publishedCounts.CONNECTION_PHONE, 2);
    await assert.rejects(evidence('older'), error => error.getStatus() === 409);
    await assert.rejects(evidence('serving'), error => error.getStatus() === 409);

    running.status = 'SUCCEEDED';
    const afterAck = await controller.values(site.id);
    assert.equal(afterAck.publishedRevision, 7);
    assert.equal(afterAck.publishedPublicationId, 'serving');
    assert.equal(afterAck.items.find(item => item.code === 'CONNECTION_PHONE').published.value, '+7 (800) 444-44-44');
    assert.equal((await evidence('serving')).publishedCounts.CONNECTION_PHONE, 3);
    await assert.rejects(evidence('confirmed'), error => error.getStatus() === 409);
  } finally {
    await new Promise(resolve => fakeCaddy.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('a stored projection checks the active digest and falls back only to the same captured publication', async () => {
  const { servingCityProjection } = require('../apps/api/dist/serving-publication-context.js');
  const previous = Object.fromEntries(['REBUILD_PROVIDER', 'ADMIN_API_TOKEN', 'STATIC_PUBLICATION_URL', 'SERVING_CATALOG_PROJECTIONS_ENABLED']
    .map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  Object.assign(process.env, {
    REBUILD_PROVIDER: 'static', ADMIN_API_TOKEN: 'fixture-token', STATIC_PUBLICATION_URL: 'http://web:8081',
    SERVING_CATALOG_PROJECTIONS_ENABLED: 'true',
  });
  const city = { id: 'city-a', slug: 'kazan', name: 'Published city' };
  const catalog = { site: { slug: 'domru-site' }, cities: [city] };
  const publication = { id: 'pub-a', siteId: 'site-1', siteRevision: 7, releaseSequence: 9, status: 'RUNNING', catalog };
  const digest = createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
  let activeReads = 0, fullReads = 0;
  let projection = { ...publication, catalogSiteSlug: 'domru-site', digest, complete: false,
    data: { cityFound: false, value: null } };
  const client = {
    $queryRaw: async query => {
      assert.equal(query.values.at(-1), 'pub-a');
      return [projection];
    },
    sitePublication: { findUnique: async ({ where }) => {
      assert.equal(where.id, 'pub-a');
      fullReads++;
      return publication;
    } },
  };
  try {
    global.fetch = async () => {
      activeReads++;
      return Response.json({
        publicationId: 'pub-a', siteId: publication.siteId, siteSlug: 'domru-site',
        siteRevision: publication.siteRevision, releaseSequence: publication.releaseSequence, catalogDigest: digest,
      });
    };
    const incomplete = await servingCityProjection(client, 'domru-site', city.slug);
    assert.deepEqual(incomplete, { cityFound: true, value: city });
    assert.equal(fullReads, 1);
    assert.equal(activeReads, 1);

    projection = { ...projection, digest: '0'.repeat(64) };
    await assert.rejects(servingCityProjection(client, 'domru-site', city.slug), error => error.getStatus() === 503);
    assert.equal(fullReads, 1);

    projection = { ...projection, digest, complete: true, data: { cityFound: true, value: city } };
    assert.deepEqual(await servingCityProjection(client, 'domru-site', city.slug), projection.data);
    assert.equal(fullReads, 1);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

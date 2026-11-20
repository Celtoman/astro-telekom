import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [baselineRoot, output = 'editorial-settings-ab.json', pairsText = '30'] = process.argv.slice(2);
const pairs = Number(pairsText);
assert.ok(baselineRoot && Number.isSafeInteger(pairs) && pairs >= 30);
const db = new URL(process.env.DATABASE_URL);
assert.ok(['postgresql:', 'postgres:'].includes(db.protocol) && ['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/editorial_settings_ab'
  && db.username === 'postgres' && !db.search && !db.hash, 'Use a fresh loopback editorial_settings_ab database');
Object.assign(process.env, {
  REBUILD_PROVIDER: 'static', SERVING_CATALOG_PROJECTIONS_ENABLED: 'true',
  ADMIN_API_TOKEN: 'editorial-settings-rehearsal', PUBLIC_SITE_URL: '',
});

function load(root) {
  const require = createRequire(resolve(root, 'apps/api/package.json'));
  const { PrismaService } = require('./dist/prisma.service.js');
  const { EditorialStoreService } = require('./dist/editorial-store.service.js');
  const { EditorialPublicationService } = require('./dist/editorial-publication.service.js');
  const { AdminEditorialSettingsController } = require('./dist/admin-editorial-settings.controller.js');
  const { catalogDigest, prepareServingCatalogProjection } = require('./dist/serving-catalog-projection.js');
  const { newsSettingsDefaults, notFoundDefaults } = require('./dist/news-model.js');
  const prisma = new PrismaService();
  const store = new EditorialStoreService(prisma);
  const controller = new AdminEditorialSettingsController(store, new EditorialPublicationService(prisma, store));
  return { prisma, controller, catalogDigest, prepareServingCatalogProjection, newsSettingsDefaults, notFoundDefaults };
}
const candidate = load('.'), baseline = load(baselineRoot);
const { prisma, catalogDigest, prepareServingCatalogProjection } = candidate;
const site = { id: 'fixture-site', slug: 'fixture-site', domain: 'working.example' };
const working = { news: candidate.newsSettingsDefaults(), 'not-found': candidate.notFoundDefaults() };
const kinds = ['news', 'not-found'];
const kindsDb = { news: 'NEWS_SETTINGS', 'not-found': 'NOT_FOUND' };
const sha = value => createHash('sha256').update(value).digest('hex');
let active, requests = 0;
const controller = createServer((request, response) => {
  if (request.url !== '/active' || request.headers['x-admin-token'] !== process.env.ADMIN_API_TOKEN || !active) {
    response.writeHead(503).end();
    return;
  }
  requests++;
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(active));
});
controller.listen(0, '127.0.0.1');
await once(controller, 'listening');
process.env.STATIC_PUBLICATION_URL = 'http://127.0.0.1:' + controller.address().port;

const fixtureText = key => Array.from({ length: 56 }, (_, part) => sha(key + '/' + part)).join('');
const cities = Array.from({ length: 207 }, (_, city) => ({
  id: 'city-' + city, slug: 'city-' + city, name: 'Город ' + city, region: { name: 'Регион ' + city % 10 },
  pages: [{ title: 'Страница ' + city, text: fixtureText('city/' + city) }],
  tariffs: Array.from({ length: 19 }, (_, tariff) => ({
    id: 'tariff-' + city + '-' + tariff, slug: 'tariff-' + tariff, speed: 500, standardPrice: 1190,
    details: fixtureText('tariff/' + city + '/' + tariff),
  })),
}));
const editorial = {
  newsEnabled: true, settings: { ...working.news, revision: 4 },
  notFound: { ...working['not-found'], title: 'Опубликованная 404', revision: 3 },
  articles: [], categories: [],
};
const catalog = { site: { ...site, domain: 'catalog.example' }, cities, globalPages: [],
  editorial: { settings: { title: 'Только каталог' }, notFound: { title: 'Только каталог' } } };
const source = { ...catalog, site: { ...site, domain: 'source.example' }, editorial };
async function validation(siteRevision, sourceSnapshot) {
  const { id } = await prisma.sitePublicationValidation.create({
    data: { siteId: site.id, siteRevision, sourceSnapshot, report: {}, appVersion: 'fixture',
      outcome: 'PASSED', checkedUrlCount: 4399 },
    select: { id: true },
  });
  return id;
}
const params = (id, siteRevision, validationId) => ({
  id, siteId: site.id, siteRevision, scopeKey: id, triggerEntity: 'SITE', triggerEntityId: site.id, validationId,
});
const identity = row => ({ publicationId: row.id, siteId: site.id, siteSlug: site.slug, siteRevision: row.siteRevision,
  releaseSequence: row.releaseSequence, catalogDigest: catalogDigest(row.catalog) });
async function comparable(name, expected) {
  const hashes = {};
  for (const kind of kinds) {
    const original = await baseline.controller.get(site.id, kind);
    const modified = await candidate.controller.get(site.id, kind);
    assert.deepEqual(modified, original, name + '/' + kind);
    for (const [field, value] of Object.entries(expected[kind] ?? {})) assert.deepEqual(modified[field], value, name + '/' + field);
    hashes[kind] = sha(JSON.stringify(modified));
  }
  return { name, hashes };
}
function stats(samples) {
  const series = [...samples].sort((a, b) => a - b);
  return { count: series.length, p50Ms: series[Math.ceil(series.length / 2) - 1], p95Ms: series[Math.ceil(series.length * 0.95) - 1] };
}
try {
  await Promise.all([prisma.$connect(), baseline.prisma.$connect()]);
  assert.equal(await prisma.site.count(), 0, 'The fixture database must be fresh');
  const [{ version }] = await prisma.$queryRawUnsafe("SELECT current_setting('server_version') AS version");
  await prisma.site.create({ data: { ...site, name: 'Синтетический сайт', provider: { create: { slug: 'fixture', name: 'Fixture' } } } });
  await prisma.editorialSettings.createMany({ data: kinds.map(kind => ({ siteId: site.id, kind: kindsDb[kind], content: working[kind], revision: 5 })) });
  const historicalValidation = await validation(6, {
    site: source.site, cities: [], globalPages: [], editorial: { ...editorial, articles: 'historical malformed branch',
      settings: { ...working.news, revision: 2 } },
  });
  const historical = await prisma.sitePublication.create({ data: {
    ...params('history', 6, historicalValidation), catalog: { ...catalog, cities: [] }, status: 'SUCCEEDED',
  } });
  const running = await prisma.sitePublication.create({ data: {
    ...params('running', 7, await validation(7, source)), catalog, status: 'RUNNING',
  } });
  const runningIdentity = identity(running);
  active = runningIdentity;
  const seal = await prepareServingCatalogProjection(prisma, { publicationId: running.id, active });
  assert.equal(seal.state, 'ready');
  assert.equal(seal.proof.catalogDigest, runningIdentity.catalogDigest);
  const proof = [];
  const unavailable = { state: 'UNKNOWN', publishedAvailable: false, publicUrl: null, published: null, publishedRevision: null };
  const runningOutput = { news: { state: 'PUBLISHED', publishedRevision: 4, publicUrl: 'https://source.example/news' },
    'not-found': { state: 'CHANGED', publishedRevision: 3, publicUrl: null } };
  proof.push(await comparable('running_before_ack', runningOutput));
  process.env.SERVING_CATALOG_PROJECTIONS_ENABLED = 'false';
  proof.push(await comparable('projection_disabled', runningOutput));
  process.env.SERVING_CATALOG_PROJECTIONS_ENABLED = 'true';
  active = { ...runningIdentity, catalogDigest: '0'.repeat(64) };
  proof.push(await comparable('wrong_digest', { news: unavailable, 'not-found': unavailable }));
  active = null;
  proof.push(await comparable('missing_active', { news: unavailable, 'not-found': unavailable }));
  active = identity(historical);
  const historicalOutput = { news: { state: 'PUBLISHED', publishedRevision: 2, publicUrl: 'https://source.example/news' } };
  proof.push(await comparable('historical_without_seal', historicalOutput));
  assert.equal((await prepareServingCatalogProjection(prisma, { publicationId: historical.id, active })).state, 'ready');
  proof.push(await comparable('historical_malformed_source_with_seal', historicalOutput));
  process.env.REBUILD_PROVIDER = 'webhook';
  proof.push(await comparable('legacy_sql_history', historicalOutput));
  process.env.REBUILD_PROVIDER = 'static';

  active = runningIdentity;
  for (let i = 0; i < 3; i++) await comparable('warmup', {});
  const samples = Object.fromEntries(kinds.map(kind => [kind, { baseline: [], candidate: [] }]));
  for (let i = 0; i < pairs; i++) {
    for (const kind of i % 2 === 0 ? kinds : [...kinds].reverse()) {
      const results = {};
      for (const [key, arm] of i % 2 === 0 ? [['baseline', baseline], ['candidate', candidate]]
        : [['candidate', candidate], ['baseline', baseline]]) {
        const start = performance.now();
        results[key] = await arm.controller.get(site.id, kind);
        samples[kind][key].push(performance.now() - start);
      }
      assert.deepEqual(results.baseline, results.candidate, 'paired comparison ' + kind + '/' + i);
    }
  }
  const cityPart = cities[2];
  await prisma.sitePublicationCityProjection.delete({ where: { publicationId_citySlug: { publicationId: running.id, citySlug: cityPart.slug } } });
  proof.push(await comparable('incomplete_seal', { news: { publishedRevision: 4 }, 'not-found': { publishedRevision: 3 } }));
  const nextValidation = await validation(7, { ...source, cities: [],
    editorial: { newsEnabled: false, notFound: editorial.notFound } });
  const replacement = await prisma.sitePublication.update({ where: { id: running.id }, data: {
    catalog: { ...catalog, cities: [], replacement: true }, validationId: nextValidation,
  } });
  assert.equal(replacement.catalogGeneration, running.catalogGeneration + 1);
  proof.push(await comparable('same_id_old_digest', { news: unavailable, 'not-found': unavailable }));
  active = identity(replacement);
  assert.equal((await prepareServingCatalogProjection(prisma, { publicationId: running.id, active })).state, 'ready');
  proof.push(await comparable('same_id_replacement', { news: { state: 'DRAFT', publishedAvailable: true,
    published: null, publishedRevision: null, publicUrl: null }, 'not-found': { publishedRevision: 3 } }));
  active = identity(historical);
  proof.push(await comparable('rollback_to_history', historicalOutput));

  const report = {
    runtime: process.version, postgres: version, fixture: { cities: cities.length, tariffs: cities.length * 19,
      catalogBytes: Buffer.byteLength(JSON.stringify(catalog)), sourceBytes: Buffer.byteLength(JSON.stringify(source)) },
    pairsPerRoute: pairs, controllerRequests: requests, proof,
    summary: Object.fromEntries(kinds.map(kind => [kind, Object.fromEntries(Object.entries(samples[kind]).map(([key, times]) => [key, stats(times)]))])),
    samples,
  };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
} finally {
  await Promise.all([prisma.onModuleDestroy(), baseline.prisma.onModuleDestroy()]);
  controller.closeAllConnections();
  await new Promise(resolveClose => controller.close(resolveClose));
}

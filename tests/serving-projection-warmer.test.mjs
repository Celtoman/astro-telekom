import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const load = name => require(`../apps/api/dist/${name}.js`);
const { PrismaService } = load('prisma.service');
const { PublicationWorkflowService } = load('publication-workflow.service');
const { catalogDigest, prepareServingCatalogProjection, readServingProjectionState } = load('serving-catalog-projection');
const { discoverServingProjectionTargets } = load('serving-projection-warmer');
const { servingCityProjection } = load('serving-publication-context');

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}

async function until(predicate, message, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  assert.fail(message);
}

function deferAfterCityStaging(db) {
  const staged = Promise.withResolvers();
  const resume = Promise.withResolvers();
  return {
    staged: staged.promise,
    release: resume.resolve,
    db: {
      $queryRaw: db.$queryRaw.bind(db),
      $transaction: (callback, options) => db.$transaction(tx => callback(new Proxy(tx, {
        get(target, field) {
          if (field !== '$executeRaw') return Reflect.get(target, field);
          return async (parts, ...values) => {
            const result = await target.$executeRaw(parts, ...values);
            if (parts[0].includes('INSERT INTO pg_temp.serving_catalog_warm_cities')) {
              staged.resolve();
              await resume.promise;
            }
            return result;
          };
        },
      })), options),
    },
  };
}

const makeCatalog = price => ({
  site: { slug: 'warmer' }, globalPages: [], redirects: [], routes: [{ path: '/sample', kind: 'CITY_HOME' }],
  cities: [{ id: 'sample-city', name: 'Город', slug: 'sample', region: { name: 'Регион' },
    pages: [], tariffs: [{ id: 'sample-tariff', slug: 'internet', standardPrice: price }] }],
});

test('serving warmer discovers durable exact IDs and leases, avoids locking ACK during capture, and invalidates on same-ID retry', { timeout: 120_000 }, async () => {
  const container = `astro-serving-warmer-${randomUUID().slice(0, 8)}`;
  const token = 'synthetic-serving-projection-warmer-token';
  let db, server, runner, stopStaging;
  let active;
  let output = '';
  try {
    docker(['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
    await until(() => docker(['logs', container]).includes('PostgreSQL init process complete'), 'PostgreSQL init timeout', 30_000);
    const port = Number(docker(['port', container, '5432/tcp']).match(/:(\d+)\s*$/)[1]);
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/provider`;
    const migrations = spawnSync('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], {
      env: process.env, encoding: 'utf8', timeout: 60_000, shell: process.platform === 'win32', windowsHide: true,
    });
    assert.equal(migrations.status, 0, migrations.stderr || migrations.stdout || String(migrations.error));
    db = new PrismaService();
    await db.onModuleInit();
    await db.provider.create({ data: { id: 'warm-provider', name: 'Synthetic', slug: 'warm-provider', settings: {} } });
    const site = await db.site.create({ data: { id: 'warm-site', slug: 'warmer', name: 'Synthetic', domain: 'warmer.example.test',
      providerId: 'warm-provider', status: 'PUBLISHED', workingRevision: 3, publishedRevision: 1, settings: {} } });
    const createPublication = (id, siteRevision, status, price) => db.sitePublication.create({ data: {
      id, siteId: site.id, siteRevision, status, catalog: makeCatalog(price), triggerEntity: 'site', triggerEntityId: site.id,
    } });
    const historical = await createPublication('historical', 1, 'SUCCEEDED', 400);
    const processing = await createPublication('processing', 2, 'RUNNING', 500);
    const requested = await createPublication('requested', 3, 'PENDING', 600);
    await createPublication('unrelated-failed', 4, 'FAILED', 999);
    await db.siteRebuild.create({ data: { id: 'warm-rebuild', siteId: site.id, dedupeKey: `site:${site.id}`, status: 'RETRYING',
      affectedPaths: [], triggerEntity: 'site', triggerEntityId: site.id, requestedRevision: 3, processingRevision: 2, publishedRevision: 1,
      requestedPublicationId: requested.id, processingPublicationId: processing.id, publishedPublicationId: historical.id } });

    const processingTarget = { publicationId: processing.id, generation: 1 };
    const requestedTarget = { publicationId: requested.id, generation: 1 };
    assert.deepEqual(await discoverServingProjectionTargets(db), [processingTarget]);
    assert.deepEqual(await discoverServingProjectionTargets(db, [processingTarget]), [requestedTarget]);
    assert.deepEqual(await discoverServingProjectionTargets(db, [processingTarget, requestedTarget]), []);

    const ackGate = deferAfterCityStaging(db);
    stopStaging = ackGate.release;
    const warming = prepareServingCatalogProjection(ackGate.db, processingTarget);
    await Promise.race([warming.then(() => assert.fail('City staging was not reached')), ackGate.staged]);
    assert.deepEqual(await prepareServingCatalogProjection(db, processingTarget), { state: 'busy' });
    const publications = new PublicationWorkflowService(db, {});
    await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
      await publications.markSucceeded(processing.id, { deploymentId: 'synthetic' }, tx);
    });
    assert.equal((await readServingProjectionState(db, processing.id)).status, 'SUCCEEDED');
    ackGate.release();
    const preparedProcessing = await warming;
    assert.equal(preparedProcessing.state, 'ready');
    assert.equal((await prepareServingCatalogProjection(db, processingTarget)).state, 'already_ready');
    assert.deepEqual(await discoverServingProjectionTargets(db), [requestedTarget]);
    await db.sitePublicationCityProjection.deleteMany({ where: { publicationId: processing.id } });
    assert.deepEqual(await discoverServingProjectionTargets(db), [processingTarget]);
    assert.equal((await prepareServingCatalogProjection(db, processingTarget)).state, 'ready');
    assert.deepEqual(await discoverServingProjectionTargets(db), [requestedTarget]);

    const retryGate = deferAfterCityStaging(db);
    stopStaging = retryGate.release;
    const racingWarm = prepareServingCatalogProjection(retryGate.db, requestedTarget);
    await Promise.race([racingWarm.then(() => assert.fail('City staging was not reached before retry')), retryGate.staged]);
    const validation = await db.sitePublicationValidation.create({ data: { siteId: site.id, siteRevision: 3,
      outcome: 'PASSED', appVersion: 'warmer-test', sourceSnapshot: {}, report: {}, checkedUrlCount: 1 } });
    const updated = await db.sitePublication.update({ where: { id: requested.id }, data: { catalog: makeCatalog(601), validationId: validation.id, status: 'RUNNING' } });
    assert.equal(updated.catalogGeneration, 2);
    retryGate.release();
    assert.deepEqual(await racingWarm, { state: 'stale' });
    assert.equal((await readServingProjectionState(db, requested.id)).catalogDigest, null);
    assert.deepEqual(await discoverServingProjectionTargets(db, [requestedTarget]), [{ publicationId: requested.id, generation: 2 }]);

    server = createServer((request, response) => {
      if (request.url !== '/active' || request.headers['x-admin-token'] !== token) {
        response.writeHead(401).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(active));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    Object.assign(process.env, { REBUILD_PROVIDER: 'static', SERVING_CATALOG_PROJECTIONS_ENABLED: 'true',
      STATIC_PUBLICATION_URL: `http://127.0.0.1:${server.address().port}`, ADMIN_API_TOKEN: token });
    const activeIdentity = publication => ({ publicationId: publication.id, siteId: site.id, siteSlug: site.slug,
      siteRevision: publication.siteRevision, releaseSequence: publication.releaseSequence, catalogDigest: catalogDigest(publication.catalog) });

    active = activeIdentity(requested);
    assert.deepEqual(await prepareServingCatalogProjection(db, { publicationId: requested.id, active }), { state: 'identity_mismatch' });
    await assert.rejects(servingCityProjection(db, site.slug, 'sample', 'internet'), { status: 503 });
    active = activeIdentity(historical);
    runner = spawn(process.execPath, [fileURLToPath(new URL('../apps/api/dist/serving-projection-warmer-main.js', import.meta.url))], {
      env: { ...process.env, SERVING_CATALOG_PROJECTION_WARMER_ENABLED: 'true' }, windowsHide: true,
    });
    runner.stdout.on('data', chunk => { output += chunk; });
    runner.stderr.on('data', chunk => { output += chunk; });
    await until(async () => {
      assert.equal(runner.exitCode, null, output);
      return (await readServingProjectionState(db, historical.id)).catalogDigest === catalogDigest(historical.catalog)
        && (await readServingProjectionState(db, requested.id)).catalogDigest === catalogDigest(updated.catalog);
    }, 'Opt-in runner did not prepare both the historical exact active ID and pending generation');
    assert.equal((await readServingProjectionState(db, requested.id)).status, 'RUNNING');
    assert.equal((await servingCityProjection(db, site.slug, 'sample', 'internet')).value.standardPrice, 400);
    active = activeIdentity(updated);
    assert.equal((await servingCityProjection(db, site.slug, 'sample', 'internet')).value.standardPrice, 601);
    active = activeIdentity(requested);
    await assert.rejects(servingCityProjection(db, site.slug, 'sample', 'internet'), { status: 503 });
    await until(() => output.includes('"publicationId":"historical"') && output.includes('"publicationId":"requested"'),
      'Opt-in warmer did not report committed readback for both exact targets');
  } finally {
    stopStaging?.();
    if (runner && runner.exitCode === null && runner.signalCode === null) {
      const stopped = new Promise(resolve => runner.once('close', resolve));
      runner.kill();
      await stopped;
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.onModuleDestroy();
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore', timeout: 10_000, windowsHide: true });
  }
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer as createPortReservation } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { StaticArtifactBuilder } from '../apps/web/scripts/publication/static-builder.mjs';
import { PublicationController, createPublicationServer } from '../apps/web/scripts/publication/publication-controller.mjs';
import { CaddyActivation } from '../apps/web/scripts/publication/caddy-activation.mjs';
import { createServingConfig } from '../apps/web/scripts/publication/serving-config.mjs';
import { runRebuildJob } from '../services/worker/src/rebuild-job.mjs';

const require = createRequire(import.meta.url);
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const workerRequire = createRequire(new URL('../services/worker/package.json', import.meta.url));
const load = name => require(`../apps/api/dist/${name}.js`);
const { PrismaService } = load('prisma.service');
const { PublicationWorkflowService } = load('publication-workflow.service');
const { SiteCatalogService } = load('site-catalog.service');
const { RebuildQueueService } = load('rebuild-queue.service');
const { SeoTemplateService } = load('seo-template.service');
const { CoverageService } = load('coverage.service');
const { DadataService } = load('dadata.service');
const { LeadDecisionService } = load('lead-decision.service');
const { LeadNotificationOutboxService } = load('lead-notification-outbox.service');
const { RedirectService } = load('redirect.service');
const { LEAD_CONSENT_VERSION } = load('lead-consent');
const { createGlobalValidationPipe } = load('security-options');
const { AdminTokenGuard } = load('admin-token.guard');
const { AuthService } = load('auth.service');
const { ServingPublicationInterceptor, derivePublicationProxyToken } = load('serving-publication-context');
const { Module } = apiRequire('@nestjs/common');
const { NestFactory } = apiRequire('@nestjs/core');
const { FastifyAdapter } = apiRequire('@nestjs/platform-fastify');
const { Queue, Worker } = workerRequire('bullmq');
const { publicationSource, city } = require('../tests/helpers/publication-source.cjs');
const suffix = randomUUID().slice(0, 8);
const postgres = `astro-static-pipeline-pg-${suffix}`;
const redis = `astro-static-pipeline-redis-${suffix}`;
const caddy = `astro-static-pipeline-caddy-${suffix}`;
const temporary = fileURLToPath(new URL('../.codex-tmp/', import.meta.url));
await mkdir(temporary, { recursive: true });
const root = await mkdtemp(join(temporary, 'astro-static-pipeline-'));
const safeRoot = await realpath(root);
const token = 'synthetic-pipeline-machine-token-'.repeat(2);
process.env.ADMIN_API_TOKEN = token; process.env.REBUILD_PROVIDER = 'static';
function docker(args, optional = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 90000 });
  if (!optional && result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout?.trim();
}
const port = (name, service) => Number(docker(['port', name, service]).match(/:(\d+)\s*$/)[1]);
async function until(predicate, message, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate().catch(() => false)) return;
    await new Promise(done => setTimeout(done, 150));
  }
  throw new Error(message);
}
async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', 'x-admin-token': token, ...options.headers }, signal: AbortSignal.timeout(30000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`API request failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}
let app, db, queue, worker, server, builder, manager, apiUrl, publicUrl, originalFailure, failed = 0, builds = 0;
try {
  // Docker assigns a new ephemeral host port on start; reserve a fixed free port
  // for this owned fixture so existing Prisma pools can reconnect after restart.
  const reservation = createPortReservation();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const postgresPort = reservation.address().port;
  await new Promise(done => reservation.close(done));
  docker(['run', '-d', '--name', postgres, '-p', `127.0.0.1:${postgresPort}:5432`, '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  await until(async () => {
    const logs = spawnSync('docker', ['logs', postgres], { encoding: 'utf8', timeout: 5000 });
    return `${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete')
      && spawnSync('docker', ['exec', postgres, 'pg_isready', '-U', 'postgres'], { timeout: 5000 }).status === 0;
  }, 'PostgreSQL did not become ready');
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port(postgres, '5432/tcp')}/provider`;
  const migrations = spawnSync('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], { env: process.env, encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32' });
  assert.equal(migrations.status, 0, migrations.stderr || migrations.stdout);
  docker(['run', '--rm', '-d', '--name', redis, '-p', '127.0.0.1::6379', 'redis:8.10.1-alpine']);
  process.env.REDIS_URL = `redis://127.0.0.1:${port(redis, '6379/tcp')}`;
  db = new PrismaService(); await db.onModuleInit();
  const source = publicationSource([city('kazan', ['internet-300'])]);
  await db.provider.create({ data: { id: 'provider-1', name: source.site.provider.name, slug: 'synthetic', settings: {} } });
  await db.site.create({ data: { id: source.site.id, providerId: 'provider-1', slug: source.site.slug, name: source.site.name,
    domain: source.site.domain, connectionPhone: source.site.connectionPhone, supportPhone: source.site.supportPhone, status: 'PUBLISHED', settings: {} } });
  await db.region.create({ data: { id: 'region-1', siteId: source.site.id, name: 'Регион', slug: 'region' } });
  const savedCity = source.cities[0];
  await db.city.create({ data: { id: savedCity.id, siteId: source.site.id, regionId: 'region-1', name: savedCity.name, slug: savedCity.slug, status: 'PUBLISHED' } });
  for (const page of [...source.globalPages, ...savedCity.pages]) {
    await db.page.create({ data: { id: page.id, siteId: source.site.id, cityId: page.type === 'HOME' ? savedCity.id : null,
      type: page.type, slug: page.slug, title: page.title, content: {}, status: 'PUBLISHED',
      blocks: { create: page.blocks.map(({ id, blockType, position, visible, data }) => ({ id, blockType, position, visible, data })) } } });
  }
  for (const template of source.seoTemplates) await db.seoTemplate.create({ data: { ...template, siteId: source.site.id } });
  const savedTariff = savedCity.tariffs[0];
  await db.tariff.create({ data: { id: savedTariff.id, providerId: 'provider-1', cityId: savedCity.id,
    slug: savedTariff.slug, name: savedTariff.name, identityKey: 'synthetic-internet', serviceType: 'INTERNET',
    standardPrice: savedTariff.standardPrice, attributes: {}, status: 'PUBLISHED' } });
  await db.redirect.create({ data: { id: 'redirect-1', siteId: source.site.id, sourcePath: '/old-kazan', targetPath: '/kazan', status: 'PUBLISHED' } });
  const catalog = new SiteCatalogService(db);
  const publications = new PublicationWorkflowService(db, catalog);
  const rebuilds = new RebuildQueueService(db, publications);
  const baselineCatalog = JSON.parse(JSON.stringify(await catalog.list(source.site.slug)));
  const baseline = await db.sitePublication.create({ data: { id: 'publication-a', siteId: source.site.id, siteRevision: 0, status: 'SUCCEEDED',
    catalog: baselineCatalog, triggerEntity: 'bootstrap', triggerEntityId: source.site.id, publishedAt: new Date() } });
  class PipelineModule {}
  Module({ controllers: [load('publication-workflow.controller').PublicationWorkflowController, load('rebuild-queue.controller').RebuildQueueController,
    load('cities.controller').CitiesController, load('admin-seo-templates.controller').AdminSeoTemplatesController,
    load('address-checks.controller').AddressChecksController, load('address-suggestions.controller').AddressSuggestionsController,
    load('public-leads.controller').PublicLeadsController, load('public-redirects.controller').PublicRedirectsController], providers: [
    { provide: PrismaService, useValue: db }, { provide: SiteCatalogService, useValue: catalog },
    { provide: PublicationWorkflowService, useValue: publications }, { provide: RebuildQueueService, useValue: rebuilds },
    { provide: SeoTemplateService, useValue: new SeoTemplateService(db, publications) }, AdminTokenGuard,
    { provide: RedirectService, useValue: new RedirectService(db, publications) },
    { provide: CoverageService, useValue: { check: async () => ({ status: 'UNAVAILABLE', available: false, alternatives: [], message: 'Synthetic coverage unavailable' }) } },
    { provide: DadataService, useValue: { locate: async () => null, clean: async suggestion => suggestion, suggest: async (_query, boost) => {
      assert.deepEqual(boost, { city: savedCity.name, region: 'Регион' }); return [];
    } } },
    { provide: LeadDecisionService, useValue: { enqueueTracked: async () => assert.fail('Non-sales lead must not start delivery') } },
    { provide: LeadNotificationOutboxService, useValue: new LeadNotificationOutboxService(db, {}) },
    { provide: AuthService, useValue: { getUserByToken: async () => null } },
  ] })(PipelineModule);
  app = await NestFactory.create(PipelineModule, new FastifyAdapter(), { logger: false });
  await app.register(apiRequire('@fastify/cookie'));
  app.setGlobalPrefix('api/v1'); app.useGlobalPipes(createGlobalValidationPipe()); app.useGlobalInterceptors(new ServingPublicationInterceptor());
  await app.listen(0, '0.0.0.0'); apiUrl = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  const options = { publicationToken: derivePublicationProxyToken(token), apiUpstream: `host.docker.internal:${app.getHttpServer().address().port}`, adminListen: ':2019' };
  await writeFile(join(root, 'boot.json'), JSON.stringify(createServingConfig(null, options)));
  const user = process.platform === 'linux' ? ['--user', `${process.getuid()}:${process.getgid()}`] : [];
  docker(['run', '--rm', '-d', '--name', caddy, ...user, '--add-host', 'host.docker.internal:host-gateway', '-v', `${resolve(root)}:/publication`,
    '-e', 'XDG_CONFIG_HOME=/publication/state', '-e', 'XDG_DATA_HOME=/publication/data', '-p', '127.0.0.1::80', '-p', '127.0.0.1::2019',
    'caddy:2.11.4-alpine', 'caddy', 'run', '--config', '/publication/boot.json']);
  const adminUrl = `http://127.0.0.1:${port(caddy, '2019/tcp')}`; publicUrl = `http://127.0.0.1:${port(caddy, '80/tcp')}`;
  await until(async () => (await fetch(`${adminUrl}/config/`, { headers: { origin: 'http://127.0.0.1:2019' } })).ok, 'Caddy did not become ready');
  manager = new CaddyActivation({ publicationRoot: root, adminUrl, servingOptions: options });
  builder = new StaticArtifactBuilder({ publicationRoot: root, apiUrl, adminToken: token,
    publicEnv: { PUBLIC_SITE_URL: 'https://partner.example.test', PUBLIC_API_URL: 'https://partner.example.test/api/v1', PUBLIC_SITE_SLUG: source.site.slug } });
  const countedBuilder = { renderer: builder.renderer, fetchSnapshot: job => builder.fetchSnapshot(job),
    progressReporter: job => builder.progressReporter(job),
    build: (job, report) => { builds++; return builder.build(job, report); } };
  const artifactA = await countedBuilder.build({ publicationId: baseline.id, siteId: baseline.siteId, siteSlug: source.site.slug, rebuildId: 'bootstrap-a', rebuildRevision: 1 });
  await manager.activate({ artifactId: artifactA.artifactId, expectedActiveArtifactId: null, kind: 'BOOTSTRAP' });
  const startController = async () => {
    server = createPublicationServer({ adminToken: token, controller: new PublicationController({ publicationRoot: root, builder: countedBuilder, activation: manager }) });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    process.env.STATIC_PUBLICATION_URL = `http://127.0.0.1:${server.address().port}`;
  };
  await startController();
  const initialHtml = await fetch(`${publicUrl}/kazan`).then(response => response.text());
  const oldAsset = initialHtml.match(/(?:src|href)="(\/__publication_assets\/[^" ]+\.(?:js|css))"/)?.[1]; assert.ok(oldAsset);
  const patch = await jsonRequest(`${apiUrl}/admin/sites/${source.site.id}/seo-templates/CITY_HOME`, { method: 'PATCH',
    body: JSON.stringify({ expectedWorkingRevision: 0, titleTemplate: 'Новый Title города {CITY_NAME}', descriptionTemplate: 'Сохранённое описание города', indexState: 'INDEX' }) });
  assert.ok(patch);
  assert.equal(await fetch(`${publicUrl}/kazan`).then(response => response.text()), initialHtml, 'Saving changed served HTML');
  const oldCatalog = await jsonRequest(`${publicUrl}/api/v1/public/sites/${source.site.slug}/cities`);
  assert.equal(oldCatalog.seoByPath['/kazan'].title, baseline.catalog.seoByPath['/kazan'].title);
  // Force the second SQL write to fail after rebuild success was written inside the transaction.
  // Sequence increments survive rollback and prove the trigger actually ran;
  // an earlier HTTP/Caddy uncertainty can also defer the BullMQ job.
  await db.$executeRawUnsafe('CREATE SEQUENCE publication_ack_attempts');
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_publication_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.status = 'SUCCEEDED' THEN PERFORM nextval('publication_ack_attempts'); RAISE EXCEPTION 'synthetic SQL acknowledgment failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_publication_ack BEFORE UPDATE ON "SitePublication" FOR EACH ROW EXECUTE FUNCTION reject_publication_ack()`);
  const pending = await jsonRequest(`${apiUrl}/admin/sites/${source.site.id}/publications`, { method: 'POST', body: JSON.stringify({ expectedWorkingRevision: 1 }) });
  assert.equal(pending.publication.status, 'PENDING'); assert.ok(pending.rebuild.id);
  queue = new Queue('site-rebuilds', { connection: { url: process.env.REDIS_URL } });
  worker = new Worker('site-rebuilds', job => runRebuildJob(job, { apiUrl, adminToken: token, provider: 'static',
    publicationUrl: process.env.STATIC_PUBLICATION_URL, jsonRequest }), { connection: { url: process.env.REDIS_URL }, concurrency: 1 });
  worker.on('failed', () => failed++); worker.on('error', error => { process.stderr.write(`Worker error: ${error.message}\n`); });
  const job = await queue.getJob(`${pending.rebuild.id}-1`); assert.ok(job);
  await until(async () => {
    const [attempt] = await db.$queryRawUnsafe('SELECT is_called FROM publication_ack_attempts');
    return attempt.is_called && await job.getState() === 'delayed'
      && (await manager.current()).active?.publicationId === pending.publication.id;
  }, 'Actual SQL acknowledgment failure did not defer the same active publication');
  await worker.pause();
  let rebuild = await db.siteRebuild.findUnique({ where: { id: pending.rebuild.id } });
  assert.equal(rebuild.publishedRevision, 0); assert.ok(['RUNNING', 'RETRYING'].includes(rebuild.status));
  assert.equal((await db.site.findUnique({ where: { id: source.site.id } })).publishedRevision, 0);
  assert.equal((await db.sitePublication.findUnique({ where: { id: pending.publication.id } })).status, 'RUNNING');
  const progressState = await jsonRequest(`${apiUrl}/admin/sites/${source.site.id}/publication-state`);
  assert.equal(progressState.progress.publicationId, pending.publication.id);
  assert.equal(progressState.progress.stage, 'CONFIRMING');
  assert.equal(progressState.publishedRevision, 0, 'Progress falsely acknowledged SQL');
  assert.equal('providerResponse' in progressState.rebuild, false);
  const staleProgress = await jsonRequest(`${apiUrl}/internal/site-rebuilds/${rebuild.id}/publication-progress`, { method: 'POST',
    body: JSON.stringify({ runId: progressState.progress.runId, publicationId: pending.publication.id, revision: 1, sequence: 10000, stage: 'BUILDING', completedPages: 99999, totalPages: 99999 }) });
  assert.equal(staleProgress.saved, false, 'Regressive progress overwrote the current phase');
  const active = await manager.current(); assert.equal(active.active.publicationId, pending.publication.id);
  const nextHtml = await fetch(`${publicUrl}/kazan`).then(response => response.text()); assert.match(nextHtml, /<title>Новый Title города/);
  const activeCatalog = await jsonRequest(`${publicUrl}/api/v1/public/sites/${source.site.slug}/cities`, { headers: { 'x-site-publication-id': 'spoofed', 'x-site-publication-token': 'spoofed' } });
  assert.match(activeCatalog.seoByPath['/kazan'].title, /^Новый Title города/); assert.equal((await fetch(`${publicUrl}${oldAsset}`)).status, 200);
  // Working draft/archive changes cannot alter the already served snapshot.
  await db.site.update({ where: { id: source.site.id }, data: { status: 'DRAFT' } });
  await db.city.update({ where: { id: savedCity.id }, data: { name: 'Рабочий город', status: 'DRAFT' } });
  await db.tariff.update({ where: { id: savedTariff.id }, data: { slug: 'working-tariff', standardPrice: '9999', status: 'ARCHIVED',
    availability: 'ARCHIVED', archiveReason: 'MANUAL', archivedAt: new Date() } });
  const suggestions = await jsonRequest(`${publicUrl}/api/v1/address-suggestions`, { method: 'POST', headers: { cookie: 'address_city_kladr=none' },
    body: JSON.stringify({ siteSlug: source.site.slug, citySlug: savedCity.slug, query: 'Казань' }) });
  assert.deepEqual(suggestions.suggestions, []);
  const address = await jsonRequest(`${publicUrl}/api/v1/address-checks`, { method: 'POST', body: JSON.stringify({
    siteSlug: source.site.slug, citySlug: savedCity.slug, address: 'Казань, улица 1, дом 1',
    suggestion: { value: 'Казань, улица 1, дом 1', unrestricted_value: 'Казань, улица 1, дом 1', data: { house: '1' } } }) });
  const storedCheck = await db.addressCheck.findUnique({ where: { id: address.checkId } });
  assert.equal(storedCheck.siteId, source.site.id); assert.equal(storedCheck.cityId, savedCity.id);
  const quote = await jsonRequest(`${publicUrl}/api/v1/public/sites/${source.site.slug}/cities/kazan/tariffs/${savedTariff.slug}/quote`, { method: 'POST', body: '{}' });
  assert.equal(quote.totals.monthly, 700);
  const lead = await jsonRequest(`${publicUrl}/api/v1/leads`, { method: 'POST', body: JSON.stringify({
    siteSlug: source.site.slug, citySlug: savedCity.slug, tariffSlug: savedTariff.slug, reasonCode: 'billing',
    phone: '+7 999 123-45-67', submissionKey: randomUUID(), consentVersion: LEAD_CONSENT_VERSION,
    configuration: { selection: quote.selection, fingerprint: quote.fingerprint },
  }) });
  const storedLead = await db.lead.findUnique({ where: { id: lead.id } });
  assert.equal(storedLead.tariffId, savedTariff.id); assert.equal(storedLead.processingStatus, 'NON_SALES_NOT_SENT');
  assert.equal(storedLead.configurationSnapshot.totals.monthly, 700);
  assert.equal(await db.leadNotification.count({ where: { leadId: lead.id } }), 1);
  const redirect = await fetch(`${publicUrl}/old-kazan?campaign=kept`, { redirect: 'manual' });
  assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), '/kazan?campaign=kept');
  assert.equal((await db.redirect.findUnique({ where: { id: 'redirect-1' } })).hitCount, 1);
  // Controller restart recovers the durable receipt; public HTML/assets do not require SQL.
  await new Promise(done => server.close(done)); await startController();
  docker(['stop', '--time', '1', postgres]);
  assert.equal(await fetch(`${publicUrl}/kazan`).then(response => response.text()), nextHtml);
  assert.equal((await fetch(`${publicUrl}${oldAsset}`)).status, 200);
  docker(['start', postgres]);
  await until(async () => (await db.$queryRawUnsafe('SELECT 1')).length === 1, 'PostgreSQL did not recover');
  await db.$executeRawUnsafe('DROP TRIGGER reject_publication_ack ON "SitePublication"');
  await worker.resume(); await job.promote();
  await until(async () => await job.getState() === 'completed', 'Receipt recovery did not acknowledge SQL');
  rebuild = await db.siteRebuild.findUnique({ where: { id: pending.rebuild.id } });
  assert.equal(rebuild.status, 'SUCCEEDED'); assert.equal(rebuild.publishedRevision, 1);
  assert.equal((await db.site.findUnique({ where: { id: source.site.id } })).publishedRevision, 1);
  assert.equal((await db.sitePublication.findUnique({ where: { id: pending.publication.id } })).status, 'SUCCEEDED');
  assert.equal(builds, 2); assert.equal(failed, 0);
  const replay = await jsonRequest(`${apiUrl}/internal/site-rebuilds/${rebuild.id}/result`, { method: 'POST',
    body: JSON.stringify({ revision: 1, attemptNumber: 1, maxAttempts: 3, result: rebuild.providerResponse }) });
  assert.equal(replay.skipped, true); assert.equal((await manager.current()).active.artifactId, active.active.artifactId);
  const brokenCatalog = (await db.sitePublication.findUnique({ where: { id: pending.publication.id } })).catalog;
  delete brokenCatalog.seoByPath['/kazan'];
  await db.sitePublication.create({ data: { id: 'publication-build-rejected', siteId: source.site.id, siteRevision: 2,
    status: 'PENDING', catalog: brokenCatalog, triggerEntity: 'synthetic-invalid-candidate', triggerEntityId: source.site.id } });
  const rejected = await fetch(`${process.env.STATIC_PUBLICATION_URL}/publish`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({
      publicationId: 'publication-build-rejected', siteId: source.site.id, siteSlug: source.site.slug, rebuildId: 'build-rejected', rebuildRevision: 2,
    }) });
  assert.equal(rejected.status, 422); assert.equal((await rejected.json()).status, 'FAILED');
  assert.equal(await fetch(`${publicUrl}/kazan`).then(response => response.text()), nextHtml);
  assert.equal((await manager.current()).active.artifactId, active.active.artifactId); assert.equal(builds, 3);
  await worker.close(); worker = null; await app.close(); app = null; db = null;
  assert.equal(await fetch(`${publicUrl}/kazan`).then(response => response.text()), nextHtml);
  assert.equal((await fetch(`${publicUrl}${oldAsset}`)).status, 200);
  process.stdout.write('Real PostgreSQL/Redis/Nest HTTP/Astro/Caddy: save keeps A; activation serves B during SQL rollback; restart/receipt recovery acknowledges B once; failed build keeps B; old assets and API-independent HTML remain available\n');
} catch (error) {
  originalFailure = error;
  process.stderr.write(`Static pipeline rehearsal failed: ${error.message}\n`); throw error;
} finally {
  // Complete every owned cleanup even when one close fails; keep the original
  // test failure rather than replacing it with a shutdown diagnostic.
  const cleanup = await Promise.allSettled([
    worker?.close(), queue?.close(), app ? app.close() : db?.onModuleDestroy(),
    server ? new Promise((done, reject) => server.close(error => error ? reject(error) : done())) : Promise.resolve(),
  ]);
  docker(['rm', '-f', caddy], true); docker(['rm', '-f', redis], true); docker(['rm', '-f', postgres], true);
  if (await realpath(root) !== safeRoot || resolve(root, '..') !== resolve(temporary)) throw new Error('Unsafe rehearsal cleanup');
  await rm(root, { recursive: true, force: true });
  const errors = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (!originalFailure && errors.length) throw new AggregateError(errors, 'Rehearsal cleanup failed');
}

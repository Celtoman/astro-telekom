import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { PrismaService } = require('../apps/api/dist/prisma.service');
const { FaqCookieService } = require('../apps/api/dist/faq-cookie.service');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service');
const { faqDemoContent } = require('../apps/api/dist/faq-demo');
const { cookieNoticeDefaults } = require('../apps/api/dist/cookie-notice-model');
const { officialSiteSource } = require('../tests/helpers/official-site-source.cjs');
const container = 'faq-cookie-rehearsal-' + randomUUID().slice(0, 8);
const docker = args => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000, windowsHide: true });
const checked = result => { assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message); return result.stdout.trim(); };
const queue = { enqueue: async data => ({ id: 'queue-' + data.publicationId, status: 'PENDING' }) };
let db, owned = false;
try {
  checked(docker(['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']));
  owned = true;
  for (let i = 0; i < 60; i++) {
    if (docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'provider']).status === 0) break;
    if (i === 59) throw Error('PostgreSQL did not start');
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const port = checked(docker(['port', container, '5432/tcp'])).match(/:(\d+)$/)[1];
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:' + port + '/provider';
  delete process.env.REBUILD_PROVIDER;
  checked(spawnSync('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], {
    shell: process.platform === 'win32', env: process.env, encoding: 'utf8', timeout: 120000, windowsHide: true,
  }));
  db = new PrismaService();
  await db.onModuleInit();
  const source = officialSiteSource();
  const provider = await db.provider.create({ data: { name: source.site.provider.name, slug: 'demo-provider' } });
  const site = await db.site.create({ data: {
    name: source.site.name, slug: 'rehearsal-site', domain: source.site.domain, providerId: provider.id, status: 'PUBLISHED',
    connectionPhone: source.site.connectionPhone, supportPhone: source.site.supportPhone, settings: source.site.settings,
    workingRevision: 2, publishedRevision: 2,
  } });
  source.site.id = site.id;
  source.site.slug = site.slug;
  const renderer = new SiteCatalogService(db);
  const catalog = renderer.renderSource(source);
  const json = value => JSON.parse(JSON.stringify(value));
  const validation = await db.sitePublicationValidation.create({ data: {
    siteId: site.id, siteRevision: 2, sourceSnapshot: json(source), report: {}, appVersion: 'rehearsal', outcome: 'PASSED', checkedUrlCount: catalog.routes.length,
  } });
  const baseline = await db.sitePublication.create({ data: {
    siteId: site.id, siteRevision: 2, catalog: json(catalog), triggerEntity: 'site', triggerEntityId: site.id, status: 'SUCCEEDED', validationId: validation.id,
  } });
  const workflow = new PublicationWorkflowService(db, renderer);
  const service = new FaqCookieService(db, workflow, renderer, queue);
  const faq = faqDemoContent();
  const cookie = cookieNoticeDefaults();
  const faqSave = await service.save(site.id, 'FAQ', faq, 2);
  assert.equal(faqSave.workingRevision, 3);
  await assert.rejects(service.save(site.id, 'COOKIE_NOTICE', cookie, 2), error => error.getStatus() === 409);
  await service.save(site.id, 'COOKIE_NOTICE', cookie, 3);
  await db.site.update({ where: { id: site.id }, data: { settings: { ...source.site.settings, newDraft: 'must-be-absent', cookieNotice: cookie } } });
  const first = await service.review(site.id, ['FAQ']);
  assert.equal(first.basePublicationId, baseline.id);
  assert.ok(first.ready, JSON.stringify(first.report.issues));
  const updated = { ...faq, intro: 'Изменённое вступление для повторной проверки.' };
  await service.save(site.id, 'FAQ', updated, 4);
  await assert.rejects(service.publish(site.id, ['FAQ'], first.reviewDigest, 'stale'), error => error.getStatus() === 409);
  const ready = await service.review(site.id, ['FAQ', 'COOKIE_NOTICE']);
  assert.ok(ready.ready);
  const result = await service.publish(site.id, ['COOKIE_NOTICE', 'FAQ'], ready.reviewDigest, 'op-release');
  const duplicate = await service.publish(site.id, ['COOKIE_NOTICE', 'FAQ'], ready.reviewDigest, 'op-release');
  assert.equal(result.publicationId, duplicate.publicationId);
  const row = await db.sitePublication.findUniqueOrThrow({ where: { id: result.publicationId }, include: { validation: true } });
  assert.equal(row.basePublicationId, baseline.id);
  assert.equal(row.validation.sourceSnapshot.site.settings.newDraft, undefined);
  assert.deepEqual(row.validation.sourceSnapshot.site.settings.cookieNotice, cookie);
  assert.equal(row.validation.sourceSnapshot.globalPages.find(page => page.type === 'FAQ').content.intro, updated.intro);
  await workflow.markSucceeded(row.id, {});
  assert.equal((await db.site.findUniqueOrThrow({ where: { id: site.id } })).publishedRevision, 2);
  const noop = await service.review(site.id, ['FAQ','COOKIE_NOTICE']);
  assert.equal(noop.changed, false);
  console.log('78 migrations, optimistic saving, stale review, selective publication, idempotent retry, serving revision and no-op passed.');
} finally {
  if (db) await db.onModuleDestroy();
  if (owned) checked(docker(['stop', container]));
}

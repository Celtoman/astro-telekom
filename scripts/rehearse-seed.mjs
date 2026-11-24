import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { PrismaService } = require('../apps/api/dist/prisma.service.js');
const { SiteCatalogService } = require('../apps/api/dist/site-catalog.service.js');
const { validatePublicationSource } = require('../apps/api/dist/publication-validation.js');
const { AuthService } = require('../apps/api/dist/auth.service.js');
const { speedTestPageDefaults } = require('../apps/api/dist/speed-test-page-defaults.js');
const { SPEED_TEST_PAGE_SLUG } = require('../apps/api/dist/speed-test-page-model.js');
const container = `astro-seed-rehearsal-${randomUUID().slice(0, 8)}`;
const email = 'seed-rehearsal@example.test', password = 'synthetic-seed-rehearsal-password';
function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
  if (!allowFailure) assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout.trim();
}
function seed(overrides = {}) {
  return spawnSync(process.execPath, ['apps/api/dist/seed.js'], {
    env: { ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ...overrides }, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
}
let db;
try {
  docker(['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', 'postgres:18.6-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'provider'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (probe.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  assert.ok(ready, 'isolated PostgreSQL 18 must become ready');
  const port = docker(['port', container, '5432/tcp']).match(/:(\d+)\s*$/)[1];
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/provider`;
  const migrations = spawnSync('pnpm', ['--filter', '@provider/database', 'migrate:deploy'], {
    shell: process.platform === 'win32', env: process.env, encoding: 'utf8', timeout: 120000, windowsHide: true,
  });
  assert.equal(migrations.status, 0, migrations.stderr || migrations.stdout);
  db = new PrismaService(); await db.onModuleInit();

  // The first assertion is the original regression: an actual migrated schema,
  // compiled seed and valid credentials must work together.
  const first = seed();
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const site = await db.site.findUniqueOrThrow({ where: { slug: 'domru-site' } });
  const catalogService = new SiteCatalogService(db);
  let source = await catalogService.captureSourceBySiteId(site.id);
  const incomplete = validatePublicationSource(source, { appVersion: 'seed-rehearsal', siteRevision: site.workingRevision }, (candidate, now) => catalogService.renderSource(candidate, now));
  assert.equal(incomplete.report.outcome, 'BLOCKED', 'fresh HOME requires real FAQ content before publication');
  assert.ok(incomplete.report.issues.some(issue => issue.code === 'GENERAL_HOME_NOT_READY' && issue.block === 'home.faq' && issue.field === 'items'));
  const fullHome = source.pageTemplates.find(template => template.kind === 'HOME');
  assert.equal(fullHome.blocks.length, 10);
  const faq = fullHome.blocks.find(block => block.blockType === 'home.faq');
  assert.deepEqual(faq.data.items, []);
  // Isolated synthetic content proves readiness without shipping demo answers in bootstrap defaults.
  await db.pageTemplateBlock.update({ where: { id: faq.id }, data: { data: { ...faq.data, items: [{ question: 'Синтетический вопрос', answer: 'Ответ только для изолированной проверки.' }] } } });
  source = await catalogService.captureSourceBySiteId(site.id);
  const withoutTariffs = validatePublicationSource(source, { appVersion: 'seed-rehearsal', siteRevision: site.workingRevision }, (candidate, now) => catalogService.renderSource(candidate, now));
  assert.ok(withoutTariffs.report.issues.some(issue => issue.code === 'CITY_TARIFFS_REQUIRED'));
  await db.tariff.create({ data: { providerId: site.providerId, cityId: source.cities[0].id, name: 'Синтетический тариф проверки', slug: 'synthetic-seed-proof', identityKey: 'rehearsal:synthetic-seed-proof', dataSource: 'rehearsal', serviceType: 'INTERNET_TV', status: 'PUBLISHED', availability: 'ACTIVE', standardPrice: '799', speed: 500, attributes:{tv_channels_total:190,tv_channels_hd:60} } });
  source = await catalogService.captureSourceBySiteId(site.id);
  const validation = validatePublicationSource(source, { appVersion: 'seed-rehearsal', siteRevision: site.workingRevision }, (candidate, now) => catalogService.renderSource(candidate, now));
  assert.notEqual(validation.report.outcome, 'BLOCKED', JSON.stringify(validation.report.issues));
  assert.equal(validation.catalog.routes.length, 14, 'root, five required globals plus ACCOUNT, OFFICIAL_SITE, SPEED_TEST and EQUIPMENT_ROUTER, city HOME, ADDRESS, SUPPORT and one synthetic published tariff; other unpriced demo tariffs remain drafts');
  assert.deepEqual(validation.catalog.routes.filter(route => route.id === 'SPEED_TEST'), [{ id: 'SPEED_TEST', kind: 'GLOBAL_PAGE', path: `/${SPEED_TEST_PAGE_SLUG}`, pageType: 'SPEED_TEST' }]);
  const speedTestPages = source.globalPages.filter(page => page.type === 'SPEED_TEST');
  assert.equal(speedTestPages.length, 1, 'seed initializes one site-global SPEED_TEST source');
  assert.equal(speedTestPages[0].siteId, site.id);
  assert.equal(speedTestPages[0].cityId, null);
  assert.equal(speedTestPages[0].slug, SPEED_TEST_PAGE_SLUG);
  assert.equal(speedTestPages[0].status, 'PUBLISHED');
  assert.deepEqual(speedTestPages[0].content, speedTestPageDefaults());
  assert.deepEqual(validation.catalog.globalPages.find(page => page.type === 'SPEED_TEST').content, speedTestPageDefaults());
  const routerPage = source.globalPages.find(page => page.type === 'EQUIPMENT_ROUTER');
  assert.equal(routerPage?.cityId, null);
  assert.equal(routerPage?.slug, 'wifi-router');
  assert.equal(routerPage?.content.catalog.subtitle, '');
  assert.ok(validation.catalog.seoByPath['/wifi-router']);
  assert.equal(source.seoTemplates.length, 14);
  assert.equal(source.seoTemplates.filter(template => template.kind === 'SPEED_TEST').length, 1, 'SPEED_TEST has its own SEO template');
  assert.ok(validation.catalog.seoByPath[`/${SPEED_TEST_PAGE_SLUG}`]);
  assert.deepEqual(source.pageTemplates.map(template=>template.kind).sort(), ['HOME','CITY_HOME','CITY_ADDRESS_CHECK','CITY_SUPPORT'].sort());
  assert.equal(source.cities[0].pages.find(page => page.type === 'HOME').templateId, source.pageTemplates.find(template => template.kind === 'CITY_HOME').id);
  assert.equal(validation.catalog.homeHero.searchButtonText, 'Найти город');
  assert.equal(validation.catalog.homeHeroVersion, '2.0.0');
  assert.match(validation.catalog.homeHero.title, /<red>в вашем городе<\/red>/);
  assert.deepEqual(validation.catalog.cities[0].pages.find(page => page.type === 'HOME').blocks.map(block => block.blockType), ['hero','tariff_grid','city.comparison','city.help','city.benefits','city.connection_steps','city.movix','city.regional_cities','city.faq','city.contacts']);
  assert.equal(await db.tariff.count({ where: { status: 'DRAFT', dataSource: 'seed' } }), 2);
  assert.equal(await db.sitePublication.count(), 0);
  assert.equal(await db.siteRebuild.count(), 0);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  assert.ok(new AuthService(db).verifyPassword(password, user.passwordHash));

  const snapshot = async () => JSON.parse(JSON.stringify(await Promise.all([
    db.provider.findMany({ orderBy: { id: 'asc' } }), db.site.findMany({ orderBy: { id: 'asc' } }), db.region.findMany({ orderBy: { id: 'asc' } }),
    db.city.findMany({ orderBy: { id: 'asc' } }), db.page.findMany({ orderBy: { id: 'asc' } }),
    db.pageTemplate.findMany({ orderBy: { id: 'asc' }, include: { blocks: { orderBy: { position: 'asc' } } } }),
    db.seoTemplate.findMany({ orderBy: { id: 'asc' } }), db.tariff.findMany({ orderBy: { id: 'asc' } }), db.user.findMany({ orderBy: { id: 'asc' } }),
  ])));
  const initial = await snapshot();
  const repeat = seed(); assert.equal(repeat.status, 0, repeat.stderr);
  assert.deepEqual(await snapshot(), initial, 'repeat must preserve IDs, timestamps, content and account credentials');

  const hero = source.pageTemplates.find(template => template.kind === 'CITY_HOME').blocks.find(block => block.blockType === 'hero');
  await db.pageTemplateBlock.update({ where: { id: hero.id }, data: { data: { ...hero.data, title: 'Редакционный заголовок' } } });
  await db.page.update({ where: { id: source.globalPages[0].id }, data: { content: { text: 'Редакционный текст' } } });
  await db.seoTemplate.update({ where: { siteId_kind: { siteId: site.id, kind: 'CITY_HOME' } }, data: { titleTemplate: 'Мой заголовок в {CITY_NAME_PREPOSITIONAL}' } });
  await db.site.update({ where: { id: site.id }, data: { connectionPhone: '78001234567' } });
  const edited = await snapshot();
  const preserved = seed({ ADMIN_PASSWORD: 'different-synthetic-password' }); assert.equal(preserved.status, 0, preserved.stderr);
  assert.deepEqual(await snapshot(), edited, 'seed must not overwrite owner content, phones, SEO or password');

  await db.tariff.deleteMany({ where: { dataSource: 'seed' } });
  await db.tariff.create({ data: { providerId: source.site.providerId, cityId: source.cities[0].id, name: 'Импортированный тариф', slug: 'imported', identityKey: 'synthetic-imported', serviceType: 'INTERNET', speed: 300, standardPrice: 700, status: 'PUBLISHED', dataSource: 'import' } });
  const imported = await snapshot();
  const withCatalog = seed(); assert.equal(withCatalog.status, 0, withCatalog.stderr);
  assert.deepEqual(await snapshot(), imported, 'nonempty imported catalog must not receive seed tariffs');

  const credentialsMissing = seed({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' });
  assert.notEqual(credentialsMissing.status, 0);
  assert.match(credentialsMissing.stderr, /ADMIN_EMAIL|ADMIN_PASSWORD/);
  assert.deepEqual(await snapshot(), imported, 'missing credentials must fail before any writes');

  const routerMigration = readFileSync(new URL('../prisma/migrations/0082_router_page/migration.sql', import.meta.url), 'utf8');
  const applyRouterMigration = () => spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'provider', '-v', 'ON_ERROR_STOP=1'], {
    input: routerMigration, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  await db.page.delete({ where: { id: routerPage.id } });
  await db.seoTemplate.delete({ where: { siteId_kind: { siteId: site.id, kind: 'EQUIPMENT_ROUTER' } } });
  const olderSnapshot = await db.sitePublication.create({ data: { siteId: site.id, siteRevision: 0, status: 'SUCCEEDED',
    catalog: { historical: true }, triggerEntity: 'site', triggerEntityId: site.id } });
  const restoredRouterSource = applyRouterMigration();
  assert.equal(restoredRouterSource.status, 0, restoredRouterSource.stderr);
  assert.deepEqual((await db.page.findFirstOrThrow({ where: { siteId: site.id, type: 'EQUIPMENT_ROUTER' } })).content, routerPage.content);
  const migrated = await snapshot();
  const repeatedRouterMigration = applyRouterMigration();
  assert.equal(repeatedRouterMigration.status, 0, repeatedRouterMigration.stderr);
  assert.deepEqual(await snapshot(), migrated, 'router migration only initializes missing working rows');
  assert.deepEqual(await db.sitePublication.findUniqueOrThrow({ where: { id: olderSnapshot.id } }), olderSnapshot);

  // Prove rollback after resetting only this owned isolated database.
  await db.$executeRawUnsafe('TRUNCATE TABLE "Provider", "User" CASCADE');
  await db.$executeRawUnsafe(`ALTER TABLE "Region" ADD CONSTRAINT "seed_rehearsal_failure" CHECK ("slug" <> 'tatarstan')`);
  const blocked = seed(); assert.notEqual(blocked.status, 0);
  assert.equal(await db.provider.count(), 0, 'a mid-bootstrap error must roll back the provider and all related rows');
  assert.equal(await db.site.count(), 0);
  assert.equal(await db.user.count(), 0);
  process.stdout.write('seed rehearsal: fresh bootstrap, explicit FAQ readiness, publication preflight, exact idempotence, preserved edits, imported catalog, credentials and atomic rollback passed\n');
} finally {
  if (db) await db.onModuleDestroy();
  docker(['rm', '-f', container], true);
}

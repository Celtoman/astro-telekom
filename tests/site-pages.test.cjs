const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AdminPagesController } = require('../apps/api/dist/admin-pages.controller.js');

const repositoryRoot = join(__dirname, '..');

test('Page schema represents Release 1 site-global pages without a fake city', () => {
  const schema = readFileSync(join(repositoryRoot, 'prisma', 'schema.prisma'), 'utf8');
  const enumMigrationPath = join(repositoryRoot, 'prisma', 'migrations', '0021_site_global_release_pages', 'migration.sql');
  const scopeMigrationPath = join(repositoryRoot, 'prisma', 'migrations', '0022_site_global_page_scope', 'migration.sql');
  assert.equal(existsSync(enumMigrationPath), true, 'site-global Page enum migration must exist');
  assert.equal(existsSync(scopeMigrationPath), true, 'site-global Page scope migration must exist');
  const enumMigration = readFileSync(enumMigrationPath, 'utf8');
  const scopeMigration = readFileSync(scopeMigrationPath, 'utf8');

  for (const type of ['COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT']) {
    assert.match(schema, new RegExp(`\\b${type}\\b`));
    assert.match(enumMigration, new RegExp(`ADD VALUE '${type}'`));
  }
  assert.match(schema, /cityId\s+String\?/);
  assert.match(schema, /city\s+City\?/);
  assert.match(scopeMigration, /DROP NOT NULL/);
  assert.match(scopeMigration, /WHERE "cityId" IS NULL/);
  assert.match(scopeMigration, /Page_global_scope_check/);
  const cookieEnumMigration = readFileSync(join(repositoryRoot, 'prisma', 'migrations', '0024_cookie_policy_page_type', 'migration.sql'), 'utf8');
  const publicationMigration = readFileSync(join(repositoryRoot, 'prisma', 'migrations', '0025_publish_release_one_catalog', 'migration.sql'), 'utf8');
  const cityTemplateMigrationPath = join(repositoryRoot, 'prisma', 'migrations', '0026_backfill_city_home_template', 'migration.sql');
  assert.match(schema, /\bCOOKIE_POLICY\b/);
  assert.match(cookieEnumMigration, /ADD VALUE 'COOKIE_POLICY'/);
  assert.match(publicationMigration, /'COOKIE_POLICY'/);
  assert.match(publicationMigration, /UPDATE "City"[\s\S]*"status" = 'PUBLISHED'/);
  assert.match(publicationMigration, /'HOME'::"PageType"[\s\S]*'PUBLISHED'::"PublishStatus"/);
  assert.match(publicationMigration, /WHERE "type" = 'HOME' AND "cityId" IS NOT NULL/);
  assert.equal(existsSync(cityTemplateMigrationPath), true, 'city HOME template backfill migration must exist');
  const cityTemplateMigration = readFileSync(cityTemplateMigrationPath, 'utf8');
  assert.match(cityTemplateMigration, /template:city-home:v1/);
  assert.match(cityTemplateMigration, /"namePrepositional"/);
  assert.match(cityTemplateMigration, /NOT EXISTS[\s\S]*"PageBlock"/);
  for (const blockType of ['hero', 'service_grid', 'tariff_grid', 'steps', 'feature_grid', 'faq']) {
    assert.match(cityTemplateMigration, new RegExp(`'${blockType}'`));
  }
});

test('admin pages reject incompatible global and city page scopes before writing', async () => {
  let writes = 0;
  const prisma = {
    page: {
      create: async ({ data }) => { writes += 1; return { id: 'page-1', ...data }; },
      findUnique: async () => ({
        id: 'page-1', siteId: 'site-1', cityId: null, type: 'COVERAGE', title: 'Карта покрытия',
        slug: 'karta-pokrytiya-provaydera', status: 'DRAFT', seo: {}, content: {},
      }),
      update: async ({ data }) => { writes += 1; return { id: 'page-1', siteId: 'site-1', ...data }; },
    },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const controller = new AdminPagesController(prisma, { recordWorkingRevision: async () => ({ siteRevision: 1 }) });

  await assert.rejects(controller.create({
    siteId: 'site-1', cityId: null, type: 'INTERNET', title: 'Интернет', slug: 'internet', status: 'DRAFT',
  }), /области страницы/i);
  await assert.rejects(controller.create({
    siteId: 'site-1', cityId: 'city-1', type: 'PRIVACY', title: 'Политика', slug: 'politika-konfidencialnosti', status: 'DRAFT',
  }), /области страницы/i);
  await assert.rejects(controller.create({
    siteId: 'site-1', cityId: null, type: 'CITIES', title: 'Города', slug: 'cities', status: 'DRAFT',
  }), /каноническому маршруту/i);
  await assert.rejects(controller.update('page-1', { cityId: 'city-1' }), /области страницы/i);
  await assert.rejects(controller.update('page-1', { slug: 'coverage' }), /каноническому маршруту/i);
  assert.equal(writes, 0);
});

test('admin pages save a canonical site-global page as a working revision without publishing it', async () => {
  const writes = [];
  const revisions = [];
  const prisma = {
    page: {
      create: async ({ data }) => { writes.push(data); return { id: 'coverage', ...data }; },
    },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const controller = new AdminPagesController(
    prisma,
    { recordWorkingRevision: async (_transaction, input) => { revisions.push(input); return { siteRevision: 4 }; } },
  );

  const page = await controller.create({
    siteId: 'site-1', cityId: null, type: 'COVERAGE', title: 'Карта покрытия',
    slug: 'karta-pokrytiya-provaydera', status: 'DRAFT', seo: {}, content: {},
  });

  assert.equal(page.cityId, null);
  assert.equal(page.workingRevision, 4);
  assert.equal(writes.length, 1);
  assert.equal(revisions[0].entityType, 'PAGE');
  assert.equal(revisions[0].action, 'CREATE');
});

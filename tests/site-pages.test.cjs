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
});

test('admin pages reject incompatible global and city page scopes before writing', async () => {
  let writes = 0;
  const controller = new AdminPagesController({
    page: {
      create: async ({ data }) => { writes += 1; return { id: 'page-1', ...data }; },
      findUnique: async () => ({
        id: 'page-1', siteId: 'site-1', cityId: null, type: 'COVERAGE', title: 'Карта покрытия',
        slug: 'karta-pokrytiya-provaydera', status: 'DRAFT', seo: {}, content: {},
      }),
      update: async ({ data }) => { writes += 1; return { id: 'page-1', siteId: 'site-1', ...data }; },
    },
  }, { enqueue: async () => {} });

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

test('admin pages accept a canonical site-global page and enqueue its rebuild', async () => {
  const writes = [];
  const rebuilds = [];
  const controller = new AdminPagesController({
    page: {
      create: async ({ data }) => { writes.push(data); return { id: 'coverage', ...data }; },
    },
  }, { enqueue: async (job) => { rebuilds.push(job); } });

  const page = await controller.create({
    siteId: 'site-1', cityId: null, type: 'COVERAGE', title: 'Карта покрытия',
    slug: 'karta-pokrytiya-provaydera', status: 'DRAFT', seo: {}, content: {},
  });

  assert.equal(page.cityId, null);
  assert.equal(writes.length, 1);
  assert.deepEqual(rebuilds, [{ entity: 'page', id: 'coverage', siteId: 'site-1' }]);
});

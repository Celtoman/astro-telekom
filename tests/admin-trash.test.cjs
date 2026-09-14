const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AdminBlocksController } = require('../apps/api/dist/admin-blocks.controller.js');
const { AdminTrashController, TrashListQueryDto } = require('../apps/api/dist/admin-trash.controller.js');
const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');

const repositoryRoot = join(__dirname, '..');
const queryMetadata = (metatype) => ({ type: 'query', metatype, data: undefined });

test('page blocks have an additive trash marker and public catalogs exclude archived blocks', () => {
  const schema = readFileSync(join(repositoryRoot, 'prisma', 'schema.prisma'), 'utf8');
  const migration = readFileSync(join(repositoryRoot, 'prisma', 'migrations', '0030_page_block_trash', 'migration.sql'), 'utf8');
  const catalog = readFileSync(join(repositoryRoot, 'apps', 'api', 'src', 'site-catalog.service.ts'), 'utf8');

  assert.match(schema, /model PageBlock[\s\S]*archivedAt\s+DateTime\?/);
  assert.match(migration, /ADD COLUMN "archivedAt" TIMESTAMPTZ\(3\)/);
  assert.doesNotMatch(migration, /DROP|DELETE/i);
  assert.match(catalog, /blocks: \{ where: \{ visible: true, archivedAt: null \}/);
});

test('manual block delete archives and restore reverses it as attributed page revisions', async () => {
  const revisions = [];
  let blockListWhere;
  let current = {
    id: 'block-1', pageId: 'page-1', blockType: 'rich_text', position: 10, visible: true,
    data: { title: 'Условия', text: 'Текст.' }, source: null, archivedAt: null,
  };
  const prisma = {
    pageBlock: {
      findUnique: async () => ({ ...current }),
      updateMany: async ({ data }) => { current = { ...current, ...data }; return { count: 1 }; },
      findMany: async (query) => { blockListWhere = query.where; return []; },
    },
    page: {
      findUnique: async () => ({ id: 'page-1', siteId: 'site-1', blocks: [{ ...current }] }),
    },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const controller = new AdminBlocksController(prisma, {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: revisions.length + 10 };
    },
  });

  const archived = await controller.remove('block-1', { user: { id: 'user-1' } });
  assert.equal(archived.workingRevision, 11);
  assert.ok(current.archivedAt instanceof Date);
  assert.equal(revisions[0].action, 'ARCHIVE');
  assert.equal(revisions[0].actorId, 'user-1');

  const restored = await controller.restore('block-1', { user: { id: 'user-2' } });
  assert.equal(restored.workingRevision, 12);
  assert.equal(current.archivedAt, null);
  assert.equal(revisions[1].action, 'RESTORE');
  assert.equal(revisions[1].actorId, 'user-2');

  await controller.list('page-1');
  assert.deepEqual(blockListWhere, { pageId: 'page-1', archivedAt: null });
});

test('trash API requires a site and returns bounded groups for every restorable content type', async () => {
  const calls = [];
  const delegate = (name, rows = []) => ({
    findMany: async (query) => { calls.push([name, 'findMany', query]); return rows; },
    count: async (query) => { calls.push([name, 'count', query]); return rows.length; },
  });
  const prisma = {
    site: { findUnique: async () => ({ id: 'site-1' }) },
    city: delegate('city', [{ id: 'city-1', name: 'Казань', slug: 'kazan', status: 'ARCHIVED' }]),
    page: delegate('page'),
    tariff: delegate('tariff'),
    redirect: delegate('redirect'),
    pageBlock: delegate('pageBlock'),
    $transaction: async (callback) => callback(prisma),
  };
  const controller = new AdminTrashController(prisma);

  const result = await controller.list({ siteId: 'site-1' });

  assert.deepEqual(result.groups.map((group) => group.entityType), ['CITY', 'PAGE', 'TARIFF', 'REDIRECT', 'PAGE_BLOCK']);
  assert.equal(result.groups[0].items[0].label, 'Казань');
  for (const [, method, query] of calls.filter((entry) => entry[1] === 'findMany')) {
    assert.equal(method, 'findMany');
    assert.equal(query.take, 101);
  }

  const pipe = createGlobalValidationPipe();
  await assert.rejects(
    pipe.transform({}, queryMetadata(TrashListQueryDto)),
    (error) => error.getStatus() === 400,
  );
});

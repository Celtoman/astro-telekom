const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminProvidersController } = require('../apps/api/dist/admin-providers.controller.js');
const { AdminRegionsController } = require('../apps/api/dist/admin-regions.controller.js');
const { AdminSitesController } = require('../apps/api/dist/admin-sites.controller.js');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');

test('site create and update save attributed working revisions without rebuilding', async () => {
  let site = { id: 'site-1', providerId: 'provider-1', name: 'Сайт', slug: 'site', domain: null, settings: null, status: 'DRAFT', workingRevision: 0, publishedRevision: 0 };
  const revisions = [];
  const prisma = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return callback({
        site: {
          create: async ({ data }) => { site = { ...site, ...data }; return site; },
          findUnique: async () => site,
          update: async ({ data }) => { site = { ...site, ...data }; return site; },
        },
      });
    },
  };
  const publications = {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: revisions.length };
    },
  };
  const controller = new AdminSitesController(prisma, publications);

  const created = await controller.create({ providerId: 'provider-1', name: 'Сайт', slug: 'site' }, { user: { id: 'user-1' } });
  const updated = await controller.update('site-1', { name: 'Новый сайт' }, { user: { id: 'user-1' } });

  assert.equal(created.workingRevision, 1);
  assert.equal(updated.workingRevision, 2);
  assert.deepEqual(revisions.map((revision) => ({ entityType: revision.entityType, action: revision.action, actorId: revision.actorId })), [
    { entityType: 'SITE', action: 'CREATE', actorId: 'user-1' },
    { entityType: 'SITE', action: 'UPDATE', actorId: 'user-1' },
  ]);
});

test('region create and update save working revisions and reject moving between sites', async () => {
  let region = { id: 'region-1', siteId: 'site-1', name: 'Регион', slug: 'region', phone: null, content: null };
  const revisions = [];
  const prisma = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return callback({
        region: {
          create: async ({ data }) => { region = { ...region, ...data }; return region; },
          findUnique: async () => region,
          update: async ({ data }) => { region = { ...region, ...data }; return region; },
        },
      });
    },
  };
  const controller = new AdminRegionsController(prisma, {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: revisions.length + 4 };
    },
  });

  const created = await controller.create({ siteId: 'site-1', name: 'Регион', slug: 'region' }, { user: { id: 'user-1' } });
  const updated = await controller.update('region-1', { name: 'Новый регион' }, { user: { id: 'user-1' } });

  assert.equal(created.workingRevision, 5);
  assert.equal(updated.workingRevision, 6);
  assert.deepEqual(revisions.map((revision) => ({ entityType: revision.entityType, action: revision.action, actorId: revision.actorId })), [
    { entityType: 'REGION', action: 'CREATE', actorId: 'user-1' },
    { entityType: 'REGION', action: 'UPDATE', actorId: 'user-1' },
  ]);
  await assert.rejects(
    controller.update('region-1', { siteId: 'site-2' }, { user: { id: 'user-1' } }),
    /нельзя переносить между сайтами/i,
  );
});

test('provider update creates one attributed working revision per affected site', async () => {
  const revisions = [];
  const provider = { id: 'provider-1', name: 'Дом.ру', slug: 'domru', legalData: null, settings: null };
  const prisma = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return callback({
        provider: {
          findUnique: async () => provider,
          update: async ({ data }) => ({ ...provider, ...data }),
        },
        site: { findMany: async () => [{ id: 'site-1' }, { id: 'site-2' }] },
      });
    },
  };
  const controller = new AdminProvidersController(prisma, {
    recordWorkingRevision: async (_transaction, input) => {
      revisions.push(input);
      return { siteRevision: revisions.length + 10 };
    },
  });

  const result = await controller.update('provider-1', { name: 'Дом.ру партнер' }, { user: { id: 'user-1' } });

  assert.deepEqual(result.workingRevisions, [
    { siteId: 'site-1', workingRevision: 11 },
    { siteId: 'site-2', workingRevision: 12 },
  ]);
  assert.deepEqual(revisions.map((revision) => ({ siteId: revision.siteId, entityType: revision.entityType, actorId: revision.actorId })), [
    { siteId: 'site-1', entityType: 'PROVIDER', actorId: 'user-1' },
    { siteId: 'site-2', entityType: 'PROVIDER', actorId: 'user-1' },
  ]);
});

test('entity revision sequence is global for a provider shared by multiple sites', async () => {
  const aggregateQueries = [];
  const revisions = [];
  const transaction = {
    site: { update: async ({ where }) => ({ id: where.id, workingRevision: 1 }) },
    contentRevision: {
      aggregate: async ({ where }) => {
        aggregateQueries.push(where);
        const current = revisions.filter((revision) => revision.entityType === where.entityType && revision.entityId === where.entityId);
        return { _max: { entityRevision: current.at(-1)?.entityRevision || null } };
      },
      create: async ({ data }) => { revisions.push(data); return data; },
    },
    auditEvent: { create: async ({ data }) => data },
  };
  const workflow = new PublicationWorkflowService(undefined, undefined);

  await workflow.recordWorkingRevision(transaction, {
    siteId: 'site-1', entityType: 'PROVIDER', entityId: 'provider-1', action: 'UPDATE',
    snapshot: { name: 'Первое' }, changedFields: ['name'], source: 'admin',
  });
  await workflow.recordWorkingRevision(transaction, {
    siteId: 'site-2', entityType: 'PROVIDER', entityId: 'provider-1', action: 'UPDATE',
    snapshot: { name: 'Второе' }, changedFields: ['name'], source: 'admin',
  });

  assert.deepEqual(revisions.map((revision) => revision.entityRevision), [1, 2]);
  assert.equal(aggregateQueries.some((where) => Object.hasOwn(where, 'siteId')), false);
});

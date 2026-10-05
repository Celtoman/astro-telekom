const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const { PublicationWorkflowController } = require('../apps/api/dist/publication-workflow.controller.js');

test('exact build snapshot reads its immutable publication without consulting current working data', async () => {
  const catalog = { site: { slug: 'domru-site' }, cities: [], marker: 'saved A' };
  const publication = { id: 'pub-a', siteId: 'site-1', siteRevision: 7, status: 'PENDING', catalog };
  const prisma = { site: { findUnique: async () => ({ id: 'site-1', slug: 'domru-site', workingRevision: 9 }) },
    sitePublication: { findUnique: async ({ where }) => where.id === 'pub-a' ? publication : null,
      findFirst: async () => { throw new Error('Must not select the latest snapshot'); } } };
  const service = new PublicationWorkflowService(prisma, { listBySiteId: async () => { throw new Error('Must not render working data'); } });
  const result = await service.getExactBuildSnapshot('domru-site', 'pub-a');
  assert.deepEqual(result, { publicationId: 'pub-a', siteId: 'site-1', siteSlug: 'domru-site', siteRevision: 7,
    catalogDigest: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), catalog });
  const controller = new PublicationWorkflowController(service, {});
  assert.deepEqual(await controller.exactBuildSnapshot('domru-site', 'pub-a'), result);
  publication.status = 'SUCCEEDED';
  assert.deepEqual(await service.getExactBuildSnapshot('domru-site', 'pub-a'), result);
});

test('exact build snapshot rejects foreign, missing and retired publications', async () => {
  let publication = { id: 'pub-a', siteId: 'other', status: 'PENDING', siteRevision: 1, catalog: {} };
  const prisma = { site: { findUnique: async () => ({ id: 'site-1', slug: 'domru-site' }) }, sitePublication: { findUnique: async () => publication } };
  const service = new PublicationWorkflowService(prisma, {});
  await assert.rejects(service.getExactBuildSnapshot('domru-site', 'pub-a'), e => e.getStatus() === 404);
  publication = null;
  await assert.rejects(service.getExactBuildSnapshot('domru-site', 'pub-a'), e => e.getStatus() === 404);
  for (const status of ['FAILED', 'CANCELLED']) {
    publication = { id: 'pub-a', siteId: 'site-1', status, siteRevision: 1, catalog: {} };
    await assert.rejects(service.getExactBuildSnapshot('domru-site', 'pub-a'), e => e.getStatus() === 409);
  }
});

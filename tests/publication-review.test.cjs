const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const { PublicationWorkflowController } = require('../apps/api/dist/publication-workflow.controller.js');
const { publicationSource, city } = require('./helpers/publication-source.cjs');
const { buildReleaseOneRoutes } = require('../apps/api/dist/public-route-policy.js');

function fixture() {
  const site = { id: 'site-1', name: 'Дом.ру', workingRevision: 8, publishedRevision: 5 };
  const input = publicationSource([city('kazan', ['internet'])]);
  const rows = [
    { id: 'r8', siteRevision: 8, entityType: 'SITE', entityId: site.id, action: 'UPDATE', changedFields: ['seoTemplate'], source: 'admin-seo-templates', createdAt: new Date(), snapshot: { seoTemplate: { kind: 'CITY_HOME', titleTemplate: 'Новый Title' }, secret: 'must not be returned' }, previousSnapshot: { seoTemplate: { kind: 'CITY_HOME', titleTemplate: 'Старый Title' } } },
    { id: 'r7', siteRevision: 7, entityType: 'CITY', entityId: 'city-kazan', action: 'UPDATE', changedFields: ['name'], source: 'admin', createdAt: new Date(), snapshot: { name: 'Казань', privateSettings: 'must not be returned' } },
  ];
  const forbidden = () => { throw new Error('review must not write'); };
  const prisma = {
    site: { findUnique: async ({ where }) => where.id === site.id ? site : null, update: forbidden },
    contentRevision: {
      findMany: async ({ where, take, select }) => {
        assert.equal(where.siteId, site.id);
        assert.deepEqual(where.siteRevision, { gt: 5, lte: 8 });
        assert.equal(take, 100);
        assert.equal(select.snapshot, true);
        return rows;
      },
      count: async () => 127,
      create: forbidden,
    },
    sitePublication: { create: forbidden, update: forbidden },
    sitePublicationValidation: { create: forbidden },
    auditEvent: { create: forbidden },
    $transaction: async (operation, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return operation(prisma);
    },
  };
  const catalog = {
    captureSourceBySiteId: async () => input,
    renderSource: (source) => ({ site: source.site, routes: buildReleaseOneRoutes(source.cities, source.globalPages) }),
  };
  return { service: new PublicationWorkflowService(prisma, catalog), site, input, rows };
}

test('publication review checks all routes and bounds the change list without writing or exposing snapshots', async () => {
  const { service } = fixture();
  assert.equal(typeof service.getPublicationReview, 'function', 'read-only review is missing');
  const result = await service.getPublicationReview('site-1');
  assert.equal(result.workingRevision, 8);
  assert.equal(result.publishedRevision, 5);
  assert.equal(result.hasUnpublishedChanges, true);
  assert.equal(result.totalChanges, 127);
  assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].subject, 'Главные страницы городов');
  assert.deepEqual(result.changes[0].textChanges, [{ label: 'Title', before: 'Старый Title', after: 'Новый Title' }]);
  assert.equal(result.changes[1].subject, 'Казань');
  assert.equal(result.validation.outcome, 'PASSED');
  assert.equal(result.validation.checkedUrlCount, 8);
  assert.equal(result.validation.siteRevision, result.workingRevision);
  assert.doesNotMatch(JSON.stringify(result), /must not be returned|sourceSnapshot/);
});

test('review explains a blocking invalid title before a publication is created', async () => {
  const { service, input } = fixture();
  assert.equal(typeof service.getPublicationReview, 'function');
  input.seoTemplates.find((row) => row.kind === 'CITY_HOME').titleTemplate = '';
  const result = await service.getPublicationReview('site-1');
  assert.equal(result.validation.outcome, 'BLOCKED');
  assert.ok(result.validation.issues.some((issue) => issue.severity === 'BLOCKING' && issue.path === '/kazan'));
});

test('review rejects an unknown site and controller delegates the authenticated read', async () => {
  const { service } = fixture();
  assert.equal(typeof service.getPublicationReview, 'function');
  await assert.rejects(service.getPublicationReview('missing'), /Site not found/);
  const controller = new PublicationWorkflowController(service, { enqueue: () => { throw new Error('must not enqueue'); } });
  assert.equal(typeof controller.review, 'function');
  assert.equal((await controller.review('site-1')).siteId, 'site-1');
});

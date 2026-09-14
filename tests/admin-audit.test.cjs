const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AdminAuditEventsController, AuditEventListQueryDto } = require('../apps/api/dist/admin-audit-events.controller.js');
const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');

const queryMetadata = (metatype) => ({ type: 'query', metatype, data: undefined });

test('audit journal returns a bounded filtered cursor page without heavy changes', async () => {
  const calls = { findMany: [], count: [] };
  const rows = [
    { id: 'event-3', createdAt: new Date('2026-09-15T03:00:00Z') },
    { id: 'event-2', createdAt: new Date('2026-09-15T02:00:00Z') },
    { id: 'event-1', createdAt: new Date('2026-09-15T01:00:00Z') },
  ];
  const prisma = {
    auditEvent: {
      findMany: async (query) => { calls.findMany.push(query); return rows; },
      count: async (query) => { calls.count.push(query); return 12; },
    },
    $transaction: async (queries) => Promise.all(queries),
  };
  const controller = new AdminAuditEventsController(prisma);

  const result = await controller.list({
    siteId: 'site-1', limit: 2, q: ' admin@example.test ', entityType: 'TARIFF', action: 'UPDATE',
  });

  assert.deepEqual(result.items.map((item) => item.id), ['event-3', 'event-2']);
  assert.deepEqual(result.pageInfo, {
    limit: 2,
    total: 12,
    hasNextPage: true,
    nextCursor: result.pageInfo.nextCursor,
  });
  assert.equal(typeof result.pageInfo.nextCursor, 'string');
  assert.equal(calls.findMany[0].take, 3);
  assert.deepEqual(calls.findMany[0].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(calls.findMany[0].select.changes, undefined);
  const listWhere = JSON.stringify(calls.findMany[0].where);
  assert.match(listWhere, /site-1/);
  assert.match(listWhere, /TARIFF/);
  assert.match(listWhere, /UPDATE/);
  assert.match(listWhere, /admin@example\.test/);
  assert.doesNotMatch(JSON.stringify(calls.count[0].where), /"lt"/);
});

test('audit detail returns field changes and safe actor and site context', async () => {
  let query;
  const event = {
    id: 'event-1', siteId: 'site-1', siteRevision: 7, entityType: 'CITY', entityId: 'city-1', action: 'UPDATE',
    changedFields: ['name'], changes: { name: { before: 'Казань', after: 'Новая Казань' } }, source: 'admin',
    actorId: 'user-1', actor: { id: 'user-1', email: 'admin@example.test' }, site: { id: 'site-1', name: 'Дом.ру', slug: 'domru' },
    createdAt: new Date('2026-09-15T00:00:00Z'),
  };
  const controller = new AdminAuditEventsController({
    auditEvent: { findUnique: async (input) => { query = input; return event; } },
  });

  const result = await controller.detail('event-1');

  assert.equal(result.changes.name.before, 'Казань');
  assert.equal(result.actor.email, 'admin@example.test');
  assert.equal(query.select.changes, true);
  assert.deepEqual(query.select.actor.select, { id: true, email: true });
  assert.deepEqual(query.select.site.select, { id: true, name: true, slug: true });
});

test('audit query validates required site and allowlisted filters', async () => {
  const pipe = createGlobalValidationPipe();
  const valid = await pipe.transform(
    { siteId: 'site-1', limit: '1000', entityType: 'PAGE', action: 'ARCHIVE' },
    queryMetadata(AuditEventListQueryDto),
  );
  assert.deepEqual({ siteId: valid.siteId, limit: valid.limit, entityType: valid.entityType, action: valid.action }, {
    siteId: 'site-1', limit: 100, entityType: 'PAGE', action: 'ARCHIVE',
  });
  await assert.rejects(
    pipe.transform({ limit: '25' }, queryMetadata(AuditEventListQueryDto)),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    pipe.transform({ siteId: 'site-1', action: 'DELETE', unexpected: true }, queryMetadata(AuditEventListQueryDto)),
    (error) => error.getStatus() === 400,
  );
});

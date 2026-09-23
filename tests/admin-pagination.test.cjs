const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AdminTariffsController } = require('../apps/api/dist/admin-tariffs.controller.js');
const { CursorPageQueryDto } = require('../apps/api/dist/admin-pagination.js');
const { TariffListQueryDto } = require('../apps/api/dist/tariff.dto.js');
const { CrmLeadsController, LeadListQueryDto } = require('../apps/api/dist/crm-leads.controller.js');
const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');

const queryMetadata = (metatype) => ({ type: 'query', metatype, data: undefined });

function transactionPrisma(modelName, rows, counts) {
  const calls = { findMany: [], count: [] };
  let countIndex = 0;
  return {
    calls,
    client: {
      [modelName]: {
        findMany: async (query) => {
          calls.findMany.push(query);
          return rows;
        },
        count: async (query) => {
          calls.count.push(query);
          return counts[countIndex++];
        },
      },
      site: { findMany: async () => [] },
      $transaction: async (queries) => Promise.all(queries),
    },
  };
}

test('lead journal returns a bounded cursor page and a minimal list DTO', async () => {
  const rows = [
    { id: 'lead-3', createdAt: new Date('2026-09-10T03:00:00Z') },
    { id: 'lead-2', createdAt: new Date('2026-09-10T02:00:00Z') },
    { id: 'lead-1', createdAt: new Date('2026-09-10T01:00:00Z') },
  ];
  const prisma = transactionPrisma('lead', rows, [7, 9, 4, 2, 1]);
  const controller = new CrmLeadsController(prisma.client);

  const result = await controller.list({ limit: 2, q: '  Казань  ', status: 'NEW' });

  assert.deepEqual(result.items.map((item) => item.id), ['lead-3', 'lead-2']);
  assert.deepEqual(result.pageInfo, {
    limit: 2,
    total: 7,
    hasNextPage: true,
    nextCursor: result.pageInfo.nextCursor,
  });
  assert.equal(typeof result.pageInfo.nextCursor, 'string');
  assert.deepEqual(result.summary, { total: 9, new: 4, pending: 2, attention: 1 });
  assert.equal(prisma.calls.findMany[0].take, 3);
  assert.deepEqual(prisma.calls.findMany[0].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(prisma.calls.findMany[0].select.history, undefined);
  assert.equal(prisma.calls.findMany[0].select.deliveryAttempts, undefined);
  assert.equal(prisma.calls.findMany[0].select.activityEvents, undefined);
  assert.equal(prisma.calls.findMany[0].where.AND[0].status, 'NEW');
  const attentionFilter = prisma.calls.count.at(-1).where.OR;
  assert.ok(attentionFilter[0].processingStatus.in.includes('DELIVERY_EMAIL_OUTCOME_UNKNOWN'));
  assert.equal(attentionFilter[1].processingStatus, 'PENDING');
  assert.deepEqual(attentionFilter[1].deliveryAttempts.some, { channel: 'API', status: 'FAILED', nextAttemptAt: null });
});

test('lead journal filters by immutable reason snapshot and exposes the closed registry', async () => {
  const prisma = transactionPrisma('lead', [], [0, 0, 0, 0, 0, 0]);
  const controller = new CrmLeadsController(prisma.client);
  const reasons = controller.reasons();
  assert.deepEqual(reasons.map((item) => item.code), ['new_connection', 'existing_subscriber_support', 'billing', 'relocation', 'other']);
  await controller.list({ reasonCode: 'billing' });
  assert.deepEqual(prisma.calls.findMany[0].where.AND[0], { reasonCode: 'billing' });
  assert.equal(prisma.calls.findMany[0].select.reasonLabel, true);
  const pipe = createGlobalValidationPipe();
  const transformed = await pipe.transform({ reasonCode: 'billing' }, queryMetadata(LeadListQueryDto));
  assert.equal(transformed.reasonCode, 'billing');
  await assert.rejects(pipe.transform({ reasonCode: 'domofon' }, queryMetadata(LeadListQueryDto)), (error) => error.getStatus() === 400);
});

test('tariff catalog applies server search and enforces the page-size upper bound', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: `tariff-${index}`,
    updatedAt: new Date(`2026-09-10T00:00:${String(index % 60).padStart(2, '0')}Z`),
  }));
  const prisma = transactionPrisma('tariff', rows, [3_859]);
  const controller = new AdminTariffsController(prisma.client, {}, {});

  const result = await controller.list({ limit: 1_000, q: '  Гига  ' });

  assert.equal(result.items.length, 100);
  assert.equal(result.pageInfo.limit, 100);
  assert.equal(result.pageInfo.total, 3_859);
  assert.equal(result.pageInfo.hasNextPage, true);
  assert.equal(prisma.calls.findMany[0].take, 101);
  assert.deepEqual(prisma.calls.findMany[0].orderBy, [{ updatedAt: 'desc' }, { id: 'desc' }]);
  assert.equal(prisma.calls.findMany[0].where.AND[0].OR.length, 3);
  assert.deepEqual(prisma.calls.findMany[0].where.AND[0].OR.map((item) => Object.keys(item)[0]), ['name', 'slug', 'externalId']);
});

test('tariff catalog applies all Release 1 filters on the server and separates site publication state', async () => {
  const calls = [];
  const row = {
    id: 'tariff-1', updatedAt: new Date('2026-09-10T00:00:00Z'),
    city: { site: { id: 'site-1', workingRevision: 4, publishedRevision: 3 } },
  };
  const prisma = {
    site: { findMany: async () => [{ id: 'site-1', workingRevision: 4, publishedRevision: 3 }] },
    tariff: {
      findMany: async (query) => { calls.push(query); return [row]; },
      count: async () => 1,
    },
    $transaction: async (queries) => Promise.all(queries),
  };

  const result = await new AdminTariffsController(prisma, {}, {}).list({
    cityId: 'city-1', regionId: 'region-1', serviceType: 'INTERNET', status: 'DRAFT', source: 'manual',
    promotion: 'WITH', archiveReason: 'NONE', unpublished: 'true', q: 'external-1',
  });

  const where = JSON.stringify(calls[0].where);
  for (const expected of ['city-1', 'region-1', 'INTERNET', 'DRAFT', 'manual', 'site-1', 'externalId']) assert.match(where, new RegExp(expected));
  assert.equal(result.items[0].publicationState, 'UNPUBLISHED');
  assert.equal(result.items[0].hasUnpublishedChanges, true);

  const pipe = createGlobalValidationPipe();
  const transformed = await pipe.transform({ promotion: 'WITHOUT', unpublished: 'false' }, queryMetadata(TariffListQueryDto));
  assert.equal(transformed.promotion, 'WITHOUT');
  await assert.rejects(pipe.transform({ unpublished: 'sometimes' }, queryMetadata(TariffListQueryDto)), (error) => error.getStatus() === 400);
});

test('admin list endpoints reject malformed opaque cursors', async () => {
  const leads = transactionPrisma('lead', [], [0, 0, 0, 0, 0]);
  const tariffs = transactionPrisma('tariff', [], [0]);

  await assert.rejects(
    new CrmLeadsController(leads.client).list({ cursor: 'not-a-cursor' }),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    new AdminTariffsController(tariffs.client, {}, {}).list({ cursor: 'not-a-cursor' }),
    (error) => error.getStatus() === 400,
  );

  const pipe = createGlobalValidationPipe();
  const bounded = await pipe.transform({ limit: '1000', q: 'Гига' }, queryMetadata(CursorPageQueryDto));
  assert.deepEqual({ limit: bounded.limit, q: bounded.q }, { limit: 100, q: 'Гига' });
  await assert.rejects(
    pipe.transform({ status: 'UNKNOWN' }, queryMetadata(LeadListQueryDto)),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    pipe.transform({ limit: '25', unexpected: 'value' }, queryMetadata(CursorPageQueryDto)),
    (error) => error.getStatus() === 400,
  );
});

test('cursor boundaries do not reduce the reported number of filter matches', async () => {
  const firstRows = [
    { id: 'tariff-2', updatedAt: new Date('2026-09-10T02:00:00Z') },
    { id: 'tariff-1', updatedAt: new Date('2026-09-10T01:00:00Z') },
  ];
  const first = transactionPrisma('tariff', firstRows, [12]);
  const firstPage = await new AdminTariffsController(first.client, {}, {}).list({ limit: 1, q: 'Гига' });
  const second = transactionPrisma('tariff', [], [12]);

  const secondPage = await new AdminTariffsController(second.client, {}, {}).list({
    limit: 1,
    q: 'Гига',
    cursor: firstPage.pageInfo.nextCursor,
  });

  assert.equal(secondPage.pageInfo.total, 12);
  assert.doesNotMatch(JSON.stringify(second.calls.count[0]), /"lt"/);
  assert.match(JSON.stringify(second.calls.findMany[0].where), /"lt"/);
});

test('cursor sort columns have database indexes', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const tariff = schema.slice(schema.indexOf('model Tariff {'), schema.indexOf('model TariffImportRun {'));
  const lead = schema.slice(schema.indexOf('model Lead {'), schema.indexOf('model LeadNotification {'));

  assert.match(tariff, /@@index\(\[updatedAt, id\]\)/);
  assert.match(lead, /@@index\(\[createdAt, id\]\)/);
});

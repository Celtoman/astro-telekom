const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const { PublicationWorkflowController } = require('../apps/api/dist/publication-workflow.controller.js');

function fixture() {
  const sites = new Map([
    ['site-1', {
      id: 'site-1',
      slug: 'domru-kazan',
      workingRevision: 0,
      publishedRevision: 0,
    }],
  ]);
  const publications = new Map();
  const contentRevisions = [];
  const auditEvents = [];
  let rebuild = null;
  let publicationSequence = 0;

  const prisma = {
    site: {
      findUnique: async ({ where }) => {
        if (where.id) return sites.get(where.id) || null;
        return [...sites.values()].find((site) => site.slug === where.slug) || null;
      },
      update: async ({ where, data }) => {
        const current = sites.get(where.id);
        const workingRevision = data.workingRevision?.increment
          ? current.workingRevision + data.workingRevision.increment
          : data.workingRevision ?? current.workingRevision;
        const next = {
          ...current,
          ...data,
          workingRevision,
          publishedRevision: data.publishedRevision ?? current.publishedRevision,
        };
        sites.set(where.id, next);
        return next;
      },
    },
    contentRevision: {
      aggregate: async ({ where }) => ({
        _max: {
          entityRevision: contentRevisions
            .filter((row) => row.siteId === where.siteId && row.entityType === where.entityType && row.entityId === where.entityId)
            .reduce((maximum, row) => Math.max(maximum, row.entityRevision), 0) || null,
        },
      }),
      create: async ({ data }) => {
        const row = { id: `revision-${contentRevisions.length + 1}`, createdAt: new Date(), ...data };
        contentRevisions.push(row);
        return row;
      },
    },
    auditEvent: {
      create: async ({ data }) => {
        const row = { id: `audit-${auditEvents.length + 1}`, createdAt: new Date(), ...data };
        auditEvents.push(row);
        return row;
      },
    },
    sitePublication: {
      create: async ({ data }) => {
        publicationSequence += 1;
        const row = { id: `publication-${publicationSequence}`, status: 'PENDING', createdAt: new Date(publicationSequence), ...data };
        publications.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }) => {
        if (where.id) return publications.get(where.id) || null;
        if (where.siteId_siteRevision) {
          return [...publications.values()].find((row) => (
            row.siteId === where.siteId_siteRevision.siteId
            && row.siteRevision === where.siteId_siteRevision.siteRevision
          )) || null;
        }
        return null;
      },
      findFirst: async ({ where, orderBy, select }) => {
        const rows = [...publications.values()].filter((row) => {
          if (where.siteId && row.siteId !== where.siteId) return false;
          if (where.status && row.status !== where.status) return false;
          return true;
        });
        if (orderBy?.siteRevision === 'desc') rows.sort((a, b) => b.siteRevision - a.siteRevision);
        const row = rows[0] || null;
        if (!row || !select) return row;
        return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]]));
      },
      update: async ({ where, data }) => {
        const row = { ...publications.get(where.id), ...data };
        publications.set(row.id, row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        const row = publications.get(where.id);
        if (!row || (where.status && row.status !== where.status)) return { count: 0 };
        publications.set(row.id, { ...row, ...data });
        return { count: 1 };
      },
    },
    siteRebuild: {
      findUnique: async ({ where }) => {
        if (where.siteId) return rebuild?.siteId === where.siteId ? rebuild : null;
        return rebuild;
      },
    },
    $transaction: async (callback) => callback(prisma),
  };

  const catalogService = {
    listBySiteId: async (siteId) => ({ site: { id: siteId, slug: 'domru-kazan' }, marker: 'working' }),
  };
  const service = new PublicationWorkflowService(prisma, catalogService);
  return {
    service,
    prisma,
    sites,
    publications,
    contentRevisions,
    auditEvents,
    setRebuild(value) { rebuild = value; },
  };
}

test('saving an entity creates an immutable working revision and audit event', async () => {
  const f = fixture();

  const first = await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1',
    entityType: 'TARIFF',
    entityId: 'tariff-1',
    action: 'UPDATE',
    previousSnapshot: { name: 'Гига 300', standardPrice: '850' },
    snapshot: { name: 'Гига 300', standardPrice: '900' },
    changedFields: ['name', 'standardPrice'],
    actorId: 'user-1',
    source: 'admin',
  });
  const second = await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1',
    entityType: 'TARIFF',
    entityId: 'tariff-1',
    action: 'UPDATE',
    previousSnapshot: { name: 'Гига 300', standardPrice: '900' },
    snapshot: { name: 'Гига 300', standardPrice: '950' },
    changedFields: ['standardPrice'],
    actorId: 'user-1',
    source: 'admin',
  });

  assert.equal(first.siteRevision, 1);
  assert.equal(first.entityRevision, 1);
  assert.equal(second.siteRevision, 2);
  assert.equal(second.entityRevision, 2);
  assert.deepEqual(f.contentRevisions.map((row) => row.snapshot.standardPrice), ['900', '950']);
  assert.deepEqual(f.contentRevisions.map((row) => row.previousSnapshot.standardPrice), ['850', '900']);
  assert.deepEqual(f.auditEvents.map((row) => row.siteRevision), [1, 2]);
  assert.deepEqual(f.auditEvents[0].changes, {
    name: { before: 'Гига 300', after: 'Гига 300' },
    standardPrice: { before: '850', after: '900' },
  });
  assert.deepEqual(f.auditEvents[1].changes, {
    standardPrice: { before: '900', after: '950' },
  });
  assert.equal(f.sites.get('site-1').publishedRevision, 0);
});

test('the build reads the fixed processing snapshot even when a newer publication is requested', async () => {
  const f = fixture();
  const first = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 1,
    catalog: { site: { slug: 'domru-kazan' }, marker: 'first' },
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });
  const second = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 2,
    catalog: { site: { slug: 'domru-kazan' }, marker: 'second' },
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });
  f.setRebuild({
    siteId: 'site-1',
    processingPublicationId: first.id,
    requestedPublicationId: second.id,
  });

  const catalog = await f.service.getBuildCatalog('domru-kazan');

  assert.equal(catalog.marker, 'first');
});

test('a legacy rebuild without a publication snapshot reads the current working catalog', async () => {
  const f = fixture();
  const published = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 0,
    catalog: { site: { slug: 'domru-kazan' }, marker: 'published' },
    triggerEntity: 'bootstrap',
    triggerEntityId: 'site-1',
  });
  await f.service.markSucceeded(published.id, { deploymentId: 'deploy-1' });
  f.setRebuild({
    siteId: 'site-1',
    status: 'RUNNING',
    processingPublicationId: null,
    requestedPublicationId: null,
  });

  const catalog = await f.service.getBuildCatalog('domru-kazan');

  assert.equal(catalog.marker, 'working');
});

test('capturing a publication stores the catalog from the same working revision', async () => {
  const f = fixture();
  const revision = await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1', entityType: 'TARIFF', entityId: 'tariff-1', action: 'UPDATE',
    snapshot: { name: 'Гига 300' }, changedFields: ['name'], source: 'admin',
  });

  const publication = await f.service.captureWorkingPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: revision.siteRevision,
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });

  assert.equal(publication.siteRevision, 1);
  assert.equal(publication.catalog.marker, 'working');
  assert.equal(publication.status, 'PENDING');
});

test('the first build freezes the current catalog as the successful baseline', async () => {
  const f = fixture();

  const catalog = await f.service.getBuildCatalog('domru-kazan');

  assert.equal(catalog.marker, 'working');
  const [baseline] = [...f.publications.values()];
  assert.equal(baseline.siteRevision, 0);
  assert.equal(baseline.status, 'SUCCEEDED');
  assert.ok(baseline.publishedAt instanceof Date);
});

test('a failed publication preserves the last published revision', async () => {
  const f = fixture();
  const published = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 1,
    catalog: { site: { slug: 'domru-kazan' }, marker: 'published' },
    triggerEntity: 'bootstrap',
    triggerEntityId: 'site-1',
  });
  await f.service.markSucceeded(published.id, { deploymentId: 'deploy-1' });
  const candidate = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 2,
    catalog: { site: { slug: 'domru-kazan' }, marker: 'candidate' },
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });

  await f.service.markFailed(candidate.id, 'Coolify failed');

  assert.equal(f.sites.get('site-1').publishedRevision, 1);
  assert.equal(f.publications.get(candidate.id).status, 'FAILED');
  assert.equal(f.publications.get(candidate.id).lastError, 'Coolify failed');
  assert.equal((await f.service.getPublishedCatalog('domru-kazan')).marker, 'published');
});

test('explicit publication captures exactly the expected working revision and is idempotent while pending', async () => {
  const f = fixture();
  await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1', entityType: 'PAGE', entityId: 'page-1', action: 'UPDATE',
    snapshot: { title: 'Новая версия' }, changedFields: ['title'], source: 'admin',
  });

  const first = await f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 1, triggerEntity: 'site', triggerEntityId: 'site-1', requestedById: 'user-1',
  });
  const second = await f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 1, triggerEntity: 'site', triggerEntityId: 'site-1', requestedById: 'user-1',
  });

  assert.equal(first.id, second.id);
  assert.equal(first.siteRevision, 1);
  assert.equal(f.publications.size, 1);
});

test('explicit publication rejects a stale revision and a site without unpublished changes', async () => {
  const f = fixture();
  await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1', entityType: 'PAGE', entityId: 'page-1', action: 'UPDATE',
    snapshot: { title: 'Новая версия' }, changedFields: ['title'], source: 'admin',
  });

  await assert.rejects(() => f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 0, triggerEntity: 'site', triggerEntityId: 'site-1',
  }), /рабочая ревизия/i);

  f.sites.get('site-1').publishedRevision = 1;
  await assert.rejects(() => f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 1, triggerEntity: 'site', triggerEntityId: 'site-1',
  }), /нет неопубликованных изменений/i);
});

test('publication controller enqueues the exact snapshot and returns current publication state', async () => {
  const publication = { id: 'publication-7', siteId: 'site-1', siteRevision: 7, status: 'PENDING' };
  const calls = [];
  const publications = {
    preparePublication: async (input) => { calls.push(['prepare', input]); return publication; },
    getState: async (siteId) => ({ siteId, workingRevision: 7, publishedRevision: 6, hasUnpublishedChanges: true }),
  };
  const rebuilds = {
    enqueue: async (input) => { calls.push(['enqueue', input]); return { id: 'rebuild-1', status: 'QUEUED' }; },
  };
  const controller = new PublicationWorkflowController(publications, rebuilds);

  const created = await controller.create('site-1', { expectedWorkingRevision: 7 }, { user: { id: 'user-1' } });
  const state = await controller.state('site-1');

  assert.equal(created.publication.id, 'publication-7');
  assert.equal(created.rebuild.id, 'rebuild-1');
  assert.equal(state.hasUnpublishedChanges, true);
  assert.deepEqual(calls, [
    ['prepare', { siteId: 'site-1', expectedWorkingRevision: 7, triggerEntity: 'site', triggerEntityId: 'site-1', requestedById: 'user-1' }],
    ['enqueue', { entity: 'site-publication', id: 'publication-7', siteId: 'site-1', publicationId: 'publication-7' }],
  ]);
});

test('publication controller marks a snapshot failed when its rebuild cannot be enqueued', async () => {
  const publication = { id: 'publication-8', siteId: 'site-1', siteRevision: 8, status: 'PENDING' };
  const calls = [];
  const publications = {
    preparePublication: async () => publication,
    markFailed: async (id, message) => {
      calls.push(['failed', id, message]);
      return { ...publication, status: 'FAILED', lastError: message };
    },
  };
  const controller = new PublicationWorkflowController(publications, {
    enqueue: async () => { throw new Error('Redis unavailable'); },
  });

  const result = await controller.create('site-1', { expectedWorkingRevision: 8 }, { user: { id: 'user-1' } });

  assert.equal(result.publication.status, 'FAILED');
  assert.equal(result.rebuild.status, 'ENQUEUE_FAILED');
  assert.match(result.rebuild.lastError, /Redis unavailable/);
  assert.deepEqual(calls, [['failed', 'publication-8', 'Redis unavailable']]);
});

test('publication state does not expose the full catalog or provider response', async () => {
  const f = fixture();
  await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1', entityType: 'PAGE', entityId: 'page-1', action: 'UPDATE',
    snapshot: { title: 'Новая версия' }, changedFields: ['title'], source: 'admin',
  });
  await f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 1, triggerEntity: 'site', triggerEntityId: 'site-1',
  });

  const state = await f.service.getState('site-1');

  assert.equal(state.latestPublication.siteRevision, 1);
  assert.equal('catalog' in state.latestPublication, false);
  assert.equal('providerResponse' in state.latestPublication, false);
});

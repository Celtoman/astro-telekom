const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
const { PublicationWorkflowController } = require('../apps/api/dist/publication-workflow.controller.js');
const { publicationSource, city } = require('./helpers/publication-source.cjs');
const { buildReleaseOneRoutes } = require('../apps/api/dist/public-route-policy.js');

test('audit changes retain nested object values, block data arrays and missing fields without reading prototypes', () => {
  const service = new PublicationWorkflowService({}, {});
  const changes = service.fieldChanges({
    previousSnapshot: { title: 'Before', content: { version: '1' }, blocks: [{ data: { title: 'Old block' } }, {}] },
    snapshot: { title: 'After', content: { version: '2' }, blocks: [{ data: { title: 'New block' } }, {}] },
    changedFields: ['title', 'content.version', 'blocks.data', 'blocks.0.data.title', 'missing', '__proto__.toString'],
  });
  assert.deepEqual(changes, {
    title: { before: 'Before', after: 'After' },
    'content.version': { before: '1', after: '2' },
    'blocks.data': { before: [{ title: 'Old block' }, null], after: [{ title: 'New block' }, null] },
    'blocks.0.data.title': { before: 'Old block', after: 'New block' },
    missing: { before: null, after: null },
    '__proto__.toString': { before: null, after: null },
  });
  assert.deepEqual(service.fieldChanges({ previousSnapshot: { 'content.version': 'literal' }, snapshot: {}, changedFields: ['content.version'] }), { 'content.version': { before: 'literal', after: null } });
});

function fixture() {
  const sites = new Map([
    ['site-1', {
      id: 'site-1',
      slug: 'domru-site',
      connectionPhone: '78005557244',
      supportPhone: '78002507777',
      workingRevision: 0,
      publishedRevision: 0,
    }],
  ]);
  const publications = new Map();
  const validations = new Map();
  const contentRevisions = [];
  const auditEvents = [];
  let rebuild = null;
  let publicationSequence = 0;
  let source = publicationSource();

  const prisma = {
    $queryRaw: async () => [],
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
            .filter((row) => row.entityType === where.entityType && row.entityId === where.entityId)
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
        const row = { id: `publication-${publicationSequence}`, status: 'PENDING', scopeKey:'legacy', releaseSequence:publicationSequence, createdAt: new Date(publicationSequence), ...data };
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
          if (where.status && (typeof where.status==='string'?row.status!==where.status:!where.status.in.includes(row.status))) return false;
          if (where.scopeKey?.not && row.scopeKey === where.scopeKey.not) return false;
          return true;
        });
        if (orderBy?.siteRevision === 'desc') rows.sort((a, b) => b.siteRevision - a.siteRevision);
        if (orderBy?.releaseSequence === 'desc') rows.sort((a,b)=>(b.releaseSequence??b.siteRevision)-(a.releaseSequence??a.siteRevision));
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
    sitePublicationValidation: {
      create: async ({ data }) => {
        const row = { id: `validation-${validations.size + 1}`, ...data };
        validations.set(row.id, row);
        return row;
      },
      findFirst: async ({ where }) => [...validations.values()].filter((row) => row.siteId === where.siteId).at(-1) || null,
      findMany: async ({ where }) => [...validations.values()].filter((row) => row.siteId === where.siteId).reverse(),
      findUnique: async ({ where }) => validations.get(where.id) || null,
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
    listBySiteId: async (siteId) => ({ site: { id: siteId, slug: 'domru-site' }, marker: 'working' }),
    captureSourceBySiteId: async () => source,
    renderSource: (source) => ({ site: source.site, routes: buildReleaseOneRoutes(source.cities, source.globalPages), marker: 'working' }),
  };
  const service = new PublicationWorkflowService(prisma, catalogService);
  return {
    service,
    prisma,
    sites,
    publications,
    validations,
    contentRevisions,
    auditEvents,
    setRebuild(value) { rebuild = value; },
    setSource(value) { source = value; },
  };
}

test('explicit SEO preview captures one SQL revision and runs the strict renderer after releasing the transaction', async () => {
  const source = { site: { id: 'site-1' }, cities: [], globalPages: [] };
  const rendered = { routes: [{ path: '/' }], seoByPath: { '/': { title: 'Home' } }, seoWarnings: [], cities: [] };
  const site = { id: source.site.id, workingRevision: 7, publishedRevision: 6 };
  const tx = { site: { findUnique: async () => site } };
  const stages = [];
  let inTransaction = false, renderError;
  const service = new PublicationWorkflowService({
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, 'Serializable');
      inTransaction = true;
      try { return await callback(tx); }
      finally { inTransaction = false; stages.push('release'); }
    },
  }, {
    async captureSourceBySiteId(siteId, client, preview) {
      assert.ok(inTransaction);
      assert.equal(siteId, site.id);
      assert.equal(client, tx);
      assert.deepEqual(preview, {});
      stages.push('capture');
      return source;
    },
    renderSource(captured, now) {
      assert.equal(captured, source);
      assert.ok(now instanceof Date);
      assert.equal(inTransaction, false);
      stages.push('render');
      if (renderError) throw renderError;
      return rendered;
    },
    async listBySiteId(siteId, client) {
      assert.ok(inTransaction);
      assert.equal(siteId, site.id);
      assert.equal(client, tx);
      stages.push('full');
      return rendered;
    },
  });
  assert.deepEqual(await service.getWorkingPreview(site.id, 'SEO'), {
    siteId: site.id, workingRevision: 7, publishedRevision: 6,
    catalog: { routes: rendered.routes, seoByPath: rendered.seoByPath, seoWarnings: rendered.seoWarnings },
  });
  assert.deepEqual(stages, ['capture', 'release', 'render']);
  renderError = new Error('Exact catalog validation error');
  await assert.rejects(service.getWorkingPreview(site.id, 'SEO'), { message: renderError.message });
  assert.deepEqual((await service.getWorkingPreview(site.id)).catalog, rendered);
  assert.deepEqual(stages, ['capture', 'release', 'render', 'capture', 'release', 'render', 'full', 'release']);
});

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
    catalog: { site: { slug: 'domru-site' }, marker: 'first' },
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });
  const second = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 2,
    catalog: { site: { slug: 'domru-site' }, marker: 'second' },
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });
  f.setRebuild({
    siteId: 'site-1',
    processingPublicationId: first.id,
    requestedPublicationId: second.id,
  });

  const catalog = await f.service.getBuildCatalog('domru-site');

  assert.equal(catalog.marker, 'first');
});

test('a legacy rebuild without a publication snapshot reads the current working catalog', async () => {
  const f = fixture();
  const published = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 0,
    catalog: { site: { slug: 'domru-site' }, marker: 'published' },
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

  const catalog = await f.service.getBuildCatalog('domru-site');

  assert.equal(catalog.marker, 'working');
});

test('capturing a publication stores the catalog from the same working revision', async () => {
  const f = fixture();
  const revision = await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1', entityType: 'TARIFF', entityId: 'tariff-1', action: 'UPDATE',
    snapshot: { name: 'Гига 300' }, changedFields: ['name'], source: 'admin',
  });

  const result = await f.service.captureWorkingPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: revision.siteRevision,
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });

  assert.equal(result.blocked, false);
  const publication = result.publication;
  assert.equal(publication.siteRevision, 1);
  assert.equal(publication.catalog.marker, 'working');
  assert.equal(publication.status, 'PENDING');
  assert.equal(publication.validationId, 'validation-1');
});

test('a blocked all-URL report persists without replacing the previous public version or enqueueing a publication', async () => {
  const f = fixture();
  const current = await f.service.createPublication(f.prisma, {
    siteId: 'site-1', siteRevision: 0, catalog: { marker: 'published' },
    triggerEntity: 'bootstrap', triggerEntityId: 'site-1',
  });
  await f.service.markSucceeded(current.id, { deploymentId: 'deploy-1' });
  await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1', entityType: 'TARIFF', entityId: 'tariff-1', action: 'UPDATE',
    snapshot: { standardPrice: '0' }, changedFields: ['standardPrice'], source: 'admin',
  });
  const broken = publicationSource([city('kazan', ['invalid'])]);
  broken.cities[0].tariffs[0].standardPrice = '0';
  f.setSource(broken);

  await assert.rejects(() => f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 1, triggerEntity: 'site', triggerEntityId: 'site-1', requestedById: 'user-1',
  }), /Отчет validation-1/);

  assert.equal(f.validations.size, 1);
  assert.equal(f.validations.get('validation-1').outcome, 'BLOCKED');
  assert.ok(f.validations.get('validation-1').report.issues.some((issue) => issue.path === '/kazan/invalid'));
  assert.equal(f.publications.size, 1);
  assert.equal(f.sites.get('site-1').publishedRevision, 0);
  assert.equal((await f.service.getPublishedCatalog('domru-site')).marker, 'published');

  broken.cities[0].tariffs[0].standardPrice = '700';
  await f.service.preparePublication({
    siteId: 'site-1', expectedWorkingRevision: 1, triggerEntity: 'site', triggerEntityId: 'site-1', requestedById: 'user-1',
  });
  assert.equal(f.validations.size, 2);
  assert.equal(f.validations.get('validation-1').sourceSnapshot.cities[0].tariffs[0].standardPrice, '0');
  assert.equal(f.validations.get('validation-2').outcome, 'PASSED');
});

test('the first build freezes the current catalog as the successful baseline', async () => {
  const f = fixture();

  const catalog = await f.service.getBuildCatalog('domru-site');

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
    catalog: { site: { slug: 'domru-site' }, marker: 'published' },
    triggerEntity: 'bootstrap',
    triggerEntityId: 'site-1',
  });
  await f.service.markSucceeded(published.id, { deploymentId: 'deploy-1' });
  const candidate = await f.service.createPublication(f.prisma, {
    siteId: 'site-1',
    siteRevision: 2,
    catalog: { site: { slug: 'domru-site' }, marker: 'candidate' },
    triggerEntity: 'tariff',
    triggerEntityId: 'tariff-1',
  });

  await f.service.markFailed(candidate.id, 'Coolify failed');

  assert.equal(f.sites.get('site-1').publishedRevision, 1);
  assert.equal(f.publications.get(candidate.id).status, 'FAILED');
  assert.equal(f.publications.get(candidate.id).lastError, 'Coolify failed');
  assert.equal((await f.service.getPublishedCatalog('domru-site')).marker, 'published');
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

test('working preview returns the current catalog without creating a publication snapshot', async () => {
  const f = fixture();
  await f.service.recordWorkingRevision(f.prisma, {
    siteId: 'site-1', entityType: 'PAGE', entityId: 'page-1', action: 'UPDATE',
    snapshot: { title: 'Рабочий заголовок' }, changedFields: ['title'], source: 'admin',
  });

  const preview = await f.service.getWorkingPreview('site-1');

  assert.equal(preview.siteId, 'site-1');
  assert.equal(preview.workingRevision, 1);
  assert.equal(preview.publishedRevision, 0);
  assert.equal(preview.catalog.marker, 'working');
  assert.equal(f.publications.size, 0);
});

test('publication controller exposes the protected working preview contract', async () => {
  const calls = [];
  const publications = {
    getWorkingPreview: async (siteId) => {
      calls.push(siteId);
      return { siteId, workingRevision: 9, publishedRevision: 7, catalog: { routes: [] } };
    },
  };
  const controller = new PublicationWorkflowController(publications, {});

  const result = await controller.preview('site-1');

  assert.equal(result.workingRevision, 9);
  assert.deepEqual(calls, ['site-1']);
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

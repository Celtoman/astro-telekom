import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const api = name => require(`../apps/api/dist/${name}.js`);
const { PublicationWorkflowService } = api('publication-workflow.service');

test('working preview reuses only the exact independently checked snapshot across async requests', async () => {
  const before = process.env.WORKING_PREVIEW_REUSE_ENABLED;
  process.env.WORKING_PREVIEW_REUSE_ENABLED = 'true';
  const site = { id: 'preview-site', slug: 'preview', status: 'PUBLISHED', workingRevision: 8, publishedRevision: 7 };
  const current = { fingerprint: 'initial', title: 'Первый', validationId: 'check-1', generation: 1, serves: true, invalidWorkingPage: false };
  const captured = Promise.withResolvers();
  const resume = Promise.withResolvers();
  let hold = true, captures = 0, reads = 0;
  const prisma = { async $transaction(callback) {
    const snap = { ...current };
    return callback({ snap, site: { findUnique: async () => site }, $queryRaw: async () => {
      reads++;
      return [{ digest: snap.fingerprint }];
    } });
  } };
  const catalogWithVerifiedDigest = { toJSON() { assert.fail('A verified digest must not serialize the catalog again'); } };
  const base = tx => ({ publication: { id: 'snapshot', releaseSequence: 4, validationId: tx.snap.validationId,
    catalogGeneration: tx.snap.generation, catalog: catalogWithVerifiedDigest }, verifiedCatalogDigest: 'verified', source: { redirects: [] } });
  const catalog = {
    async readWorkingPreviewBase(_site, tx) {
      if (!tx.snap.serves) throw new Error('Exact serving snapshot unavailable');
      return base(tx);
    },
    async captureSourceBySiteId(_id, tx, request) {
      captures++;
      assert.deepEqual(request.base, base(tx));
      if (hold) { hold = false; captured.resolve(); await resume.promise; }
      return tx.snap;
    },
    renderSource(source) {
      if (source.invalidWorkingPage) throw new Error('Another city is invalid');
      return { site: { name: source.title }, cities: [], globalPages: [],
        routes: [{ path: '/faq', kind: 'GLOBAL_PAGE', pageType: 'FAQ' }, { path: '/', kind: 'HOME' }] };
    },
  };
  const service = new PublicationWorkflowService(prisma, catalog);
  const otherInstance = new PublicationWorkflowService(prisma, catalog);
  const preview = (instance = service, path = '/faq') => instance.getWorkingPreviewPage(site.id, path, 8, 'snapshot');

  try {
    const first = preview();
    await captured.promise;
    const simultaneousSameInput = preview(service, '/');
    current.fingerprint = 'new-media-fingerprint';
    current.title = 'Изменённый';
    const independent = await preview(otherInstance);
    const differentInputWhileBusy = await preview();
    assert.equal(independent.catalog.site.name, 'Изменённый');
    assert.equal(differentInputWhileBusy.catalog.site.name, 'Изменённый');

    resume.resolve();
    const both = await Promise.all([first, simultaneousSameInput]);
    assert.ok(both.every(item => item.catalog.site.name === 'Первый'));
    assert.equal(captures, 3, 'The exact concurrent input captures only once');
    assert.equal((await preview()).catalog.site.name, 'Изменённый');
    assert.equal((await preview()).catalog.site.name, 'Изменённый');
    assert.equal(captures, 4);
    assert.equal(reads, 6, 'Cache hits still check the current database snapshot');

    current.validationId = 'retry-same-publication-id';
    await preview();
    assert.equal(captures, 5);
    current.generation = 2;
    await preview();
    assert.equal(captures, 6);
    current.serves = false;
    await assert.rejects(preview(), /Exact serving snapshot unavailable/);
    current.serves = true;
    current.fingerprint = 'invalid-unrelated-city';
    current.invalidWorkingPage = true;
    await assert.rejects(preview(), /Another city is invalid/);
    await assert.rejects(preview(otherInstance), /Another city is invalid/);
    assert.equal(site.workingRevision, 8);
  } finally {
    resume.resolve();
    if (before === undefined) delete process.env.WORKING_PREVIEW_REUSE_ENABLED;
    else process.env.WORKING_PREVIEW_REUSE_ENABLED = before;
  }
});

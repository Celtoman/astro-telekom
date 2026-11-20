const test = require('node:test');
const assert = require('node:assert/strict');
const helper = () => require('../apps/api/dist/publication-progress.js');
const rendererId = 'f'.repeat(64);
function sample(seconds = 20) {
  const stages = {};
  for (const [index, stage] of ['PREPARING', 'BUILDING', 'CHECKING', 'ACTIVATING', 'CONFIRMING'].entries()) {
    stages[stage] = { startedAt: new Date(index * seconds * 1000).toISOString(), completedAt: new Date((index + 1) * seconds * 1000).toISOString() };
  }
  return { version: 1, runId: 'run-historical', publicationId: 'history', revision: 1, sequence: 5, stage: 'CONFIRMING',
    rendererId, totalPages: 100, completedPages: 100, sampleEligible: true, stages,
    startedAt: stages.PREPARING.startedAt, updatedAt: stages.CONFIRMING.completedAt, completedAt: stages.CONFIRMING.completedAt };
}

test('publication work timings survive stages but reject unbounded or private fields',()=>{
 const {advanceCmsProgress}=helper();
 const current={...sample(),completedAt:null,stage:'CHECKING'};
 const next=advanceCmsProgress(current,{stage:'CHECKING',sequence:6,workTimings:{astro:68048,verify:1200}});
 assert.deepEqual(next.workTimings,{astro:68048,verify:1200});
 assert.deepEqual(advanceCmsProgress(next,{stage:'ACTIVATING',sequence:7}).workTimings,next.workTimings);
 for(const workTimings of [{token:1},{seal:-1},{seal:Infinity},{seal:'10'},{seal:1800001},[]])assert.throws(()=>advanceCmsProgress(current,{stage:'CHECKING',sequence:6,workTimings}),/Invalid publication work timings/);
});
test('ETA uses matching measured stage history and never manufactures a countdown without samples', () => {
  const { estimatePublicationRemaining } = helper();
  const current = { ...sample(), completedAt: null, stage: 'BUILDING' };
  const now = Date.parse(current.stages.BUILDING.startedAt) + 5000;
  assert.equal(estimatePublicationRemaining(current, [sample(), sample()], now).estimate, null);
  const result = estimatePublicationRemaining(current, [sample(20), sample(25), sample(30)], now);
  assert.ok(result.estimate.minSeconds > 0); assert.ok(result.estimate.maxSeconds >= result.estimate.minSeconds);
  assert.equal(result.estimate.sampleCount, 3);
  assert.equal(estimatePublicationRemaining(current, [sample(), sample(), { ...sample(), rendererId: 'a'.repeat(64) }], now).estimate, null);
  assert.equal(estimatePublicationRemaining(current, [sample(), sample(), { ...sample(), totalPages: 1000 }], now).estimate, null);
  assert.equal(estimatePublicationRemaining({ ...current, sampleEligible: false }, [sample(), sample(), sample()], now).estimate, null);
  const late = estimatePublicationRemaining(current, [sample(), sample(), sample()], now + 120000);
  assert.equal(late.estimate, null); assert.equal(late.overdue, true);
});

test('status ETA reuses the prepared sample window until a release input or sample version changes', async () => {
  const { PublicationWorkflowService } = require('../apps/api/dist/publication-workflow.service.js');
  const startedAt = new Date(Date.now() - 5000).toISOString();
  let current = { ...sample(), runId: 'run-1', publicationId: 'pub-active', revision: 12, stage: 'BUILDING',
    startedAt, updatedAt: startedAt, completedAt: null, stages: { BUILDING: { startedAt } } };
  let refs = [1, 2, 3].map(id => ({ id: `sample-${id}`, updatedAt: new Date(id) }));
  let measures = [sample(20), sample(25), sample(30)];
  let metadataReads = 0;
  let payloadReads = 0;
  let changedDuringRead = false;
  const prisma = {
    site: {
      findUnique: async ({ select }) => {
        assert.deepEqual(select, { workingRevision: true, publishedRevision: true });
        return { workingRevision: 13, publishedRevision: 11 };
      },
    },
    sitePublication: {
      findFirst: async () => ({ id: current.publicationId, status: 'RUNNING' }),
      findMany: async (args) => {
        assert.equal(args.where.siteId, 'site-1');
        assert.equal(args.where.status, 'SUCCEEDED');
        if (args.select.id) {
          assert.deepEqual(args.select, { id: true, updatedAt: true });
          assert.equal(args.take, 20);
          metadataReads++;
          return refs;
        }
        assert.deepEqual(args.where.OR, refs);
        assert.deepEqual(args.select, { providerResponse: true });
        payloadReads++;
        const rows = changedDuringRead ? measures.slice(0, -1) : measures;
        return rows.map(cmsProgress => ({ providerResponse: { cmsProgress } }));
      },
    },
    siteRebuild: {
      findUnique: async () => ({ processingRevision: current.revision, providerResponse: { cmsProgress: current } }),
    },
    sitePublicationValidation: { findFirst: async () => null },
  };
  const workflow = new PublicationWorkflowService(prisma, {});
  const read = () => workflow.getState('site-1');

  const initial = await Promise.all([read(), read()]);
  assert.equal(initial[0].progress.estimate.sampleCount, 3);
  assert.equal(metadataReads, 2);
  assert.equal(payloadReads, 1, 'concurrent readers share the same sample payload');

  current = { ...current, sequence: 6, stage: 'CHECKING', stages: { CHECKING: { startedAt } } };
  const checking = await read();
  assert.ok(checking.progress.estimate.maxSeconds < initial[0].progress.estimate.maxSeconds);
  assert.equal(payloadReads, 1, 'a new stage can use the prepared sample durations');

  refs = refs.map((ref, index) => index ? ref : { ...ref, updatedAt: new Date(4) });
  measures = [sample(45), ...measures.slice(1)];
  const updated = await read();
  assert.ok(updated.progress.estimate.maxSeconds > checking.progress.estimate.maxSeconds);
  assert.equal(payloadReads, 2);

  current = { ...current, runId: 'run-2' };
  changedDuringRead = true;
  const raced = await read();
  assert.equal(raced.progress.estimate, null);
  assert.equal(payloadReads, 3);
  changedDuringRead = false;
  assert.equal((await read()).progress.estimate.sampleCount, 3);
  assert.equal(payloadReads, 4, 'an inconsistent window must be read again');

  current = { ...current, totalPages: 110 };
  assert.equal((await read()).progress.estimate.sampleCount, 3);
  assert.equal(payloadReads, 5, 'a new work size invalidates the prepared estimate');

  refs = refs.slice(1);
  assert.equal((await read()).progress.estimate, null);
  assert.equal(payloadReads, 5, 'fewer than three metadata rows cannot produce a reliable estimate');
});

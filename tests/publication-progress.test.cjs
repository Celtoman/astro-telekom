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

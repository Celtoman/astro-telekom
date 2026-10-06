import test from 'node:test';
import assert from 'node:assert/strict';
import * as display from '../apps/admin/src/lib/publication-display.mjs';
const state = {
  latestPublication: { id: 'pub-a', status: 'RUNNING' },
  rebuild: { status: 'RUNNING', processingPublicationId: 'pub-a' },
  progress: { publicationId: 'pub-a', stage: 'BUILDING', elapsedSeconds: 80,
    completedPages: 1200, totalPages: 4018, estimate: { minSeconds: 30, maxSeconds: 60 }, overdue: false, stale: false },
};
test('publication UI reports actual phase counts, elapsed and approximate ETA without an invented global percent', () => {
  const result = display.describePublicationProgress(state, 5);
  assert.equal(result.stageLabel, 'Сборка страниц');
  assert.match(result.counterLabel, /1.?200.*4.?018/);
  assert.match(result.elapsedLabel, /1 мин 25 сек/);
  assert.match(result.remainingLabel, /примерно/);
  assert.equal(result.steps[0].status, 'complete'); assert.equal(result.steps[1].status, 'active');
  assert.equal(result.steps[4].status, 'pending');
  assert.equal('percent' in result, false);
});
test('uncertain, stale and foreign publication progress cannot present completion or an ETA', () => {
  const uncertain = display.describePublicationProgress({ ...state, rebuild: { ...state.rebuild, providerStatus: 'UNCERTAIN' } });
  assert.match(uncertain.remainingLabel, /подтверждени/); assert.equal(uncertain.steps.at(-1).status, 'pending');
  assert.equal(display.describePublicationProgress({ ...state, progress: { ...state.progress, publicationId: 'foreign' } }), null);
  const missing = display.describePublicationProgress({ ...state, progress: { ...state.progress, estimate: null } });
  assert.match(missing.remainingLabel, /недоступна/);
  const overdue = display.describePublicationProgress({ ...state, progress: { ...state.progress, overdue: true, estimate: null } });
  assert.match(overdue.remainingLabel, /Дольше обычного/);
});
test('waiting for CODE explains automatic recovery and terminal success comes only from publication status', () => {
  const waiting = display.describePublicationProgress({ ...state, progress: { ...state.progress, stage: 'PREPARING', waitingReason: 'CODE_BUILDING' } });
  assert.match(waiting.stageLabel, /после обновления/); assert.match(waiting.remainingLabel, /автоматически/);
  assert.equal(waiting.steps[4].status, 'pending');
  const success = display.describePublicationProgress({ ...state, latestPublication: { id: 'pub-a', status: 'SUCCEEDED' } });
  assert.ok(success.steps.every(step => step.status === 'complete')); assert.equal(success.active, false);
  assert.equal(success.counterLabel, null, 'Success must not retain an incomplete stale stage counter');
});

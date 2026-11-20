export const PUBLICATION_STAGES = ['PREPARING', 'BUILDING', 'CHECKING', 'ACTIVATING', 'CONFIRMING'] as const;
export type PublicationStage = typeof PUBLICATION_STAGES[number];
type Timing = { startedAt: string; completedAt?: string };
export type CmsProgress = {
  version: 1; runId: string; publicationId: string; revision: number; sequence: number;
  stage: PublicationStage; startedAt: string; updatedAt: string; completedAt?: string | null;
  sampleEligible: boolean; rendererId?: string; totalPages?: number; completedPages?: number;
  workTimings?: Record<string, number>;
  waitingReason?: 'WAITING_DEPLOYMENT' | 'CODE_BUILDING' | 'CODE_UNAVAILABLE';
  stages: Partial<Record<PublicationStage, Timing>>;
};
export function readCmsProgress(response: unknown): CmsProgress | null {
  const value = (response as { cmsProgress?: CmsProgress } | null)?.cmsProgress;
  if (!value || value.version !== 1 || !PUBLICATION_STAGES.includes(value.stage)
    || typeof value.runId !== 'string' || typeof value.publicationId !== 'string'
    || !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.sequence)
    || !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt))
    || !value.stages || typeof value.stages !== 'object') return null;
  return value;
}
export function advanceCmsProgress(current: CmsProgress, event: Record<string, unknown>, now = new Date()): CmsProgress | null {
  const stage = event.stage as PublicationStage;
  if (!PUBLICATION_STAGES.includes(stage) || !Number.isSafeInteger(event.sequence) || Number(event.sequence) < 1
    || Number(event.sequence) > 1_000_000_000) throw new Error('Invalid publication stage/sequence');
  if (Number(event.sequence) <= current.sequence || PUBLICATION_STAGES.indexOf(stage) < PUBLICATION_STAGES.indexOf(current.stage)) return null;
  for (const field of ['completedPages', 'totalPages']) {
    if (event[field] !== undefined && (!Number.isSafeInteger(event[field]) || Number(event[field]) < 0 || Number(event[field]) > 100_000)) throw new Error('Invalid publication page count');
  }
  if (event.rendererId !== undefined && !/^[a-f0-9]{64}$/.test(String(event.rendererId))) throw new Error('Invalid renderer identity');
  if (event.waitingReason !== undefined && (stage !== 'PREPARING' || !['WAITING_DEPLOYMENT', 'CODE_BUILDING', 'CODE_UNAVAILABLE'].includes(String(event.waitingReason)))) throw new Error('Invalid publication wait reason');
  if (current.rendererId && event.rendererId && current.rendererId !== event.rendererId) return null;
  let workTimings = current.workTimings;
  if (event.workTimings !== undefined) {
    const allowed = ['snapshot', 'sourceCheck', 'sourceCopy', 'media', 'astro', 'verify', 'seal', 'sealInventory', 'sealWrite', 'sealSync', 'sealReadback'];
    if (!event.workTimings || typeof event.workTimings !== 'object' || Array.isArray(event.workTimings)
      || Object.entries(event.workTimings).some(([key, value]) => !allowed.includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 30 * 60_000)) throw new Error('Invalid publication work timings');
    workTimings = { ...current.workTimings, ...event.workTimings as Record<string, number> };
  }
  const totalPages = event.totalPages === undefined ? current.totalPages : Number(event.totalPages);
  const completedPages = event.completedPages === undefined ? (stage === current.stage ? current.completedPages : undefined) : Number(event.completedPages);
  if (completedPages !== undefined && (totalPages === undefined || completedPages > totalPages)) throw new Error('Invalid publication page count');
  if (stage === current.stage && completedPages !== undefined && current.completedPages !== undefined && completedPages < current.completedPages) return null;
  if (current.totalPages !== undefined && totalPages !== undefined && current.totalPages !== totalPages) return null;
  const at = now.toISOString(); const stages = { ...current.stages };
  if (stage !== current.stage) {
    stages[current.stage] = { ...stages[current.stage]!, completedAt: at };
    stages[stage] = { startedAt: at };
  }
  return { ...current, stage, sequence: Number(event.sequence), updatedAt: at, stages,
    sampleEligible: current.sampleEligible && !event.waitingReason,
    waitingReason: event.waitingReason as CmsProgress['waitingReason'],
    ...(event.rendererId ? { rendererId: String(event.rendererId) } : {}),
    totalPages, completedPages, ...(workTimings ? { workTimings } : {}) };
}
export type PublicationEstimate = Partial<Record<PublicationStage, {
  minMs: number;
  maxMs: number;
  overdueAfterMs: number;
  sampleCount: number;
}>>;

export function preparePublicationEstimate(
  current: Pick<CmsProgress, 'rendererId' | 'totalPages'>,
  history: CmsProgress[],
): PublicationEstimate | null {
  const { rendererId, totalPages } = current;
  if (!rendererId || !totalPages) return null;
  const samples = history.flatMap(sample => {
    if (!sample.sampleEligible || !sample.completedAt || sample.rendererId !== rendererId
      || !sample.totalPages || !(Math.abs(sample.totalPages / totalPages - 1) <= 0.2)) return [];
    const durations = PUBLICATION_STAGES.map(stage => {
      const timing = sample.stages[stage];
      return Date.parse(timing?.completedAt || '') - Date.parse(timing?.startedAt || '');
    });
    return durations.every(ms => Number.isFinite(ms) && ms >= 0 && ms <= 30 * 60_000) ? [durations] : [];
  });
  if (samples.length < 3) return null;
  return Object.fromEntries(PUBLICATION_STAGES.map((stage, index) => {
    const remaining = samples.map(durations => durations.slice(index).reduce((sum, ms) => sum + ms, 0));
    return [stage, {
      minMs: Math.min(...remaining), maxMs: Math.max(...remaining),
      overdueAfterMs: Math.max(...samples.map(durations => durations[index])),
      sampleCount: samples.length,
    }];
  }));
}

export function estimatePublicationRemaining(
  current: CmsProgress,
  history: CmsProgress[] | PublicationEstimate | null,
  now = Date.now(),
) {
  const unavailable = { estimate: null, overdue: false };
  if (!current.sampleEligible || current.completedAt || current.waitingReason || !current.rendererId || !current.totalPages) return unavailable;
  const stageStart = Date.parse(current.stages[current.stage]?.startedAt || '');
  if (!Number.isFinite(stageStart)) return unavailable;
  const baseline = (Array.isArray(history) ? preparePublicationEstimate(current, history) : history)?.[current.stage];
  if (!baseline) return unavailable;
  const elapsed = Math.max(0, now - stageStart);
  if (elapsed > baseline.overdueAfterMs) return { estimate: null, overdue: true };
  return { estimate: {
    minSeconds: Math.max(1, Math.ceil((baseline.minMs - elapsed) / 1000)),
    maxSeconds: Math.max(1, Math.ceil((baseline.maxMs - elapsed) / 1000)),
    sampleCount: baseline.sampleCount,
  }, overdue: false };
}

export const PUBLICATION_STAGES = ['PREPARING', 'BUILDING', 'CHECKING', 'ACTIVATING', 'CONFIRMING'] as const;
export type PublicationStage = typeof PUBLICATION_STAGES[number];
type Timing = { startedAt: string; completedAt?: string };
export type CmsProgress = {
  version: 1; runId: string; publicationId: string; revision: number; sequence: number;
  stage: PublicationStage; startedAt: string; updatedAt: string; completedAt?: string | null;
  sampleEligible: boolean; rendererId?: string; totalPages?: number; completedPages?: number;
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
    totalPages, completedPages };
}
export function estimatePublicationRemaining(current: CmsProgress, history: CmsProgress[], now = Date.now()) {
  const unavailable = { estimate: null, overdue: false };
  if (!current.sampleEligible || current.completedAt || current.waitingReason || !current.rendererId || !current.totalPages) return unavailable;
  const stageIndex = PUBLICATION_STAGES.indexOf(current.stage);
  const stageStart = Date.parse(current.stages[current.stage]?.startedAt || '');
  if (!Number.isFinite(stageStart)) return unavailable;
  const samples = history.filter(sample => sample.sampleEligible && sample.completedAt
    && sample.rendererId === current.rendererId && sample.totalPages
    && Math.abs(sample.totalPages / current.totalPages! - 1) <= 0.2
    && PUBLICATION_STAGES.every(stage => {
      const timing = sample.stages[stage]; const duration = Date.parse(timing?.completedAt || '') - Date.parse(timing?.startedAt || '');
      return Number.isFinite(duration) && duration >= 0 && duration <= 30 * 60_000;
    }));
  if (samples.length < 3) return unavailable;
  const elapsed = Math.max(0, now - stageStart);
  const duration = (sample: CmsProgress, stage: PublicationStage) => Date.parse(sample.stages[stage]!.completedAt!) - Date.parse(sample.stages[stage]!.startedAt);
  if (elapsed > Math.max(...samples.map(sample => duration(sample, current.stage)))) return { estimate: null, overdue: true };
  const remaining = samples.map(sample => PUBLICATION_STAGES.slice(stageIndex).reduce((sum, stage) => sum + duration(sample, stage), 0) - elapsed).sort((a, b) => a - b);
  return { estimate: { minSeconds: Math.max(1, Math.ceil(remaining[0] / 1000)), maxSeconds: Math.max(1, Math.ceil(remaining.at(-1)! / 1000)), sampleCount: samples.length }, overdue: false };
}

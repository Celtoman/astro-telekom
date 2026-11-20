import { Logger } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaService } from './prisma.service';
import { activeServing } from './serving-publication-context';
import { prepareServingCatalogProjection, type ProjectionWarmTarget } from './serving-catalog-projection';
import { discoverServingProjectionTargets, type PendingProjectionTarget } from './serving-projection-warmer';

const ACTIVE_POLL_MS = 15_000;
const JOB_POLL_MS = 1_000;
const COOLDOWN_MS = 15 * 60_000;
const MAX_DEFERRED_TARGETS = 128;
const RETRY_MS = [2_000, 10_000, 60_000];

async function main() {
  const logger = new Logger('ServingProjectionWarmer');
  if (process.env.SERVING_CATALOG_PROJECTION_WARMER_ENABLED !== 'true') {
    logger.log('Serving projection warmer is disabled');
    return;
  }
  if (process.env.REBUILD_PROVIDER !== 'static' || !process.env.DATABASE_URL
    || !process.env.STATIC_PUBLICATION_URL || !process.env.ADMIN_API_TOKEN) {
    throw new Error('Static provider, PostgreSQL and private controller configuration are required');
  }

  const prisma = new PrismaService();
  const stop = new AbortController();
  process.once('SIGTERM', () => stop.abort());
  process.once('SIGINT', () => stop.abort());
  const deferred = new Map<string, { target: ProjectionWarmTarget; attempt: number; until: number }>();
  let nextActivePollAt = 0;

  async function run(target: ProjectionWarmTarget) {
    const key = JSON.stringify([target.publicationId, target.generation ?? target.active?.catalogDigest]);
    const prior = deferred.get(key);
    if (prior && prior.until > Date.now()) return;
    const start = performance.now();
    function postpone(attempt: number, delay: number) {
      deferred.delete(key);
      deferred.set(key, { target, attempt, until: Date.now() + delay });
      if (deferred.size > MAX_DEFERRED_TARGETS) deferred.delete(deferred.keys().next().value!);
    }
    try {
      const result = await prepareServingCatalogProjection(prisma, target);
      if ('proof' in result) {
        deferred.delete(key);
        if (result.state === 'ready') logger.log(JSON.stringify({ ...result.proof, event: 'projection_ready',
          elapsedMs: Math.round(performance.now() - start), lockMs: Math.round(result.lockMs) }));
      } else if (result.state === 'busy' || result.state === 'stale') {
        postpone(0, RETRY_MS[0]);
      } else {
        postpone(0, COOLDOWN_MS);
        logger.warn(`${result.state} for publication ${target.publicationId}`);
      }
    } catch {
      const attempt = (prior?.attempt ?? 0) + 1;
      const retryDelay = RETRY_MS[attempt - 1];
      if (retryDelay === undefined) {
        postpone(0, COOLDOWN_MS);
        logger.warn(`Projection preparation deferred for publication ${target.publicationId}`);
      } else {
        postpone(attempt, retryDelay);
      }
    }
  }

  try {
    await prisma.onModuleInit();
    while (!stop.signal.aborted) {
      try {
        const now = Date.now();
        const skipped = [...deferred.values()].filter(entry => entry.until > now && entry.target.generation !== undefined)
          .map(({ target }) => ({ publicationId: target.publicationId, generation: target.generation! } satisfies PendingProjectionTarget));
        const [pending] = await discoverServingProjectionTargets(prisma, skipped);
        if (pending && !stop.signal.aborted) await run(pending);
        if (stop.signal.aborted) break;
        if (Date.now() >= nextActivePollAt) {
          nextActivePollAt = Date.now() + ACTIVE_POLL_MS;
          try {
            const { publicationId, ...active } = await activeServing(3_000);
            if (!stop.signal.aborted) await run({ publicationId, active });
          } catch {
            logger.warn('The exact active publication is currently unavailable for projection preparation');
          }
        }
      } catch {
        logger.warn('Unable to discover serving catalog projection targets');
      }
      if (!stop.signal.aborted) await sleep(JOB_POLL_MS, undefined, { signal: stop.signal }).catch(() => undefined);
    }
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch(() => {
  Logger.error('Serving projection warmer failed to start', 'ServingProjectionWarmer');
  process.exitCode = 1;
});

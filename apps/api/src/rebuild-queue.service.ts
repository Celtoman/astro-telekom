import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';

const QUEUE_NAME = 'site-rebuilds';
const DEFAULT_MAX_ATTEMPTS = 3;
const ACTIVE_STATUSES = ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'] as const;

type RebuildTrigger = { entity: string; id: string; siteId?: string };
type ProviderResult = {
  status: 'SUCCEEDED';
  deploymentId?: string;
  url?: string;
  [key: string]: unknown;
};
type AttemptResult = {
  attemptNumber?: number;
  maxAttempts?: number;
  revision?: number;
  result?: ProviderResult;
  error?: string;
  deploymentId?: string;
  providerStatus?: string;
  providerResponse?: unknown;
};
type ProviderProgress = {
  revision?: number;
  deploymentId?: string;
  providerStatus?: string;
  providerResponse?: unknown;
};

@Injectable()
export class RebuildQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RebuildQueueService.name);
  private readonly queue: Queue | null;
  private readonly redis: IORedis | null;

  constructor(private readonly prisma: PrismaService) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      this.queue = new Queue(QUEUE_NAME, { connection: this.redis });
    } else {
      this.redis = null;
      this.queue = null;
    }
  }

  async onModuleInit() {
    if (!this.queue) return;
    const unfinished = await this.prisma.siteRebuild.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { updatedAt: 'asc' },
    });
    for (const rebuild of unfinished) {
      const revision = (rebuild.status === 'RUNNING' || rebuild.status === 'RETRYING')
        && rebuild.processingRevision > rebuild.publishedRevision
        ? rebuild.processingRevision
        : rebuild.requestedRevision;
      await this.schedule(rebuild.id, revision, rebuild.maxAttempts, true);
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.redis?.quit();
  }

  async enqueue(data: RebuildTrigger) {
    const dedupeKey = `site:${data.siteId || 'all'}`;
    const existing = await this.prisma.siteRebuild.findUnique({ where: { dedupeKey } });
    const terminal = existing?.status === 'SUCCEEDED' || existing?.status === 'FAILED';
    const rebuild = await this.prisma.siteRebuild.upsert({
      where: { dedupeKey },
      create: {
        siteId: data.siteId,
        dedupeKey,
        triggerEntity: data.entity,
        triggerEntityId: data.id,
        affectedPaths: ['/*'],
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      },
      update: {
        triggerEntity: data.entity,
        triggerEntityId: data.id,
        affectedPaths: ['/*'],
        requestedRevision: { increment: 1 },
        ...(terminal ? {
          status: 'PENDING' as const,
          attempts: 0,
          lastError: null,
          providerStatus: null,
          providerDeploymentId: null,
          providerResponse: Prisma.DbNull,
          queuedAt: null,
          startedAt: null,
          completedAt: null,
        } : {}),
      },
    });

    if (!existing || terminal || existing.status === 'PENDING') {
      await this.schedule(rebuild.id, rebuild.requestedRevision, rebuild.maxAttempts);
    }
    return rebuild;
  }

  async list(siteId?: string) {
    return this.prisma.siteRebuild.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string) {
    const rebuild = await this.prisma.siteRebuild.findUnique({ where: { id } });
    if (!rebuild) throw new NotFoundException('Rebuild job not found');
    return rebuild;
  }

  async startAttempt(id: string, attemptNumber: number, maxAttempts: number, expectedRevision?: number) {
    const rebuild = await this.get(id);
    if (expectedRevision && expectedRevision <= rebuild.publishedRevision) {
      return { skipped: true as const, reason: 'already_published' };
    }
    const attempt = Math.max(1, Math.floor(attemptNumber || 1));
    const attemptLimit = Math.max(1, Math.floor(maxAttempts || rebuild.maxAttempts));
    const revision = rebuild.status === 'RETRYING' && rebuild.processingRevision > 0
      ? rebuild.processingRevision
      : rebuild.requestedRevision;

    const running = await this.prisma.siteRebuild.update({
      where: { id },
      data: {
        status: 'RUNNING',
        processingRevision: revision,
        attempts: attempt,
        maxAttempts: attemptLimit,
        startedAt: new Date(),
        completedAt: null,
        lastError: null,
      },
    });

    return {
      rebuildId: running.id,
      siteId: running.siteId,
      dedupeKey: running.dedupeKey,
      affectedPaths: running.affectedPaths,
      revision,
      providerDeploymentId: running.providerDeploymentId,
      providerStatus: running.providerStatus,
    };
  }

  async recordProviderProgress(id: string, body: ProviderProgress) {
    const rebuild = await this.get(id);
    const revision = Math.max(1, Math.floor(Number(body.revision) || rebuild.processingRevision));
    const deploymentId = typeof body.deploymentId === 'string' ? body.deploymentId.trim() : '';
    const providerStatus = typeof body.providerStatus === 'string' ? body.providerStatus.trim().toUpperCase() : '';
    if (!deploymentId || deploymentId.length > 200) throw new BadRequestException('deploymentId is required');
    if (!providerStatus || providerStatus.length > 100) throw new BadRequestException('providerStatus is required');
    const saved = await this.prisma.siteRebuild.updateMany({
      where: { id, status: 'RUNNING', processingRevision: revision, publishedRevision: { lt: revision } },
      data: {
        providerDeploymentId: deploymentId,
        providerStatus,
        ...(body.providerResponse !== undefined
          ? { providerResponse: body.providerResponse as Prisma.InputJsonValue }
          : {}),
      },
    });
    return saved.count === 1
      ? { saved: true, revision, deploymentId, providerStatus }
      : { saved: false, skipped: true, reason: 'stale_attempt' };
  }

  async reportResult(id: string, body: AttemptResult) {
    const rebuild = await this.get(id);
    const attempt = Math.max(1, Math.floor(Number(body.attemptNumber) || 1));
    const attemptLimit = Math.max(1, Math.floor(Number(body.maxAttempts) || rebuild.maxAttempts));
    const revision = Math.max(1, Math.floor(Number(body.revision) || rebuild.processingRevision));
    if (body.result?.status === 'SUCCEEDED') {
      return this.finishSuccessfulRevision(id, revision, body.result);
    }

    const message = (body.error || 'rebuild provider did not return final status SUCCEEDED').slice(0, 2000);
    const deploymentId = typeof body.deploymentId === 'string' ? body.deploymentId.trim().slice(0, 200) : '';
    const providerStatus = typeof body.providerStatus === 'string' ? body.providerStatus.trim().toUpperCase().slice(0, 100) : 'FAILED';
    const failed = await this.prisma.siteRebuild.updateMany({
      where: { id, processingRevision: revision, publishedRevision: { lt: revision } },
      data: {
        status: attempt < attemptLimit ? 'RETRYING' : 'FAILED',
        attempts: attempt,
        maxAttempts: attemptLimit,
        lastError: message,
        providerStatus: providerStatus || 'FAILED',
        ...(deploymentId ? { providerDeploymentId: deploymentId } : {}),
        ...(body.providerResponse !== undefined
          ? { providerResponse: body.providerResponse as Prisma.InputJsonValue }
          : {}),
        completedAt: attempt < attemptLimit ? null : new Date(),
      },
    });
    return failed.count === 1
      ? { published: false, status: attempt < attemptLimit ? 'RETRYING' : 'FAILED' }
      : { published: false, skipped: true, reason: 'stale_attempt' };
  }

  async finishSuccessfulRevision(id: string, revision: number, result: ProviderResult) {
    const providerData = {
      processingRevision: revision,
      publishedRevision: revision,
      providerStatus: result.status,
      providerDeploymentId: typeof result.deploymentId === 'string' ? result.deploymentId : null,
      providerResponse: result as Prisma.InputJsonValue,
      lastError: null,
    };
    const completed = await this.prisma.siteRebuild.updateMany({
      where: { id, requestedRevision: revision, processingRevision: revision, publishedRevision: { lt: revision } },
      data: {
        ...providerData,
        status: 'SUCCEEDED',
        completedAt: new Date(),
      },
    });
    if (completed.count === 1) {
      const updated = await this.get(id);
      return { published: true, revision, pendingRevision: null, rebuild: updated };
    }

    const pending = await this.prisma.siteRebuild.updateMany({
      where: { id, requestedRevision: { gt: revision }, processingRevision: revision, publishedRevision: { lt: revision } },
      data: { ...providerData, status: 'PENDING', completedAt: null },
    });
    if (pending.count === 0) {
      return { published: false, skipped: true, reason: 'stale_attempt', rebuild: await this.get(id) };
    }
    const latest = await this.get(id);
    await this.schedule(id, latest.requestedRevision, latest.maxAttempts);
    const updated = await this.get(id);
    return { published: true, revision, pendingRevision: latest.requestedRevision, rebuild: updated };
  }

  private async schedule(id: string, revision: number, maxAttempts: number, recovery = false) {
    if (!this.queue) {
      this.logger.warn(`Rebuild ${id} persisted as PENDING: REDIS_URL is not configured`);
      return false;
    }
    if (!recovery) {
      const claimed = await this.prisma.siteRebuild.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'QUEUED', queuedAt: new Date() },
      });
      if (claimed.count === 0) return false;
    }
    try {
      await this.queue.add('rebuild', { rebuildId: id, revision }, {
        attempts: maxAttempts,
        backoff: { type: 'exponential', delay: 30_000 },
        jobId: `${id}-${revision}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      if (recovery) {
        await this.prisma.siteRebuild.update({
          where: { id },
          data: { status: 'QUEUED', queuedAt: new Date() },
        });
      }
      return true;
    } catch (error) {
      await this.prisma.siteRebuild.update({ where: { id }, data: { status: 'PENDING' } });
      throw error;
    }
  }

}

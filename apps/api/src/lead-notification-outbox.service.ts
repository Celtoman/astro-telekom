import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { LeadNotificationError, NotificationsService } from './notifications.service';

const QUEUE_NAME = 'lead-notifications';
const DEFAULT_MAX_ATTEMPTS = 3;
const RECOVERABLE_STATUSES = ['PENDING', 'QUEUED', 'RETRYING'] as const;
const RECOVERY_INTERVAL_MS = 60_000;
const RUNNING_LEASE_MS = 2 * 60_000;

@Injectable()
export class LeadNotificationOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadNotificationOutboxService.name);
  private readonly queue: Queue | null;
  private readonly redis: IORedis | null;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
      this.queue = new Queue(QUEUE_NAME, { connection: this.redis });
    } else {
      this.redis = null;
      this.queue = null;
    }
  }

  create(tx: Prisma.TransactionClient, leadId: string) {
    return tx.leadNotification.create({ data: { leadId } });
  }

  async onModuleInit() {
    await this.recoverUnfinished();
    this.recoveryTimer = setInterval(() => {
      void this.recoverUnfinished().catch(() => this.logger.error({
        message: 'Lead notification recovery failed',
        code: 'recovery_error',
      }));
    }, RECOVERY_INTERVAL_MS);
    this.recoveryTimer.unref();
  }

  async recoverUnfinished() {
    const staleBefore = new Date(Date.now() - RUNNING_LEASE_MS);
    const unfinished = await this.prisma.leadNotification.findMany({
      where: {
        OR: [
          { status: { in: [...RECOVERABLE_STATUSES] } },
          { status: 'RUNNING', startedAt: { lte: staleBefore } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
    });
    for (const notification of unfinished) {
      if (notification.status === 'RUNNING') {
        const released = await this.prisma.leadNotification.updateMany({
          where: {
            id: notification.id,
            revision: notification.revision,
            status: 'RUNNING',
            startedAt: { lte: staleBefore },
          },
          data: { status: 'RETRYING', errorCode: 'lease_expired', httpStatus: null },
        });
        if (released.count !== 1) continue;
      }
      await this.enqueueTracked(notification.id, 0, true);
    }
  }

  async onModuleDestroy() {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    await this.queue?.close();
    await this.redis?.quit();
  }

  async enqueueTracked(id: string, delay = 0, recovery = false): Promise<boolean> {
    const notification = await this.prisma.leadNotification.findUnique({ where: { id } });
    if (!notification || notification.status === 'SUCCEEDED' || notification.status === 'FAILED') return false;
    if (notification.status === 'RUNNING') return false;
    if (notification.attempts >= notification.maxAttempts) {
      await this.prisma.leadNotification.updateMany({
        where: { id, revision: notification.revision, status: { in: [...RECOVERABLE_STATUSES] } },
        data: { status: 'FAILED', errorCode: 'attempts_exhausted', completedAt: new Date() },
      });
      return false;
    }

    const nextAttempt = notification.attempts + 1;

    const claimed = await this.prisma.leadNotification.updateMany({
      where: {
        id,
        revision: notification.revision,
        attempts: notification.attempts,
        status: { in: [...RECOVERABLE_STATUSES] },
      },
      data: { status: 'QUEUED', queuedAt: new Date(), errorCode: null, httpStatus: null },
    });
    if (claimed.count !== 1) return false;

    if (!this.queue) {
      this.scheduleLocal(id, notification.revision, nextAttempt, notification.maxAttempts, delay);
      return true;
    }

    try {
      await this.queue.add('notify', {
        notificationId: id,
        revision: notification.revision,
        attemptNumber: nextAttempt,
        maxAttempts: notification.maxAttempts,
      }, {
        delay,
        jobId: `lead-notification-${id}-revision-${notification.revision}-attempt-${nextAttempt}`,
        removeOnComplete: true,
        removeOnFail: true,
      });
      return true;
    } catch (error) {
      await this.prisma.leadNotification.updateMany({
        where: { id, revision: notification.revision, status: 'QUEUED' },
        data: { status: 'PENDING', queuedAt: null, errorCode: 'queue_error', httpStatus: null },
      });
      this.logger.error({
        message: 'Lead notification could not be queued',
        notificationId: id,
        recovery,
        code: 'queue_error',
      });
      return false;
    }
  }

  async process(id: string, attemptNumber: number, maxAttempts: number, expectedRevision?: number) {
    const notification = await this.prisma.leadNotification.findUnique({
      where: { id },
      include: { lead: { include: { city: true, tariff: true } } },
    });
    if (!notification) return { skipped: true as const, reason: 'notification_not_found' };
    if (notification.status === 'SUCCEEDED') return { skipped: true as const, reason: 'already_succeeded' };
    if (expectedRevision !== undefined && notification.revision !== expectedRevision) {
      return { skipped: true as const, reason: 'stale_revision' };
    }
    if (notification.status === 'FAILED') return { skipped: true as const, reason: 'final_failure' };

    const attempt = Math.max(1, Math.floor(Number(attemptNumber) || 1));
    const requestedLimit = Math.max(1, Math.floor(Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS));
    if (requestedLimit !== notification.maxAttempts) {
      return { skipped: true as const, reason: 'stale_attempt_metadata' };
    }
    const attemptLimit = notification.maxAttempts;
    if (attempt !== notification.attempts + 1 || attempt > attemptLimit) {
      return { skipped: true as const, reason: 'stale_attempt' };
    }
    const started = await this.prisma.leadNotification.updateMany({
      where: { id, revision: notification.revision, status: 'QUEUED', attempts: notification.attempts },
      data: {
        status: 'RUNNING',
        attempts: attempt,
        startedAt: new Date(),
        completedAt: null,
        errorCode: null,
        httpStatus: null,
      },
    });
    if (started.count !== 1) return { skipped: true as const, reason: 'not_claimed' };

    try {
      const result = await this.notifications.notifyLead({
        id: notification.lead.id,
        phone: notification.lead.phone,
        name: notification.lead.name,
        city: notification.lead.city.name,
        address: notification.lead.address,
        tariff: notification.lead.tariff?.name,
      });
      const completed = await this.prisma.leadNotification.updateMany({
        where: { id, revision: notification.revision, status: 'RUNNING', attempts: attempt },
        data: {
          status: 'SUCCEEDED',
          transport: result.transport,
          providerMessageId: result.providerMessageId || null,
          errorCode: null,
          httpStatus: null,
          completedAt: new Date(),
        },
      });
      if (completed.count !== 1) return { skipped: true as const, reason: 'stale_result' };
      return { notified: true as const, ...result };
    } catch (error) {
      const failure = error instanceof LeadNotificationError
        ? error
        : new LeadNotificationError('Lead notification failed unexpectedly', 'none', 'internal_error', undefined, false);
      const willRetry = failure.retryable && attempt < attemptLimit;
      const recorded = await this.prisma.leadNotification.updateMany({
        where: { id, revision: notification.revision, status: 'RUNNING', attempts: attempt },
        data: {
          status: willRetry ? 'RETRYING' : 'FAILED',
          transport: failure.transport,
          errorCode: failure.code,
          httpStatus: failure.status || null,
          completedAt: willRetry ? null : new Date(),
        },
      });
      if (recorded.count !== 1) return { skipped: true as const, reason: 'stale_result' };
      this.logger.error({
        message: 'Lead notification failed',
        notificationId: id,
        transport: failure.transport,
        code: failure.code,
        ...(failure.status === undefined ? {} : { status: failure.status }),
        retrying: willRetry,
      });
      if (willRetry) {
        const delay = 30_000 * (2 ** (attempt - 1));
        const queued = await this.enqueueTracked(id, delay);
        return { notified: false as const, status: queued ? 'QUEUED' as const : 'PENDING' as const };
      }
      return { notified: false as const, status: 'FAILED' as const };
    }
  }

  async retryForLead(leadId: string) {
    const current = await this.prisma.leadNotification.findUnique({ where: { leadId } });
    if (!current) throw new NotFoundException('Оповещение для заявки не найдено');
    if (current.status !== 'FAILED') throw new BadRequestException('Для этого оповещения повторная отправка не требуется');
    const reset = await this.prisma.leadNotification.updateMany({
      where: { id: current.id, revision: current.revision, status: 'FAILED' },
      data: {
        revision: { increment: 1 },
        status: 'PENDING',
        attempts: 0,
        transport: null,
        errorCode: null,
        httpStatus: null,
        providerMessageId: null,
        queuedAt: null,
        startedAt: null,
        completedAt: null,
      },
    });
    if (reset.count !== 1) throw new ConflictException('Оповещение уже изменено другим оператором. Обновите заявку');
    const refreshed = await this.prisma.leadNotification.findUnique({ where: { id: current.id } });
    if (!refreshed) throw new NotFoundException('Оповещение для заявки не найдено');
    const queued = await this.enqueueTracked(refreshed.id);
    return {
      id: refreshed.id,
      status: queued ? 'QUEUED' as const : 'PENDING' as const,
      message: queued ? 'Оповещение поставлено в очередь' : 'Оповещение сохранено и ожидает восстановления очереди',
    };
  }

  private scheduleLocal(id: string, revision: number, attempt: number, maxAttempts: number, delay: number) {
    const run = () => {
      void this.process(id, attempt, maxAttempts, revision).catch(() => this.logger.error({
        message: 'Local lead notification processing failed',
        notificationId: id,
        code: 'local_processing_error',
      }));
    };
    if (delay > 0) {
      const timer = setTimeout(run, delay);
      timer.unref();
    } else {
      queueMicrotask(run);
    }
  }
}

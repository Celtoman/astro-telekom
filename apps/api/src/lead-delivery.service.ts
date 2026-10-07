import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { makeDeliveryKey, normalizePhone } from './lead-utils';
import { readTarifnikCoverageSnapshot } from './coverage.service';

const RETRY_DELAYS = [0, 5 * 60 * 1000, 30 * 60 * 1000];
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

class TarifnikDeliveryError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(message);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  if (!Number.isFinite(delay) || delay <= 0) return undefined;
  return Math.min(Math.round(delay), MAX_RETRY_AFTER_MS);
}

function hasVerifiedNegativeSubscriberResult(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.status === 'NOT_FOUND' && record.active === false;
}

@Injectable()
export class LeadDeliveryService implements OnModuleDestroy {
  private readonly logger = new Logger(LeadDeliveryService.name);
  private readonly queue: Queue | null;
  private readonly redis: IORedis | null;

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
      this.queue = new Queue('lead-deliveries', { connection: this.redis });
    } else {
      this.redis = null;
      this.queue = null;
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.redis?.quit();
  }

  async enqueue(leadId: string, attemptNumber = 1, delay = 0, retryNumber = 1) {
    if (this.queue) {
      await this.queue.add('deliver', { leadId, attemptNumber, retryNumber }, {
        delay,
        jobId: `lead-delivery-${leadId}-attempt-${attemptNumber}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      return;
    }
    const run = () => this.process(leadId, attemptNumber, retryNumber).catch((error) => this.logger.error(error));
    if (delay > 0) setTimeout(run, delay);
    else queueMicrotask(run);
  }

  async enqueueTracked(leadId: string, attemptNumber = 1, delay = 0, retryNumber = 1) {
    try {
      await this.enqueue(leadId, attemptNumber, delay, retryNumber);
      return { queued: true as const, processingStatus: 'PENDING' as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lead ${leadId} could not be queued: ${message}`);
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { deliveryKey: true } });
      if (!lead) return { queued: false as const, processingStatus: 'DELIVERY_QUEUE_ERROR' as const };
      const queueAttemptNumber = await this.prisma.leadDeliveryAttempt.count({ where: { leadId, channel: 'QUEUE' } }) + 1;
      await this.prisma.$transaction([
        this.prisma.leadDeliveryAttempt.create({
          data: {
            leadId,
            attemptNumber: queueAttemptNumber,
            channel: 'QUEUE',
            status: 'FAILED',
            idempotencyKey: lead.deliveryKey || makeDeliveryKey(leadId),
            error: message,
          },
        }),
        this.prisma.lead.update({ where: { id: leadId }, data: { processingStatus: 'DELIVERY_QUEUE_ERROR' } }),
      ]);
      return { queued: false as const, processingStatus: 'DELIVERY_QUEUE_ERROR' as const };
    }
  }

  async process(leadId: string, attemptNumber: number, retryNumber = 1) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { city: true, page: true, tariff: true, site: true, addressCheck: true },
    });
    if (!lead) return { skipped: true, reason: 'lead_not_found' };
    if (lead.processingStatus !== 'PENDING') return { skipped: true, reason: lead.processingStatus };
    if (lead.phoneCheckStatus != null && (lead.phoneCheckStatus !== 'PASSED' || lead.phoneCheckQc !== 0 || lead.phoneCheckNormalized !== lead.phone)) {
      await this.prisma.lead.update({ where: { id: lead.id }, data: { processingStatus: 'MANUAL_CHECK_API' } });
      return { skipped: true, reason: 'phone_not_verified' };
    }
    if (lead.commentAnalysisOutcome === 'MANUAL_REVIEW') {
      await this.prisma.lead.update({ where: { id: lead.id }, data: { processingStatus: 'MANUAL_CHECK' } });
      return { skipped: true, reason: 'comment_manual_review' };
    }
    if (lead.reasonRoute && lead.reasonRoute !== 'SALES') {
      await this.prisma.lead.update({ where: { id: lead.id }, data: { processingStatus: lead.reasonRoute === 'NON_SALES' ? 'NON_SALES_NOT_SENT' : 'MANUAL_CHECK' } });
      return { skipped: true, reason: 'non_sales_reason' };
    }

    const coverage = readTarifnikCoverageSnapshot(lead.addressCheck?.response);
    const targetProviderId = process.env.TARIFNIK_TARGET_PROVIDER_ID?.trim();
    if (!coverage || !coverage.hasTargetProvider || !targetProviderId || coverage.targetProviderId !== targetProviderId) {
      await this.prisma.lead.update({ where: { id: lead.id }, data: { processingStatus: 'MANUAL_CHECK_API' } });
      return { skipped: true, reason: 'coverage_not_verified' };
    }
    if (!hasVerifiedNegativeSubscriberResult(lead.contractResult)) {
      await this.prisma.lead.update({ where: { id: lead.id }, data: { processingStatus: 'MANUAL_CHECK_API' } });
      return { skipped: true, reason: 'subscriber_not_verified' };
    }

    const endpoint = process.env.TARIFNIK_API_URL?.trim();
    const apiKey = process.env.TARIFNIK_API_KEY?.trim();
    const campaign = process.env.TARIFNIK_UTM_CAMPAIGN?.trim();
    if (!endpoint || !apiKey || !campaign) {
      this.logger.warn(`Tarifnik delivery is not configured; lead ${lead.id} remains pending`);
      return { skipped: true, reason: 'integration_not_configured' };
    }

    const deliveryKey = lead.deliveryKey || makeDeliveryKey(`${lead.id}:${lead.createdAt.toISOString()}`);
    if (!lead.deliveryKey) await this.prisma.lead.update({ where: { id: lead.id }, data: { deliveryKey } });
    const payload = {
      utm_campaign: campaign,
      phone: normalizePhone(lead.phone),
      belong_type: lead.objectType === 'house' ? 'house' : 'apartments',
      suggestion: coverage.suggestion,
      ...(lead.name?.trim() ? { name: lead.name.trim() } : {}),
    };
    const attemptUrl = endpoint;
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.updateMany({
        where: { id: leadId, processingStatus: 'PENDING' },
        data: { processingStatus: 'DELIVERY_API_OUTCOME_UNKNOWN' },
      });
      if (updated.count !== 1) return updated;
      await tx.leadDeliveryAttempt.create({
        data: { leadId, attemptNumber, channel: 'API', status: 'OUTCOME_UNKNOWN', idempotencyKey: deliveryKey, requestPayload: payload as unknown as Prisma.InputJsonValue },
      });
      return updated;
    });
    if (claimed.count !== 1) return { skipped: true, reason: 'delivery_state_changed' };
    try {
      let response: Response;
      let raw: string;
      try {
        response = await fetch(attemptUrl, {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        raw = await response.text();
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'network failure';
        throw new TarifnikDeliveryError(`Tarifnik request failed: ${reason}`, true);
      }
      if (!response.ok) {
        throw new TarifnikDeliveryError(
          `Tarifnik responded ${response.status}`,
          isRetryableStatus(response.status),
          response.status === 429 ? retryAfterMilliseconds(response.headers.get('retry-after')) : undefined,
        );
      }
      let parsed: unknown = raw;
      try { parsed = raw ? JSON.parse(raw) : null; } catch {
        throw new TarifnikDeliveryError('Tarifnik returned invalid JSON after a successful request', false);
      }
      const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      const result = record.result;
      const externalId = typeof record.appeal_id === 'string' && record.appeal_id.trim() ? record.appeal_id.trim() : undefined;
      if ((result !== 'created' && result !== 'created_duplicate') || !externalId) {
        throw new TarifnikDeliveryError('Tarifnik returned an unexpected response', false);
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          const recorded = await tx.lead.updateMany({
            where: { id: leadId, processingStatus: 'DELIVERY_API_OUTCOME_UNKNOWN' },
            data: { processingStatus: 'DELIVERED', externalLeadId: externalId, externalStatus: result },
          });
          if (recorded.count !== 1) throw new Error('Lead state changed after Tarifnik accepted the appeal');
          await tx.leadDeliveryAttempt.update({
            where: { leadId_attemptNumber_channel: { leadId, attemptNumber, channel: 'API' } },
            data: { status: 'SUCCEEDED', response: parsed as Prisma.InputJsonValue },
          });
        });
      } catch (error) {
        this.logger.error(`Accepted Tarifnik appeal for lead ${leadId} could not be persisted: ${error instanceof Error ? error.message : String(error)}`);
        return { delivered: false, outcomeUnknown: true };
      }
      return { delivered: true, externalId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Tarifnik delivery error';
      const retryable = error instanceof TarifnikDeliveryError && error.retryable;
      const retryDelay = error instanceof TarifnikDeliveryError && error.retryAfterMs !== undefined
        ? error.retryAfterMs
        : RETRY_DELAYS[retryNumber];
      const nextAttemptAt = retryable && retryNumber < RETRY_DELAYS.length
        ? new Date(Date.now() + retryDelay)
        : null;
      await this.prisma.$transaction(async (tx) => {
        const recorded = await tx.lead.updateMany({
          where: { id: leadId, processingStatus: 'DELIVERY_API_OUTCOME_UNKNOWN' },
          data: { processingStatus: nextAttemptAt ? 'PENDING' : 'DELIVERY_EMAIL_OUTCOME_UNKNOWN' },
        });
        if (recorded.count !== 1) throw new Error('Lead state changed after Tarifnik delivery failure');
        await tx.leadDeliveryAttempt.update({
          where: { leadId_attemptNumber_channel: { leadId, attemptNumber, channel: 'API' } },
          data: { status: 'FAILED', error: message, nextAttemptAt },
        });
      });
      if (nextAttemptAt) {
        const queued = await this.enqueueTracked(leadId, attemptNumber + 1, retryDelay, retryNumber + 1);
        if (!queued.queued) {
          await this.prisma.leadDeliveryAttempt.update({
            where: { leadId_attemptNumber_channel: { leadId, attemptNumber, channel: 'API' } },
            data: { nextAttemptAt: null },
          });
          return { delivered: false, queueError: true };
        }
        return { delivered: false, retryAt: nextAttemptAt.toISOString() };
      }
      let emailError: string | null = null;
      try {
        await this.notifications.notifyDeliveryFallback({ id: lead.id, phone: lead.phone, name: lead.name, city: lead.city?.name || 'Город не выбран', address: lead.address, tariff: lead.tariff?.name });
      } catch (error) {
        emailError = error instanceof Error ? error.message : String(error);
      }
      const emailSent = emailError === null;
      await this.prisma.$transaction(async (tx) => {
        await tx.leadDeliveryAttempt.create({
          data: {
            leadId,
            attemptNumber,
            channel: 'EMAIL',
            status: emailSent ? 'SUCCEEDED' : 'FAILED',
            idempotencyKey: deliveryKey,
            ...(emailSent ? { response: { fallback: true } } : { error: emailError }),
          },
        });
        const finished = await tx.lead.updateMany({
          where: { id: leadId, processingStatus: 'DELIVERY_EMAIL_OUTCOME_UNKNOWN' },
          data: { processingStatus: emailSent ? 'DELIVERY_ERROR_EMAIL_SENT' : 'DELIVERY_ERROR_EMAIL_FAILED' },
        });
        if (finished.count !== 1) throw new Error('Lead state changed after fallback; outcome requires manual review');
      });
      return { delivered: false, fallback: emailSent };
    }
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { makeDeliveryKey, normalizePhone } from './lead-utils';
import { readTarifnikCoverageSnapshot } from './coverage.service';

const RETRY_DELAYS = [0, 5 * 60 * 1000, 30 * 60 * 1000];

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
      this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
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

  async enqueue(leadId: string, attemptNumber = 1, delay = 0) {
    if (this.queue) {
      await this.queue.add('deliver', { leadId, attemptNumber }, {
        delay,
        jobId: `${leadId}:${attemptNumber}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      return;
    }
    const run = () => this.process(leadId, attemptNumber).catch((error) => this.logger.error(error));
    if (delay > 0) setTimeout(run, delay);
    else queueMicrotask(run);
  }

  async process(leadId: string, attemptNumber: number) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { city: true, page: true, tariff: true, site: true, addressCheck: true },
    });
    if (!lead) return { skipped: true, reason: 'lead_not_found' };
    if (lead.processingStatus !== 'PENDING') return { skipped: true, reason: lead.processingStatus };

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
    try {
      const response = await fetch(attemptUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const raw = await response.text();
      let parsed: unknown = raw;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep text response */ }
      if (!response.ok) throw new Error(`Tarifnik responded ${response.status}`);
      const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      const result = record.result;
      const externalId = typeof record.appeal_id === 'string' && record.appeal_id.trim() ? record.appeal_id.trim() : undefined;
      if ((result !== 'created' && result !== 'created_duplicate') || !externalId) {
        throw new Error('Tarifnik returned an unexpected response');
      }
      await this.prisma.$transaction([
        this.prisma.leadDeliveryAttempt.create({
          data: { leadId, attemptNumber, channel: 'API', status: 'SUCCEEDED', idempotencyKey: deliveryKey, requestPayload: payload as unknown as Prisma.InputJsonValue, response: parsed as Prisma.InputJsonValue },
        }),
        this.prisma.lead.update({ where: { id: leadId }, data: { processingStatus: 'DELIVERED', externalLeadId: externalId, externalStatus: result } }),
      ]);
      return { delivered: true, externalId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Tarifnik delivery error';
      const nextAttemptAt = attemptNumber < RETRY_DELAYS.length ? new Date(Date.now() + RETRY_DELAYS[attemptNumber]) : null;
      await this.prisma.leadDeliveryAttempt.create({
        data: { leadId, attemptNumber, channel: 'API', status: 'FAILED', idempotencyKey: deliveryKey, requestPayload: payload as unknown as Prisma.InputJsonValue, error: message, nextAttemptAt },
      });
      if (nextAttemptAt) {
        await this.enqueue(leadId, attemptNumber + 1, RETRY_DELAYS[attemptNumber]);
        return { delivered: false, retryAt: nextAttemptAt.toISOString() };
      }
      let emailSent = false;
      try {
        await this.notifications.notifyDeliveryFallback({ id: lead.id, phone: lead.phone, name: lead.name, city: lead.city.name, address: lead.address, tariff: lead.tariff?.name });
        await this.prisma.leadDeliveryAttempt.create({ data: { leadId, attemptNumber: 1, channel: 'EMAIL', status: 'SUCCEEDED', idempotencyKey: deliveryKey, response: { fallback: true } } });
        emailSent = true;
      } catch (emailError) {
        await this.prisma.leadDeliveryAttempt.create({ data: { leadId, attemptNumber: 1, channel: 'EMAIL', status: 'FAILED', idempotencyKey: deliveryKey, error: emailError instanceof Error ? emailError.message : String(emailError) } });
      }
      await this.prisma.lead.update({ where: { id: leadId }, data: { processingStatus: emailSent ? 'DELIVERY_ERROR_EMAIL_SENT' : 'DELIVERY_ERROR_EMAIL_FAILED' } });
      return { delivered: false, fallback: emailSent };
    }
  }
}

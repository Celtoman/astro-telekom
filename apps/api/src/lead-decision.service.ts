import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { DadataService, type DadataPhoneCheck } from './dadata.service';
import { DomruContractService } from './domru-contract.service';
import { LeadDeliveryService } from './lead-delivery.service';
import { readTarifnikCoverageSnapshot } from './coverage.service';

const PHONE_RETRY_DELAYS = [0, 5 * 60_000, 30 * 60_000] as const;
const DECISION_LEASE_MS = 2 * 60_000;
const PHONE_CACHE_MS = 24 * 60 * 60_000;

@Injectable()
export class LeadDecisionService implements OnModuleDestroy {
  private readonly logger = new Logger(LeadDecisionService.name);
  private readonly queue: Queue | null;
  private readonly redis: IORedis | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dadata: DadataService,
    private readonly contract: DomruContractService,
    private readonly delivery: LeadDeliveryService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
      this.queue = new Queue('lead-decisions', { connection: this.redis });
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
      await this.queue.add('decide', { leadId, attemptNumber }, {
        delay,
        jobId: `lead-decision-${leadId}-attempt-${attemptNumber}`,
        attempts: 3,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });
      return;
    }
    const run = () => this.process(leadId, attemptNumber).catch((error) => this.logger.error(error));
    if (delay) setTimeout(run, delay);
    else queueMicrotask(run);
  }

  async enqueueTracked(leadId: string, attemptNumber = 1, delay = 0) {
    try {
      await this.enqueue(leadId, attemptNumber, delay);
      return { queued: true as const };
    } catch (error) {
      this.logger.error(`Lead decision job could not be queued for ${leadId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      // The persisted state stays pending; the minute reconciler will retry.
      return { queued: false as const };
    }
  }

  private async saveDecision(leadId: string, data: Prisma.LeadUpdateInput, type: string, outcome: string,
    evidence: Record<string, string | number | boolean>, attemptNumber?: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data });
      await tx.leadDecisionEvent.create({ data: {
        leadId, type, outcome, attemptNumber, evidence: evidence as Prisma.InputJsonObject,
      } });
    });
  }

  async reconcilePending(now = new Date()) {
    const rows = await this.prisma.lead.findMany({
      where: {
        OR: [
          { processingStatus: 'DECISION_PENDING' },
          { processingStatus: 'PHONE_CHECK_RETRY', phoneCheckNextAttemptAt: { lte: now } },
          { processingStatus: 'DECISION_RUNNING', decisionLeaseUntil: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, processingStatus: true, phoneCheckAttempt: true, decisionAttemptNumber: true },
    });
    let queued = 0;
    for (const row of rows) {
      const attemptNumber = row.processingStatus === 'DECISION_RUNNING'
        ? row.decisionAttemptNumber ?? Math.max(row.phoneCheckAttempt ?? 1, 1)
        : (row.phoneCheckAttempt ?? 0) + 1;
      if ((await this.enqueueTracked(row.id, attemptNumber)).queued) queued += 1;
    }
    return { scanned: rows.length, queued };
  }

  async process(leadId: string, attemptNumber = 1) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { city: true, addressCheck: true },
    });
    if (!lead) return { skipped: true, reason: 'lead_not_found' };
    const now = new Date();
    const canRecoverLease = lead.processingStatus === 'DECISION_RUNNING' && Boolean(lead.decisionLeaseUntil && lead.decisionLeaseUntil < now);
    if (!['DECISION_PENDING', 'PHONE_CHECK_RETRY'].includes(lead.processingStatus) && !canRecoverLease) {
      return { skipped: true, reason: lead.processingStatus };
    }
    if (lead.phoneCheckNextAttemptAt && lead.phoneCheckNextAttemptAt > now) return { skipped: true, reason: 'retry_not_due' };
    const claim = await this.prisma.lead.updateMany({
      where: { id: leadId, OR: [
        { processingStatus: { in: ['DECISION_PENDING', 'PHONE_CHECK_RETRY'] } },
        { processingStatus: 'DECISION_RUNNING', decisionLeaseUntil: { lt: now } },
      ] },
      data: { processingStatus: 'DECISION_RUNNING', phoneCheckStatus: 'RUNNING', decisionLeaseUntil: new Date(now.getTime() + DECISION_LEASE_MS), decisionAttemptNumber: attemptNumber },
    });
    if (!claim.count) return { skipped: true, reason: 'already_claimed' };

    if (lead.reasonRoute && lead.reasonRoute !== 'SALES' || lead.commentAnalysisOutcome === 'MANUAL_REVIEW') {
      const processingStatus = lead.commentAnalysisOutcome === 'MANUAL_REVIEW' || lead.reasonRoute === 'MANUAL' ? 'MANUAL_CHECK' : 'NON_SALES_NOT_SENT';
      await this.saveDecision(leadId, { processingStatus, phoneCheckStatus: 'SKIPPED', decisionLeaseUntil: null, decisionAttemptNumber: null },
        'ROUTE_DECISION', processingStatus, {
          reasonRoute: lead.reasonRoute || 'UNSPECIFIED', commentOutcome: lead.commentAnalysisOutcome || 'NONE',
        });
      return { skipped: true, reason: 'non_sales_route' };
    }

    const coverage = readTarifnikCoverageSnapshot(lead.addressCheck?.response);
    if (!coverage?.hasTargetProvider) {
      await this.saveDecision(leadId, { processingStatus: 'MANUAL_CHECK_API', phoneCheckStatus: 'SKIPPED', decisionLeaseUntil: null, decisionAttemptNumber: null },
        'ROUTE_DECISION', 'MANUAL_CHECK_API', { coverageVerified: false });
      return { skipped: true, reason: 'coverage_not_verified' };
    }

    let phoneResult: DadataPhoneCheck;
    let source = 'API';
    let checkedAt = now;
    if (lead.phoneCheckQc !== null && lead.phoneCheckQc !== undefined && lead.phoneCheckCheckedAt && ['PASSED', 'REJECTED'].includes(lead.phoneCheckStatus || '')) {
      phoneResult = { kind: 'FINAL', qc: lead.phoneCheckQc, normalizedPhone: lead.phoneCheckNormalized };
      source = lead.phoneCheckSource || 'API';
      checkedAt = lead.phoneCheckCheckedAt;
    } else {
      const cached = await this.prisma.lead.findFirst({
        where: {
          phone: lead.phone,
          id: { not: leadId },
          phoneCheckStatus: { in: ['PASSED', 'REJECTED'] },
          phoneCheckQc: { not: null },
          phoneCheckCheckedAt: { gte: new Date(now.getTime() - PHONE_CACHE_MS) },
        },
        orderBy: { phoneCheckCheckedAt: 'desc' },
        select: { phoneCheckQc: true, phoneCheckNormalized: true, phoneCheckCheckedAt: true },
      });
      if (cached?.phoneCheckQc !== null && cached?.phoneCheckQc !== undefined) {
        phoneResult = { kind: 'FINAL', qc: cached.phoneCheckQc, normalizedPhone: cached.phoneCheckNormalized };
        source = 'CACHE';
        checkedAt = cached.phoneCheckCheckedAt || now;
      } else {
        phoneResult = await this.dadata.cleanPhone(lead.phone);
      }
    }

    if (phoneResult.kind === 'TECHNICAL_ERROR') {
      const nextAttempt = attemptNumber + 1;
      const retryDelay = PHONE_RETRY_DELAYS[attemptNumber] ?? 0;
      const final = attemptNumber >= 3;
      const nextAttemptAt = final ? null : new Date(now.getTime() + retryDelay);
      await this.saveDecision(leadId, {
        processingStatus: final ? 'PHONE_CHECK_FAILED' : 'PHONE_CHECK_RETRY',
        phoneCheckStatus: final ? 'FAILED' : 'RETRYING',
        phoneCheckAttempt: attemptNumber,
        phoneCheckErrorCode: phoneResult.errorCode,
        phoneCheckNextAttemptAt: nextAttemptAt,
        decisionLeaseUntil: null, decisionAttemptNumber: null,
      }, 'PHONE_CHECK', final ? 'FAILED' : 'RETRYING', {
        errorCode: phoneResult.errorCode,
        ...(nextAttemptAt ? { nextAttemptAt: nextAttemptAt.toISOString() } : {}),
      }, attemptNumber);
      if (!final) await this.enqueueTracked(leadId, nextAttempt, retryDelay);
      return { status: final ? 'PHONE_CHECK_FAILED' : 'PHONE_CHECK_RETRY', attemptNumber };
    }

    const passed = phoneResult.qc === 0 && phoneResult.normalizedPhone === lead.phone;
    await this.saveDecision(leadId, {
      phoneCheckStatus: passed ? 'PASSED' : 'REJECTED',
      phoneCheckQc: phoneResult.qc,
      phoneCheckNormalized: phoneResult.normalizedPhone,
      phoneCheckCheckedAt: checkedAt,
      phoneCheckAttempt: attemptNumber,
      phoneCheckSource: source,
      phoneCheckErrorCode: passed || phoneResult.qc !== 0 ? null : 'NORMALIZED_MISMATCH',
      phoneCheckNextAttemptAt: null,
      ...(passed ? {} : { processingStatus: 'PHONE_INVALID_NOT_SENT', decisionLeaseUntil: null, decisionAttemptNumber: null }),
    }, 'PHONE_CHECK', passed ? 'PASSED' : 'REJECTED', {
      qc: phoneResult.qc, source, checkedAt: checkedAt.toISOString(), normalizedMatch: phoneResult.normalizedPhone === lead.phone,
    }, attemptNumber);
    if (!passed) return { status: 'PHONE_INVALID_NOT_SENT', qc: phoneResult.qc };

    const contractResult = await this.contract.check(lead.phone, coverage.suggestion.data, lead.city.subscriberProfileKey);
    const processingStatus = contractResult.status === 'ACTIVE'
      ? 'ACTIVE_SUBSCRIBER_NOT_SENT'
      : contractResult.status === 'NOT_FOUND' && contractResult.active === false
        ? 'PENDING'
        : 'MANUAL_CHECK_API';
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: {
      processingStatus,
      decisionLeaseUntil: null, decisionAttemptNumber: null,
      contractResult: {
        status: contractResult.status,
        active: contractResult.active,
        message: contractResult.message,
        response: contractResult.response,
      } as Prisma.InputJsonObject,
      } });
      await tx.leadDecisionEvent.create({ data: {
        leadId, type: 'SUBSCRIBER_CHECK', outcome: contractResult.status,
        evidence: { active: contractResult.active === true },
      } });
      await tx.leadDecisionEvent.create({ data: {
        leadId, type: 'ROUTE_DECISION', outcome: processingStatus,
        evidence: { subscriberStatus: contractResult.status, phoneQc: phoneResult.qc },
      } });
    });
    if (processingStatus === 'PENDING') {
      const delivery = await this.delivery.enqueueTracked(leadId);
      return { status: delivery.processingStatus || 'PENDING' };
    }
    return { status: processingStatus };
  }
}

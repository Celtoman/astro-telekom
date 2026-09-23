import { BadRequestException, Body, Controller, Logger, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { LeadDecisionService } from './lead-decision.service';
import { LeadNotificationOutboxService } from './lead-notification-outbox.service';
import { normalizeAddress, normalizePhone } from './lead-utils';
import { CreateLeadDto, LeadDecisionStatusDto } from './public.dto';
import { readTarifnikCoverageSnapshot } from './coverage.service';
import { LEAD_CONSENT_VERSION } from './lead-consent';
import { configurationSnapshot, quoteFingerprint, quoteTariffConfiguration } from './tariff-configuration.service';
import { classifyLeadReason } from './lead-reasons';
import { analyzeLeadComment } from './lead-comment-analyzer';

@Controller('leads')
export class PublicLeadsController {
  private readonly logger = new Logger(PublicLeadsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: LeadDecisionService,
    private readonly notifications: LeadNotificationOutboxService,
  ) {}

  @Post(':id/decision-status')
  async decisionStatus(@Param('id') id: string, @Body() body: LeadDecisionStatusDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, submissionKey: body.submissionKey },
      select: { processingStatus: true },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    const inProgress = ['DECISION_PENDING', 'DECISION_RUNNING', 'PHONE_CHECK_RETRY'].includes(lead.processingStatus);
    return { complete: !inProgress, subscriberMode: lead.processingStatus === 'ACTIVE_SUBSCRIBER_NOT_SENT' };
  }

  @Post()
  async create(@Body() body: CreateLeadDto, @Req() request: { headers?: Record<string, string | undefined>; url?: string }) {
    if (body.website) throw new BadRequestException('Некорректный запрос');
    const reason = classifyLeadReason(body.reasonCode);
    if (body.reasonCode !== undefined && !reason) throw new BadRequestException('Неизвестная причина обращения');
    const comment = body.comment?.trim() || undefined;
    const commentAnalysis = analyzeLeadComment(comment, reason?.code);
    const isSales = (!reason || reason.route === 'SALES') && commentAnalysis?.outcome !== 'MANUAL_REVIEW';
    if (typeof body.phone !== 'string' || !body.phone.trim() || typeof body.citySlug !== 'string' || !body.citySlug.trim()) {
      throw new BadRequestException('Телефон и город обязательны');
    }
    if (!body.submissionKey || body.consentVersion !== LEAD_CONSENT_VERSION) {
      throw new BadRequestException('Не удалось подтвердить условия отправки заявки. Обновите страницу');
    }
    const phone = normalizePhone(body.phone);
    if (!/^79\d{9}$/.test(phone)) {
      throw new BadRequestException('Введите мобильный номер в формате +7 (9XX) XXX-XX-XX');
    }

    const findSubmission = () => this.prisma.lead.findUnique({
      where: { submissionKey: body.submissionKey },
      select: {
        id: true,
        status: true,
        processingStatus: true,
        siteId: true,
        cityId: true,
        addressCheckId: true,
        pageId: true,
        tariffId: true,
        configurationSnapshot: true,
        reasonCode: true,
        comment: true,
        serviceType: true,
        phone: true,
        address: true,
        objectType: true,
        site: { select: { slug: true } },
        city: { select: { slug: true } },
        page: { select: { slug: true } },
        tariff: { select: { slug: true, serviceType: true } },
      },
    });
    const returnExistingSubmission = (existing: Awaited<ReturnType<typeof findSubmission>>) => {
      if (!existing) return null;
      const matches = existing.site.slug === (body.siteSlug || 'domru-site')
        && existing.city.slug === body.citySlug
        && (existing.page?.slug ?? null) === (body.pageSlug || null)
        && (existing.tariff?.slug ?? null) === (body.tariffSlug || null)
        && existing.addressCheckId === (body.addressCheckId ?? null)
        && (!body.address?.trim() || existing.address === body.address.trim())
        && (!body.objectType || existing.objectType === body.objectType)
        && ((existing.configurationSnapshot as { fingerprint?: string } | null)?.fingerprint ?? null) === (body.configuration?.fingerprint ?? null)
        && (existing.serviceType ?? null) === (body.serviceType || existing.tariff?.serviceType || null)
        && existing.phone === phone
        && (existing.reasonCode ?? null) === (reason?.code ?? null)
        && (existing.comment ?? null) === (comment ?? null);
      if (!matches) throw new BadRequestException('Ключ отправки уже использован для другой заявки');
      return {
        id: existing.id,
        status: existing.status,
        message: 'Заявка принята',
        subscriberMode: existing.processingStatus === 'ACTIVE_SUBSCRIBER_NOT_SENT',
      };
    };
    const existingSubmission = returnExistingSubmission(await findSubmission());
    if (existingSubmission) return existingSubmission;

    const site = await this.prisma.site.findFirst({
      where: { slug: body.siteSlug || 'domru-site', status: 'PUBLISHED' },
    });
    if (!site) throw new BadRequestException('Сайт не найден');

    const city = await this.prisma.city.findFirst({
      where: { siteId: site.id, slug: body.citySlug, status: 'PUBLISHED' },
    });
    if (!city) throw new BadRequestException('Город не найден');

    const page = body.pageSlug
      ? await this.prisma.page.findFirst({ where: { cityId: city.id, slug: body.pageSlug, status: 'PUBLISHED' } })
      : null;
    const publication = body.configuration
      ? await this.prisma.sitePublication.findFirst({
        where: { siteId: site.id, status: 'SUCCEEDED' },
        orderBy: { siteRevision: 'desc' },
        select: { catalog: true },
      })
      : null;
    const catalog = publication?.catalog as { cities?: Array<{ slug?: string; tariffs?: Array<Record<string, unknown>> }> } | null;
    const publishedCity = catalog?.cities?.find((item) => item.slug === city.slug);
    const publishedTariff = publishedCity?.tariffs?.find((item) => item.slug === body.tariffSlug);
    const tariff = body.tariffSlug && (!body.configuration || typeof publishedTariff?.id === 'string')
      ? await this.prisma.tariff.findFirst({ where: body.configuration
        ? { id: publishedTariff!.id as string, cityId: city.id }
        : { cityId: city.id, slug: body.tariffSlug, status: 'PUBLISHED', availability: 'ACTIVE' } })
      : null;
    const addressCheck = body.addressCheckId
      ? await this.prisma.addressCheck.findFirst({ where: { id: body.addressCheckId, cityId: city.id, siteId: site.id } })
      : null;

    if (body.addressCheckId && !addressCheck) {
      throw new BadRequestException('Проверка адреса не найдена для этого города');
    }
    if (body.pageSlug && !page) {
      throw new BadRequestException('Страница не найдена или не опубликована');
    }
    if (body.tariffSlug && !tariff) {
      throw new BadRequestException('Тариф не найден или не опубликован');
    }
    if (addressCheck && body.address?.trim() && body.address.trim() !== addressCheck.address) {
      throw new BadRequestException('Адрес изменился. Выполните проверку повторно');
    }
    if (addressCheck && body.objectType && body.objectType !== addressCheck.objectType) {
      throw new BadRequestException('Тип объекта изменился. Выполните проверку повторно');
    }

    const address = addressCheck?.address ?? body.address?.trim();
    const coverage = addressCheck ? readTarifnikCoverageSnapshot(addressCheck.response) : null;
    if (isSales && (!addressCheck || addressCheck.status !== 'AVAILABLE' || !coverage?.hasTargetProvider)) {
      throw new BadRequestException('Заявку можно отправить только после положительной проверки адреса');
    }

    let storedConfiguration: Prisma.InputJsonValue | undefined;
    if (body.configuration) {
      if (!tariff || !publishedTariff || !body.tariffSlug) throw new BadRequestException('Условия тарифа изменились. Повторите расчёт');
      try {
        const quote = quoteTariffConfiguration(
          publishedTariff as unknown as Parameters<typeof quoteTariffConfiguration>[0],
          body.configuration.selection,
        );
        const snapshot = configurationSnapshot(quote);
        const fingerprint = quoteFingerprint(snapshot);
        if (fingerprint !== body.configuration.fingerprint) throw new Error('Условия тарифа изменились. Повторите расчёт');
        storedConfiguration = { ...snapshot, fingerprint, capturedAt: new Date().toISOString() } as Prisma.InputJsonObject;
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Неверная комплектация');
      }
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLeads = await this.prisma.lead.findMany({
      where: { siteId: site.id, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, phone: true, address: true },
    });
    const normalizedPhone = phone;
    const normalizedInputAddress = normalizeAddress(address);
    const duplicate = recentLeads.find((candidate) =>
      (normalizedPhone && normalizePhone(candidate.phone) === normalizedPhone)
      || (normalizedInputAddress && normalizeAddress(candidate.address) === normalizedInputAddress),
    );

    let processingStatus: 'DECISION_PENDING' | 'DUPLICATE_SUPPRESSED' | 'NON_SALES_NOT_SENT' | 'MANUAL_CHECK' = 'DECISION_PENDING';
    if (commentAnalysis?.outcome === 'MANUAL_REVIEW') processingStatus = 'MANUAL_CHECK';
    else if (reason?.route === 'NON_SALES') processingStatus = 'NON_SALES_NOT_SENT';
    else if (reason?.route === 'MANUAL') processingStatus = 'MANUAL_CHECK';
    else if (duplicate) processingStatus = 'DUPLICATE_SUPPRESSED';

    let leadAndNotification: { lead: { id: string; status: unknown }; notification: { id: string } };
    try {
      leadAndNotification = await this.prisma.$transaction(async (tx) => {
        const created = await tx.lead.create({
          data: {
            siteId: site.id,
            cityId: city.id,
            pageId: page?.id,
            tariffId: tariff?.id,
            configurationSnapshot: storedConfiguration,
            reasonCode: reason?.code,
            reasonLabel: reason?.label,
            reasonRoute: reason?.route,
            reasonRegistryVersion: reason?.version,
            comment,
            commentAnalysisVersion: commentAnalysis?.version,
            commentAnalysisOutcome: commentAnalysis?.outcome,
            commentAnalysisCategory: commentAnalysis?.category,
            commentAnalysisEvidence: commentAnalysis?.evidence as Prisma.InputJsonValue | undefined,
            commentAnalysisExplanation: commentAnalysis?.explanation,
            name: body.name?.trim(),
            phone,
            submissionKey: body.submissionKey,
            consentVersion: LEAD_CONSENT_VERSION,
            consentAcceptedAt: new Date(),
            email: body.email?.trim(),
            address,
            objectType: addressCheck?.objectType ?? body.objectType,
            serviceType: body.serviceType || tariff?.serviceType,
            addressCheckId: addressCheck?.id,
            source: body.source || 'website',
            utm: body.utm ? { ...body.utm } as Prisma.InputJsonValue : undefined,
            referrer: body.referrer || request.headers?.referer,
            pageUrl: body.pageUrl || request.url,
            formName: body.formName || 'lead',
            timeOnSiteSeconds: typeof body.timeOnSiteSeconds === 'number' && body.timeOnSiteSeconds >= 0 ? Math.round(body.timeOnSiteSeconds) : undefined,
            deviceType: body.deviceType,
            viewedPages: Array.isArray(body.viewedPages) ? body.viewedPages.slice(-50) : undefined,
            processingStatus,
            phoneCheckStatus: processingStatus === 'DECISION_PENDING' ? 'PENDING' : 'SKIPPED',
            duplicateOfId: duplicate?.id,
            duplicateReason: duplicate ? (normalizedPhone && normalizePhone(duplicate.phone) === normalizedPhone ? 'phone_24h' : 'address_24h') : undefined,
            deliveryKey: randomUUID(),
            apiResult: addressCheck ? { status: addressCheck.status, response: addressCheck.response } : undefined,
          },
        });
        if (processingStatus !== 'DECISION_PENDING') {
          await tx.leadDecisionEvent.create({ data: {
            leadId: created.id,
            type: 'ROUTE_DECISION',
            outcome: processingStatus,
            evidence: {
              reasonRoute: reason?.route || 'UNSPECIFIED',
              commentOutcome: commentAnalysis?.outcome || 'NONE',
              duplicate: Boolean(duplicate),
            },
          } });
        }
        if (Array.isArray(body.activity)) {
          const events = body.activity.filter((event) => event && typeof event.type === 'string').slice(-100);
          if (events.length) await tx.leadActivityEvent.createMany({
            data: events.map((event) => ({
              leadId: created.id,
              type: event.type,
              data: event.data ? event.data as Prisma.InputJsonValue : undefined,
            })),
          });
        }
        const createdNotification = await this.notifications.create(tx, created.id);
        return { lead: created, notification: createdNotification };
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
      if (code === 'P2002') {
        const racedSubmission = returnExistingSubmission(await findSubmission());
        if (racedSubmission) return racedSubmission;
      }
      throw error;
    }
    const { lead, notification } = leadAndNotification;

    try {
      await this.notifications.enqueueTracked(notification.id);
    } catch {
      this.logger.error({
        message: 'Lead notification outbox could not be queued',
        leadId: lead.id,
        notificationId: notification.id,
        code: 'outbox_error',
      });
    }

    if (processingStatus === 'DECISION_PENDING') await this.decisions.enqueueTracked(lead.id);

    return { id: lead.id, status: lead.status, message: 'Заявка принята', subscriberMode: false };
  }
}

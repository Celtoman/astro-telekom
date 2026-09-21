import { BadRequestException, Body, Controller, Logger, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { DomruContractService } from './domru-contract.service';
import { LeadDeliveryService } from './lead-delivery.service';
import { LeadNotificationOutboxService } from './lead-notification-outbox.service';
import { normalizeAddress, normalizePhone } from './lead-utils';
import { CreateLeadDto } from './public.dto';
import { readTarifnikCoverageSnapshot } from './coverage.service';

@Controller('leads')
export class PublicLeadsController {
  private readonly logger = new Logger(PublicLeadsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contract: DomruContractService,
    private readonly delivery: LeadDeliveryService,
    private readonly notifications: LeadNotificationOutboxService,
  ) {}

  @Post()
  async create(@Body() body: CreateLeadDto, @Req() request: { headers?: Record<string, string | undefined>; url?: string }) {
    if (body.website) throw new BadRequestException('Некорректный запрос');
    if (typeof body.phone !== 'string' || !body.phone.trim() || typeof body.citySlug !== 'string' || !body.citySlug.trim()) {
      throw new BadRequestException('Телефон и город обязательны');
    }

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
    const tariff = body.tariffSlug
      ? await this.prisma.tariff.findFirst({ where: { cityId: city.id, slug: body.tariffSlug, status: 'PUBLISHED', availability: 'ACTIVE' } })
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

    const phone = body.phone.trim();
    const address = addressCheck?.address ?? body.address?.trim();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLeads = await this.prisma.lead.findMany({
      where: { siteId: site.id, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, phone: true, address: true },
    });
    const normalizedPhone = normalizePhone(phone);
    const normalizedInputAddress = normalizeAddress(address);
    const duplicate = recentLeads.find((candidate) =>
      (normalizedPhone && normalizePhone(candidate.phone) === normalizedPhone)
      || (normalizedInputAddress && normalizeAddress(candidate.address) === normalizedInputAddress),
    );

    const coverage = addressCheck ? readTarifnikCoverageSnapshot(addressCheck.response) : null;
    const coverageStatusMatches = Boolean(coverage && (
      (coverage.hasTargetProvider && addressCheck?.status === 'AVAILABLE')
      || (!coverage.hasTargetProvider && addressCheck?.status === 'UNAVAILABLE')
    ));
    let processingStatus: 'PENDING' | 'DUPLICATE_SUPPRESSED' | 'ACTIVE_SUBSCRIBER_NOT_SENT' | 'PROVIDER_NOT_AVAILABLE_NOT_SENT' | 'NO_PROVIDERS_NOT_SENT' | 'MANUAL_CHECK' | 'ADDRESS_CLARIFICATION' | 'MANUAL_CHECK_API' = 'PENDING';
    if (duplicate) processingStatus = 'DUPLICATE_SUPPRESSED';
    else if (!addressCheck || addressCheck.status === 'MANUAL_CHECK') processingStatus = 'MANUAL_CHECK';
    else if (addressCheck?.status === 'AMBIGUOUS') processingStatus = 'ADDRESS_CLARIFICATION';
    else if (addressCheck?.status === 'ERROR') processingStatus = 'MANUAL_CHECK_API';
    else if (!coverage || !coverageStatusMatches) processingStatus = 'MANUAL_CHECK_API';
    else if (!coverage.hasAnyProvider) processingStatus = 'NO_PROVIDERS_NOT_SENT';

    let contractResult: Awaited<ReturnType<DomruContractService['check']>> | undefined;
    if (!duplicate && processingStatus === 'PENDING' && coverage?.hasAnyProvider) {
      contractResult = await this.contract.check(phone, coverage.suggestion.data, city.subscriberProfileKey);
      if (contractResult.status === 'ACTIVE') processingStatus = 'ACTIVE_SUBSCRIBER_NOT_SENT';
      else if (contractResult.status === 'ERROR' || contractResult.status === 'NOT_CONFIGURED') processingStatus = 'MANUAL_CHECK_API';
      else if (!coverage.hasTargetProvider) processingStatus = 'PROVIDER_NOT_AVAILABLE_NOT_SENT';
    }

    const { lead, notification } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          siteId: site.id,
          cityId: city.id,
          pageId: page?.id,
          tariffId: tariff?.id,
          name: body.name?.trim(),
          phone,
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
          duplicateOfId: duplicate?.id,
          duplicateReason: duplicate ? (normalizedPhone && normalizePhone(duplicate.phone) === normalizedPhone ? 'phone_24h' : 'address_24h') : undefined,
          deliveryKey: randomUUID(),
          contractResult: contractResult ? {
            status: contractResult.status,
            active: contractResult.active,
            message: contractResult.message,
            response: contractResult.response,
          } as any : undefined,
          apiResult: addressCheck ? { status: addressCheck.status, response: addressCheck.response } : undefined,
        },
      });
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

    if (processingStatus === 'PENDING') await this.delivery.enqueueTracked(lead.id, 1, 0, 1);

    const subscriberMode = processingStatus === 'ACTIVE_SUBSCRIBER_NOT_SENT';
    return { id: lead.id, status: lead.status, message: 'Заявка принята', subscriberMode };
  }
}

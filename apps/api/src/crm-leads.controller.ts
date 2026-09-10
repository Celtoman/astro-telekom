import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { LeadDeliveryService } from './lead-delivery.service';
import { LeadAccessService } from './lead-access.service';
import { LeadNotificationOutboxService } from './lead-notification-outbox.service';

type LeadStatus = 'NEW' | 'IN_PROGRESS' | 'CALL_LATER' | 'CONNECTED' | 'REJECTED';

interface StatusBody {
  status: LeadStatus;
  comment?: string;
}

@Controller('crm/leads')
@UseGuards(AdminTokenGuard)
export class CrmLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: LeadDeliveryService,
    private readonly leadAccess: LeadAccessService,
    private readonly notifications: LeadNotificationOutboxService,
  ) {}

  @Get()
  list() {
    return this.prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      include: { city: true, page: true, tariff: true, history: true, deliveryAttempts: true, notification: true, activityEvents: true, duplicateOf: { select: { id: true, phone: true, createdAt: true } } },
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.prisma.lead.findUniqueOrThrow({
      where: { id },
      include: { site: true, city: true, page: true, tariff: true, addressCheck: true, history: true, deliveryAttempts: true, notification: true, activityEvents: true, duplicateOf: true },
    });
  }

  @Post(':id/retry-delivery')
  async retryDelivery(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { deliveryAttempts: { where: { channel: 'API' }, orderBy: { attemptNumber: 'desc' }, take: 1 } },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    const apiAttempts = lead.deliveryAttempts || [];
    const isOrphanPending = lead.processingStatus === 'PENDING' && apiAttempts.length === 0;
    const isRecoverableFailure = ['DELIVERY_QUEUE_ERROR', 'DELIVERY_ERROR_EMAIL_SENT', 'DELIVERY_ERROR_EMAIL_FAILED'].includes(lead.processingStatus);
    if (!isOrphanPending && !isRecoverableFailure) {
      throw new BadRequestException('Для этой заявки повторная передача не требуется');
    }
    if (lead.processingStatus !== 'PENDING') {
      await this.prisma.lead.update({ where: { id }, data: { processingStatus: 'PENDING' } });
    }
    const attemptNumber = (apiAttempts[0]?.attemptNumber || 0) + 1;
    const result = await this.delivery.enqueueTracked(id, attemptNumber, 0, 1);
    return {
      id,
      processingStatus: result.processingStatus,
      message: result.queued ? 'Повторная передача поставлена в очередь' : 'Не удалось поставить повторную передачу в очередь',
    };
  }

  @Post(':id/retry-notification')
  retryNotification(@Param('id') id: string) {
    return this.notifications.retryForLead(id);
  }

  @Post(':id/revoke-fallback-access')
  async revokeFallbackAccess(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { id: true } });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    return { id, revokedTokens: await this.leadAccess.revoke(id) };
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: StatusBody, @Req() request: { user?: { id: string } }) {
    if (!body || !['NEW', 'IN_PROGRESS', 'CALL_LATER', 'CONNECTED', 'REJECTED'].includes(body.status)) {
      throw new BadRequestException('Неизвестный статус заявки');
    }
    if (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.length > 5000)) {
      throw new BadRequestException('Комментарий должен содержать не более 5000 символов');
    }
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.lead.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Заявка не найдена');
      if (current.status === body.status) return current;
      const updated = await tx.lead.updateMany({
        where: { id, status: current.status, updatedAt: current.updatedAt },
        data: { status: body.status },
      });
      if (updated.count !== 1) throw new ConflictException('Заявка изменена другим оператором. Обновите список');
      await tx.leadStatusHistory.create({
        data: { leadId: id, fromStatus: current.status, toStatus: body.status,
          comment: body.comment?.trim(), actorId: request.user?.id || 'service:admin-token' },
      });
      return tx.lead.findUniqueOrThrow({ where: { id } });
    });
  }
}

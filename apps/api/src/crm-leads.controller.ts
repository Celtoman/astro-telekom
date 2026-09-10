import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { LeadDeliveryService } from './lead-delivery.service';
import { LeadAccessService } from './lead-access.service';

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
  ) {}

  @Get()
  list() {
    return this.prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      include: { city: true, page: true, tariff: true, history: true, deliveryAttempts: true, activityEvents: true, duplicateOf: { select: { id: true, phone: true, createdAt: true } } },
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.prisma.lead.findUniqueOrThrow({
      where: { id },
      include: { site: true, city: true, page: true, tariff: true, addressCheck: true, history: true, deliveryAttempts: true, activityEvents: true, duplicateOf: true },
    });
  }

  @Post(':id/retry-delivery')
  async retryDelivery(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    if (!['DELIVERY_ERROR_EMAIL_SENT', 'DELIVERY_ERROR_EMAIL_FAILED'].includes(lead.processingStatus)) {
      throw new BadRequestException('Для этой заявки повторная передача не требуется');
    }
    await this.prisma.lead.update({ where: { id }, data: { processingStatus: 'PENDING' } });
    await this.delivery.enqueue(id, 1, 0);
    return { id, processingStatus: 'PENDING', message: 'Повторная передача поставлена в очередь' };
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

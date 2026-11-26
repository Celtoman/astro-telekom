import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard, MachineOnly } from './admin-token.guard';
import { LeadDeliveryService } from './lead-delivery.service';

@Controller('internal/lead-deliveries')
@UseGuards(AdminTokenGuard)
@MachineOnly()
export class LeadDeliveryController {
  constructor(private readonly delivery: LeadDeliveryService) {}

  @Post(':id')
  process(@Param('id') id: string, @Body() body: { attemptNumber?: number; retryNumber?: number }) {
    return this.delivery.process(id, Number(body?.attemptNumber || 1), Number(body?.retryNumber || 1));
  }
}

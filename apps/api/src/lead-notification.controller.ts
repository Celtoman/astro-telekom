import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard, MachineOnly } from './admin-token.guard';
import { LeadNotificationOutboxService } from './lead-notification-outbox.service';

@Controller('internal/lead-notifications')
@UseGuards(AdminTokenGuard)
@MachineOnly()
export class LeadNotificationController {
  constructor(private readonly notifications: LeadNotificationOutboxService) {}

  @Post(':id')
  process(
    @Param('id') id: string,
    @Body() body: { attemptNumber?: number; maxAttempts?: number; revision?: number },
  ) {
    return this.notifications.process(
      id,
      Number(body?.attemptNumber || 1),
      Number(body?.maxAttempts || 3),
      body?.revision === undefined ? undefined : Number(body.revision),
    );
  }
}

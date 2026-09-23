import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { LeadDecisionService } from './lead-decision.service';

@Controller('internal/lead-decisions')
@UseGuards(AdminTokenGuard)
export class LeadDecisionController {
  constructor(private readonly decisions: LeadDecisionService) {}

  @Post('reconcile')
  reconcile() {
    return this.decisions.reconcilePending();
  }

  @Post(':id')
  process(@Param('id') id: string, @Body() body: { attemptNumber?: number }) {
    const attemptNumber = Number(body?.attemptNumber);
    return this.decisions.process(id, Number.isInteger(attemptNumber) && attemptNumber >= 1 && attemptNumber <= 3 ? attemptNumber : 1);
  }
}

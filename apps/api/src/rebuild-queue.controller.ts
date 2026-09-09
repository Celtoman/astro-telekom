import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { RebuildQueueService } from './rebuild-queue.service';

const DEFAULT_ATTEMPTS = 3;

@Controller()
@UseGuards(AdminTokenGuard)
export class RebuildQueueController {
  constructor(private readonly rebuilds: RebuildQueueService) {}

  @Get('admin/rebuilds')
  list(@Query('siteId') siteId?: string) {
    return this.rebuilds.list(siteId);
  }

  @Get('admin/rebuilds/:id')
  get(@Param('id') id: string) {
    return this.rebuilds.get(id);
  }

  @Post('internal/site-rebuilds/:id/start')
  start(
    @Param('id') id: string,
    @Body() body: { attemptNumber?: number; maxAttempts?: number; revision?: number },
  ) {
    return this.rebuilds.startAttempt(
      id,
      Number(body?.attemptNumber || 1),
      Number(body?.maxAttempts || DEFAULT_ATTEMPTS),
      body?.revision ? Number(body.revision) : undefined,
    );
  }

  @Post('internal/site-rebuilds/:id/result')
  result(
    @Param('id') id: string,
    @Body() body: { attemptNumber?: number; maxAttempts?: number; revision?: number; result?: { status: 'SUCCEEDED'; deploymentId?: string; url?: string }; error?: string; deploymentId?: string; providerStatus?: string; providerResponse?: unknown },
  ) {
    return this.rebuilds.reportResult(id, body);
  }

  @Post('internal/site-rebuilds/:id/provider-progress')
  providerProgress(
    @Param('id') id: string,
    @Body() body: { revision?: number; deploymentId?: string; providerStatus?: string; providerResponse?: unknown },
  ) {
    return this.rebuilds.recordProviderProgress(id, body);
  }
}

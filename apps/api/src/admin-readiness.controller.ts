import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { ReleaseReadinessService } from './release-readiness.service';

@Controller('admin/readiness')
@UseGuards(AdminTokenGuard)
export class AdminReadinessController {
  constructor(private readonly readiness: ReleaseReadinessService) {}

  @Get()
  getReadiness() {
    return this.readiness.configuration();
  }
}

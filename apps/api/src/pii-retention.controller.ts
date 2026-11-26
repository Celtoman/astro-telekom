import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard, MachineOnly } from './admin-token.guard';
import { PiiRetentionService } from './pii-retention.service';

@Controller('internal/pii-retention')
@UseGuards(AdminTokenGuard)
@MachineOnly()
export class PiiRetentionController {
  constructor(private readonly retention: PiiRetentionService) {}

  @Post()
  @HttpCode(200)
  purge() {
    return this.retention.purge();
  }
}

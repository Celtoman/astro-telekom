import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { SiteValuesService } from './site-values.service';

interface UpdateSiteValuesBody {
  expectedWorkingRevision: number;
  connectionPhone: string;
  supportPhone: string;
  publicDisplay?: unknown;
}

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin/sites/:siteId/values')
@UseGuards(AdminTokenGuard)
export class AdminSiteValuesController {
  constructor(private readonly values: SiteValuesService) {}

  @Get()
  get(@Param('siteId') siteId: string) {
    return this.values.get(siteId);
  }

  @Patch()
  update(
    @Param('siteId') siteId: string,
    @Body() body: UpdateSiteValuesBody,
    @Req() request?: AdminRequest,
  ) {
    return this.values.update({ ...body, siteId, actorId: request?.user?.id });
  }
}

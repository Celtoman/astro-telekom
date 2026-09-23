import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { SeoTemplateService, type UpdateSeoTemplateInput } from './seo-template.service';

@Controller('admin/sites/:siteId/seo-templates')
@UseGuards(AdminTokenGuard)
export class AdminSeoTemplatesController {
  constructor(private readonly seo: SeoTemplateService) {}

  @Get()
  get(@Param('siteId') siteId: string) {
    return this.seo.get(siteId);
  }

  @Patch(':kind')
  update(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Body() body: UpdateSeoTemplateInput,
    @Req() request?: { user?: { id: string } },
  ) {
    return this.seo.update(siteId, kind, body, request?.user?.id);
  }
}

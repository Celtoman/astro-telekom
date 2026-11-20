import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { readAdminRoutePage, readAdminWorkingRevision } from './admin-route-pagination';
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

  @Get('settings')
  settings(@Param('siteId') siteId: string) {
    return this.seo.getSettings(siteId);
  }

  @Get('review')
  review(
    @Param('siteId') siteId: string,
    @Query('workingRevision') workingRevision: string,
    @Query('kind') kind: string,
    @Query('page') page?: string,
    @Query('path') path?: string,
    @Query('publishedPublicationId') publishedPublicationId?: string,
  ) {
    return this.seo.review(siteId, { workingRevision: readAdminWorkingRevision(workingRevision), kind, page: readAdminRoutePage(page), path, publishedPublicationId });
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

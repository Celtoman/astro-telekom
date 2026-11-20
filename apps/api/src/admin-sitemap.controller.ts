import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { readAdminRoutePage, readAdminWorkingRevision } from './admin-route-pagination';
import { AdminTokenGuard } from './admin-token.guard';
import { ReplaceSitemapExclusionsDto } from './sitemap.dto';
import { SitemapService } from './sitemap.service';

interface AdminRequest { user?: { id: string } }

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminSitemapController {
  constructor(private readonly sitemap: SitemapService) {}

  @Get('sites/:siteId/sitemap')
  workspace(@Param('siteId') siteId: string) {
    return this.sitemap.getWorkspace(siteId);
  }

  @Get('sites/:siteId/sitemap/settings')
  settings(@Param('siteId') siteId: string) {
    return this.sitemap.getSettings(siteId);
  }

  @Get('sites/:siteId/sitemap/inventory')
  inventory(
    @Param('siteId') siteId: string,
    @Query('workingRevision') workingRevision: string,
    @Query('group') group?: string,
    @Query('page') page?: string,
    @Query('search') search?: string,
  ) {
    return this.sitemap.getInventory(siteId, { workingRevision: readAdminWorkingRevision(workingRevision), group, page: readAdminRoutePage(page), search });
  }

  @Put('sites/:siteId/sitemap-exclusions')
  replaceExclusions(@Param('siteId') siteId: string, @Body() body: ReplaceSitemapExclusionsDto, @Req() request?: AdminRequest) {
    return this.sitemap.replaceExclusions(siteId, body, request?.user?.id);
  }
}

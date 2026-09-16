import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
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

  @Put('sites/:siteId/sitemap-exclusions')
  replaceExclusions(@Param('siteId') siteId: string, @Body() body: ReplaceSitemapExclusionsDto, @Req() request?: AdminRequest) {
    return this.sitemap.replaceExclusions(siteId, body, request?.user?.id);
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PublicationWorkflowService } from './publication-workflow.service';

@Controller()
@UseGuards(AdminTokenGuard)
export class PublicationWorkflowController {
  constructor(private readonly publications: PublicationWorkflowService) {}

  @Get('internal/site-publications/:siteSlug/catalog')
  buildCatalog(@Param('siteSlug') siteSlug: string) {
    return this.publications.getBuildCatalog(siteSlug);
  }
}

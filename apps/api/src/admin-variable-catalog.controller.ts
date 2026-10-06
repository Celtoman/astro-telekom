import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PublicationWorkflowService } from './publication-workflow.service';
import { buildVariableCatalogView } from './variable-catalog';
import { WorkingVariableUsagesService } from './working-variable-usages.service';
import { listVariableDefinitions } from './variable-registry';

@Controller('admin/sites/:siteId/variable-catalog')
@UseGuards(AdminTokenGuard)
export class AdminVariableCatalogController {
  constructor(
    private readonly publications: PublicationWorkflowService,
    private readonly usages: WorkingVariableUsagesService,
  ) {}

  @Get('definitions')
  definitions() {
    return listVariableDefinitions();
  }

  @Get()
  async list(
    @Param('siteId') siteId: string,
    @Query('cityId') cityId?: string,
    @Query('tariffId') tariffId?: string,
  ) {
    const preview = await this.publications.getVariableContext(siteId, cityId);
    const rowUsages = await this.usages.list(siteId, preview.workingRevision);
    const rawWorking = preview.catalog as Record<string, any>;
    const working = { ...rawWorking, variableUsages: rowUsages };
    let published: Record<string, any> | null = null;
    try {
      published = await this.publications.getPublishedCatalog(rawWorking.site.slug);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    return buildVariableCatalogView({
      siteId,
      workingRevision: preview.workingRevision,
      publishedRevision: preview.publishedRevision,
      working,
      published,
      cityId,
      tariffId,
    });
  }
}

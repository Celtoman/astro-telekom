import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PublicationWorkflowService } from './publication-workflow.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { CreateSitePublicationDto } from './publication-workflow.dto';

interface AdminRequest {
  user?: { id: string };
}

@Controller()
@UseGuards(AdminTokenGuard)
export class PublicationWorkflowController {
  constructor(
    private readonly publications: PublicationWorkflowService,
    private readonly rebuilds: RebuildQueueService,
  ) {}

  @Post('admin/sites/:siteId/publications')
  async create(
    @Param('siteId') siteId: string,
    @Body() body: CreateSitePublicationDto,
    @Req() request?: AdminRequest,
  ) {
    const publication = await this.publications.preparePublication({
      siteId,
      expectedWorkingRevision: body.expectedWorkingRevision,
      triggerEntity: 'site',
      triggerEntityId: siteId,
      requestedById: request?.user?.id,
    });
    try {
      const rebuild = await this.rebuilds.enqueue({
        entity: 'site-publication',
        id: publication.id,
        siteId,
        publicationId: publication.id,
      });
      return { publication, rebuild };
    } catch (error) {
      const lastError = error instanceof Error ? error.message : 'Не удалось поставить публикацию в очередь';
      const failed = await this.publications.markFailed(publication.id, lastError);
      return {
        publication: failed,
        rebuild: {
          id: null,
          status: 'ENQUEUE_FAILED' as const,
          lastError,
        },
      };
    }
  }

  @Get('admin/sites/:siteId/publication-state')
  state(@Param('siteId') siteId: string) {
    return this.publications.getState(siteId);
  }

  @Get('admin/sites/:siteId/publication-review')
  review(@Param('siteId') siteId: string) {
    return this.publications.getPublicationReview(siteId);
  }

  @Get('admin/sites/:siteId/publication-validations')
  validations(@Param('siteId') siteId: string) {
    return this.publications.listValidations(siteId);
  }

  @Get('admin/sites/:siteId/publication-validations/:validationId')
  validation(@Param('siteId') siteId: string, @Param('validationId') validationId: string) {
    return this.publications.getValidation(siteId, validationId);
  }

  @Get('admin/sites/:siteId/preview-catalog')
  preview(@Param('siteId') siteId: string) {
    return this.publications.getWorkingPreview(siteId);
  }

  @Get('internal/site-publications/:siteSlug/catalog')
  buildCatalog(@Param('siteSlug') siteSlug: string) {
    return this.publications.getBuildCatalog(siteSlug);
  }

  @Get('internal/site-publications/:siteSlug/snapshots/:publicationId')
  exactBuildSnapshot(@Param('siteSlug') siteSlug: string, @Param('publicationId') publicationId: string) {
    return this.publications.getExactBuildSnapshot(siteSlug, publicationId);
  }
}

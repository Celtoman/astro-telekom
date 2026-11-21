import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PublicationWorkflowService } from './publication-workflow.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { CreateSitePublicationDto } from './publication-workflow.dto';
import { readAdminWorkingRevision, readWorkingPreviewQuery } from './admin-route-pagination';

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

  @Get('admin/sites/:siteId/preview-options')
  previewOptions(@Param('siteId') siteId: string, @Query('page') page?: string,
    @Query('search') search?: string, @Query('preferred') preferred?: string) {
    return this.publications.getWorkingPreviewOptions(siteId, readWorkingPreviewQuery(page, search, preferred));
  }

  @Get('admin/sites/:siteId/preview-page')
  previewPage(@Param('siteId') siteId: string, @Query('path') path: string, @Query('workingRevision') revision: string,
    @Query('basePublicationId') basePublicationId?: string) {
    if (typeof path !== 'string' || path.length > 600 || !/^\/[a-z0-9._~/-]*$/.test(path) || path.includes('//') || path.includes('..')
      || basePublicationId !== undefined && (typeof basePublicationId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(basePublicationId))) {
      throw new BadRequestException('Некорректный маршрут или снимок предпросмотра');
    }
    return this.publications.getWorkingPreviewPage(siteId, path, readAdminWorkingRevision(revision), basePublicationId ?? null);
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

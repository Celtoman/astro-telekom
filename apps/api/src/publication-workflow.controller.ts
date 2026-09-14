import { Body, Controller, Delete, Get, Param, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PublicationWorkflowService } from './publication-workflow.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { CreateSitePublicationDto, ScheduleSitePublicationDto } from './publication-workflow.dto';

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

  @Post('admin/sites/:siteId/publication-schedules')
  schedule(
    @Param('siteId') siteId: string,
    @Body() body: ScheduleSitePublicationDto,
    @Req() request?: AdminRequest,
  ) {
    return this.publications.prepareScheduledPublication({
      siteId,
      expectedWorkingRevision: body.expectedWorkingRevision,
      scheduledFor: new Date(body.scheduledFor),
      triggerEntity: 'site-schedule',
      triggerEntityId: siteId,
      requestedById: request?.user?.id,
    });
  }

  @Delete('admin/sites/:siteId/publication-schedules/:publicationId')
  cancelSchedule(
    @Param('siteId') siteId: string,
    @Param('publicationId') publicationId: string,
  ) {
    return this.publications.cancelScheduledPublication(siteId, publicationId);
  }

  @Post('internal/site-publications/release-due')
  async releaseDueSchedules() {
    const due = await this.publications.claimDuePublications();
    let enqueued = 0;
    for (const publication of due) {
      try {
        await this.rebuilds.enqueue({
          entity: 'site-publication-schedule',
          id: publication.id,
          siteId: publication.siteId,
          publicationId: publication.id,
        });
        enqueued += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось поставить запланированную публикацию в очередь';
        await this.publications.releaseScheduleClaim(publication.id, message);
        throw new ServiceUnavailableException(message);
      }
    }
    return { processed: due.length, enqueued };
  }

  @Get('admin/sites/:siteId/publication-state')
  state(@Param('siteId') siteId: string) {
    return this.publications.getState(siteId);
  }

  @Get('internal/site-publications/:siteSlug/catalog')
  buildCatalog(@Param('siteSlug') siteSlug: string) {
    return this.publications.getBuildCatalog(siteSlug);
  }
}

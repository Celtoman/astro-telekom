import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PublicationWorkflowService } from './publication-workflow.service';
import { buildVariableCatalogValues, buildVariableCatalogView, withEditorLink } from './variable-catalog';
import { WorkingVariableUsagesService } from './working-variable-usages.service';
import { listVariableDefinitions } from './variable-registry';

const USAGE_PAGE_SIZE = 50;

interface UsageQuery {
  workingRevision?: string;
  publishedPublicationId?: string;
  code?: string;
  workingPage?: string;
  publishedPage?: string;
}

function usagePage(value?: string) {
  if (value === undefined) return 1;
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value)) throw new BadRequestException('Укажите корректную страницу использований');
  return Number(value);
}

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
    const [rowUsages, published] = await Promise.all([
      this.usages.list(siteId, preview.workingRevision),
      this.readPublished((preview.catalog as Record<string, any>).site.slug, cityId),
    ]);
    return buildVariableCatalogView({
      siteId,
      workingRevision: preview.workingRevision,
      publishedRevision: preview.publishedRevision,
      working: { ...preview.catalog, variableUsages: rowUsages },
      published,
      cityId,
      tariffId,
    });
  }

  @Get('values')
  async values(
    @Param('siteId') siteId: string,
    @Query('cityId') cityId?: string,
    @Query('tariffId') tariffId?: string,
  ) {
    const preview = await this.publications.getVariableContext(siteId, cityId);
    const published = await this.readPublished((preview.catalog as Record<string, any>).site.slug, cityId, false);
    const publishedUsageAvailable = published?.publishedUsageAvailable === true;
    return {
      ...buildVariableCatalogValues({
        siteId, workingRevision: preview.workingRevision, publishedRevision: preview.publishedRevision,
        working: preview.catalog, published, cityId, tariffId,
      }),
      publishedPublicationId: published?.publicationId ?? null,
      publishedUsageAvailable,
      publishedTemplateUsageAvailable: publishedUsageAvailable && published?.variableUsageVersion === 2,
    };
  }

  @Get('usages')
  async usage(@Param('siteId') siteId: string, @Query() query: UsageQuery) {
    const { workingRevision, publishedPublicationId, code } = query;
    if (typeof workingRevision !== 'string' || !/^\d{1,10}$/.test(workingRevision) || Number(workingRevision) > 2_147_483_647) {
      throw new BadRequestException('Укажите рабочую ревизию каталога переменных');
    }
    if (typeof publishedPublicationId !== 'string' || !/^[a-zA-Z0-9_-]{0,200}$/.test(publishedPublicationId)) {
      throw new BadRequestException('Укажите идентификатор опубликованного снимка из каталога переменных');
    }
    const definitions = listVariableDefinitions();
    if (code !== undefined && !definitions.some(definition => definition.code === code)) {
      throw new BadRequestException('Неизвестный код переменной');
    }
    const workingPage = usagePage(query.workingPage);
    const publishedPage = usagePage(query.publishedPage);
    const page = code ? { code, offset: (publishedPage - 1) * USAGE_PAGE_SIZE, pageSize: USAGE_PAGE_SIZE } : undefined;
    const [working, published] = await Promise.all([
      this.usages.list(siteId, Number(workingRevision)),
      this.publications.getPublishedVariableUsages(siteId, publishedPublicationId || null, page),
    ]);

    if (code !== undefined) {
      const matches = working.filter(usage => usage.code === code);
      const start = (workingPage - 1) * USAGE_PAGE_SIZE;
      return {
        working: {
          total: matches.length, page: workingPage,
          items: matches.slice(start, start + USAGE_PAGE_SIZE).map(usage => withEditorLink(usage, siteId)),
        },
        published: published ? {
          total: published.total ?? 0, page: publishedPage,
          items: (published.items ?? []).map(usage => withEditorLink(usage, siteId, true)),
        } : null,
        pageSize: USAGE_PAGE_SIZE,
      };
    }
    const workingCounts: Record<string, number> = Object.fromEntries(definitions.map(definition => [definition.code, 0]));
    for (const usage of working) {
      if (Object.hasOwn(workingCounts, usage.code)) workingCounts[usage.code]++;
    }
    return {
      workingCounts,
      publishedCounts: published ? Object.fromEntries(definitions.map(definition => [definition.code, published.counts?.[definition.code] ?? 0])) : null,
    };
  }

  private async readPublished(siteSlug: string, cityId?: string, includeUsages = true) {
    try {
      return await this.publications.getPublishedVariableContext(siteSlug, cityId, includeUsages);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }
}

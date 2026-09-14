import { Controller, Get, Param } from '@nestjs/common';
import { SiteCatalogService } from './site-catalog.service';
import { PublicationWorkflowService } from './publication-workflow.service';

@Controller('public/sites/:siteSlug/cities')
export class CitiesController {
  constructor(
    private readonly catalog: SiteCatalogService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get()
  async list(@Param('siteSlug') siteSlug: string) {
    return this.publications.getPublishedCatalog(siteSlug);
  }

  @Get(':citySlug')
  async getCity(
    @Param('siteSlug') siteSlug: string,
    @Param('citySlug') citySlug: string,
  ) {
    return this.publications.getPublishedCity(siteSlug, citySlug);
  }

  private cityResponse(city: any, site: any) {
    return this.catalog.cityResponse(city, site);
  }

  private pageResponse(page: any, inheritedContent: Record<string, unknown>, inheritedSeo: Record<string, unknown>, cityName?: string) {
    return this.catalog.pageResponse(page, inheritedContent, inheritedSeo, cityName);
  }

  private effectiveRedirects(routes: Array<{ path: string }>, redirects: Array<{ id: string; sourcePath: string; targetPath: string; status: string }>) {
    return this.catalog.effectiveRedirects(routes, redirects);
  }
}

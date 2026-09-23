import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { SiteCatalogService } from './site-catalog.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { configurationSnapshot, quoteFingerprint, quoteTariffConfiguration, type TariffSelection } from './tariff-configuration.service';

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

  @Post(':citySlug/tariffs/:tariffSlug/quote')
  async quoteTariff(
    @Param('siteSlug') siteSlug: string,
    @Param('citySlug') citySlug: string,
    @Param('tariffSlug') tariffSlug: string,
    @Body() selection: TariffSelection,
  ) {
    const city = await this.publications.getPublishedCity(siteSlug, citySlug);
    const tariffs = Array.isArray(city.tariffs) ? city.tariffs as Array<Record<string, unknown>> : [];
    const tariff = tariffs.find((item) => item.slug === tariffSlug);
    if (!tariff) throw new NotFoundException('Published tariff not found');
    try {
      const quote = quoteTariffConfiguration(tariff as unknown as Parameters<typeof quoteTariffConfiguration>[0], selection);
      return { ...quote, fingerprint: quoteFingerprint(configurationSnapshot(quote)) };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Некорректная комплектация');
    }
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

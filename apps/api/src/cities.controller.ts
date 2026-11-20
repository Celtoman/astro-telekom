import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
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
    const catalog = await this.publications.getPublishedCatalog(siteSlug);
    if (!('variableUsages' in catalog || 'variableSources' in catalog || 'variableWarnings' in catalog || 'seoWarnings' in catalog || 'variableUsageVersion' in catalog)) return catalog;
    const { variableUsages: _usages, variableSources: _sources, variableWarnings: _warnings, seoWarnings: _seoWarnings, variableUsageVersion: _usageVersion, ...publicCatalog } = catalog;
    return publicCatalog;
  }

  @Get(':citySlug')
  async getCity(
    @Param('siteSlug') siteSlug: string,
    @Param('citySlug') citySlug: string,
  ) {
    return this.publications.getPublishedCity(siteSlug, citySlug);
  }

  @Post(':citySlug/tariffs/:tariffSlug/quote')
  @HttpCode(200)
  async quoteTariff(
    @Param('siteSlug') siteSlug: string,
    @Param('citySlug') citySlug: string,
    @Param('tariffSlug') tariffSlug: string,
    @Body() selection: TariffSelection,
  ) {
    const tariff = await this.publications.getPublishedTariff(siteSlug, citySlug, tariffSlug);
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

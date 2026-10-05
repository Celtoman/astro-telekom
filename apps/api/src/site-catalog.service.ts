import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { validateCityHomeBlocks, validatePublishedBlocks } from './block-validation';
import { resolveCatalogVariables } from './catalog-variables';
import { mergeContent, publicContent } from './content-resolution';
import { PrismaService } from './prisma.service';
import { buildReleaseOneRoutes } from './public-route-policy';
import { normalizeRedirectPath } from './redirect-path';
import { materializeCityHomeSource } from './page-template';
import { formatSitePhone } from './site-phone';
import { resolveSeoTemplates } from './seo-templates';
import { collectSeoTemplateUsages } from './seo-template-usages';
import { firstScreenFromTemplate, validateFirstScreen } from './first-screen';

type CatalogClient = Prisma.TransactionClient | PrismaService;
export type CatalogSource = {
  site: any;
  cities: any[];
  globalPages: any[];
  redirects: Array<{ id: string; sourcePath: string; targetPath: string; status: string }>;
  sitemapExclusions: Array<{ path: string }>;
  seoTemplates: any[];
  pageTemplates?: any[];
};

@Injectable()
export class SiteCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(siteSlug: string, client: CatalogClient = this.prisma) {
    return this.build({ slug: siteSlug, status: 'PUBLISHED' }, client);
  }

  listBySiteId(siteId: string, client: CatalogClient = this.prisma) {
    return this.build({ id: siteId, status: 'PUBLISHED' }, client);
  }

  captureSourceBySiteId(siteId: string, client: CatalogClient = this.prisma) {
    return this.loadSource({ id: siteId, status: 'PUBLISHED' }, client);
  }

  private async build(siteWhere: Prisma.SiteWhereInput, client: CatalogClient) {
    return this.renderSource(await this.loadSource(siteWhere, client));
  }

  private async loadSource(siteWhere: Prisma.SiteWhereInput, client: CatalogClient): Promise<CatalogSource> {
    const site = await client.site.findFirst({
      where: siteWhere,
      include: { provider: { select: { name: true, settings: true } } },
    });
    if (!site) throw new NotFoundException('Site not found');

    const [cities, globalPages, redirects, sitemapExclusions, seoTemplates, pageTemplates] = await Promise.all([
      client.city.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { name: 'asc' },
        include: {
          region: { select: { name: true, slug: true } },
          pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
          tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
        },
      }),
      client.page.findMany({
        where: { siteId: site.id, cityId: null, status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      }),
      client.redirect.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { sourcePath: 'asc' },
        select: { id: true, sourcePath: true, targetPath: true, status: true },
      }),
      client.sitemapExclusion.findMany({
        where: { siteId: site.id },
        orderBy: { path: 'asc' },
        select: { path: true },
      }),
      client.seoTemplate.findMany({
        where: { siteId: site.id },
        orderBy: { kind: 'asc' },
      }),
      client.pageTemplate.findMany({
        where: { siteId: site.id },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      }),
    ]);

    return { site, cities, globalPages, redirects, sitemapExclusions, seoTemplates, pageTemplates };
  }

  renderSource(source: CatalogSource, now = new Date()) {
    const { site, cities, globalPages, redirects, sitemapExclusions, seoTemplates } = materializeCityHomeSource(source);
    const homeTemplate = source.pageTemplates?.find(template => template.kind === 'HOME');
    const homeHero = homeTemplate ? firstScreenFromTemplate(homeTemplate).data : undefined;
    if (homeTemplate) validateFirstScreen('HOME', homeHero);
    const resolvedGlobalPages = globalPages.map((page: any) => this.pageResponse(page, mergeContent(publicContent(site.provider.settings), publicContent(site.settings)), {}));
    const routes = buildReleaseOneRoutes(cities, resolvedGlobalPages);
    const resolved = resolveCatalogVariables({
      ...(homeHero ? { homeHero, homeHeroBlockId: homeTemplate.blocks.find((block: any) => block.blockType === 'home.hero').id } : {}),
      site: {
        name: site.name,
        slug: site.slug,
        domain: site.domain,
        connectionPhone: site.connectionPhone ? formatSitePhone(site.connectionPhone) : null,
        supportPhone: site.supportPhone ? formatSitePhone(site.supportPhone) : null,
      },
      globalPages: resolvedGlobalPages,
      routes,
      sitemap: { excludedPaths: sitemapExclusions.map((item) => item.path) },
      redirects: this.effectiveRedirects(routes, redirects),
      cities: cities.map((city: any) => this.cityResponse(city, site)),
    }, {
      site: { connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
      provider: { name: site.provider.name },
      now,
    });
    const seo = resolveSeoTemplates({
      routes,
      templates: seoTemplates,
      cities: resolved.cities,
      site: { connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
      provider: { name: site.provider.name },
      now,
    });
    const noindexPaths = Object.entries(seo.byPath).filter(([, meta]) => meta.indexState === 'NOINDEX').map(([path]) => path);
    return {
      ...resolved,
      variableUsages: [...resolved.variableUsages, ...collectSeoTemplateUsages(seoTemplates)],
      variableUsageVersion: 2,
      sitemap: { excludedPaths: [...new Set([...resolved.sitemap.excludedPaths, ...noindexPaths])].sort() },
      seoByPath: seo.byPath,
      seoWarnings: seo.warnings,
    };
  }

  async getCity(siteSlug: string, citySlug: string, client: CatalogClient = this.prisma) {
    const city = await client.city.findFirst({
      where: { site: { slug: siteSlug, status: 'PUBLISHED' }, slug: citySlug, status: 'PUBLISHED' },
      include: {
        site: { select: { settings: true, provider: { select: { settings: true } }, pageTemplates: { include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } } } },
        region: { select: { name: true, slug: true } },
        pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
        tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!city) throw new NotFoundException('City not found');
    const { pageTemplates, ...site } = city.site;
    const materialized = materializeCityHomeSource({
      site, cities: [city], globalPages: [], redirects: [], sitemapExclusions: [], seoTemplates: [], pageTemplates,
    });
    return this.cityResponse(materialized.cities[0], site);
  }

  cityResponse(city: any, site: any) {
    const inheritedContent = mergeContent(publicContent(site.provider.settings), publicContent(site.settings));
    const inheritedSeo: Record<string, unknown> = {};
    const { site: _site, region, pages, tariffs, ...cityData } = city;
    const homePages = pages.filter((page: any) => page.type === 'HOME');
    if (homePages.length !== 1) {
      throw new BadRequestException(`У опубликованного города «${city.name}» должна быть ровно одна страница HOME`);
    }
    if (homePages[0].slug !== '') {
      throw new BadRequestException(`Городская HOME «${city.name}» должна иметь пустой slug`);
    }
    return {
      ...cityData,
      content: inheritedContent,
      seo: inheritedSeo,
      region: { name: region.name, slug: region.slug },
      pages: pages.map((page: any) => this.pageResponse(page, inheritedContent, inheritedSeo, city.name)),
      tariffs: tariffs.map((tariff: any) => ({
        ...tariff,
        seo: inheritedSeo,
      })),
    };
  }

  pageResponse(page: any, inheritedContent: Record<string, unknown>, inheritedSeo: Record<string, unknown>, cityName?: string) {
    if (page.type === 'HOME' && cityName) validateCityHomeBlocks(page.blocks, cityName);
    else validatePublishedBlocks(page.blocks);
    const { templateId: _templateId, ...publicPage } = page;
    return {
      ...publicPage,
      content: mergeContent(inheritedContent, page.content),
      seo: inheritedSeo,
    };
  }

  effectiveRedirects(routes: Array<{ path: string }>, redirects: Array<{ id: string; sourcePath: string; targetPath: string; status: string }>) {
    const publishedPaths = new Set(routes.map((route) => route.path));
    return redirects.flatMap((redirect) => {
      try {
        const sourcePath = normalizeRedirectPath(redirect.sourcePath, 'sourcePath');
        const targetPath = normalizeRedirectPath(redirect.targetPath, 'targetPath');
        if (publishedPaths.has(sourcePath) || !publishedPaths.has(targetPath)) return [];
        return [{ ...redirect, sourcePath, targetPath }];
      } catch {
        return [];
      }
    });
  }
}

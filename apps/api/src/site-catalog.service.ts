import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { validateCityHomeBlocks, validatePublishedBlocks } from './block-validation';
import { resolveCatalogVariables } from './catalog-variables';
import { mergeContent, publicContent } from './content-resolution';
import { PrismaService } from './prisma.service';
import { buildReleaseOneRoutes } from './public-route-policy';
import { normalizeRedirectPath } from './redirect-path';
import { formatSitePhone } from './site-phone';
import { resolveSeoTemplates } from './seo-templates';
import { collectSeoTemplateUsages } from './seo-template-usages';

type CatalogClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SiteCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(siteSlug: string, client: CatalogClient = this.prisma) {
    return this.build({ slug: siteSlug, status: 'PUBLISHED' }, client);
  }

  listBySiteId(siteId: string, client: CatalogClient = this.prisma) {
    return this.build({ id: siteId, status: 'PUBLISHED' }, client);
  }

  private async build(siteWhere: Prisma.SiteWhereInput, client: CatalogClient) {
    const site = await client.site.findFirst({
      where: siteWhere,
      include: { provider: { select: { name: true, settings: true } } },
    });
    if (!site) throw new NotFoundException('Site not found');

    const [cities, globalPages, redirects, sitemapExclusions, seoTemplates] = await Promise.all([
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
    ]);

    const resolvedGlobalPages = globalPages.map((page: any) => this.pageResponse(page, mergeContent(publicContent(site.provider.settings), publicContent(site.settings)), {}));
    const routes = buildReleaseOneRoutes(cities, resolvedGlobalPages);
    const now = new Date();
    const resolved = resolveCatalogVariables({
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
        site: { select: { settings: true, provider: { select: { settings: true } } } },
        region: { select: { name: true, slug: true } },
        pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
        tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!city) throw new NotFoundException('City not found');
    return this.cityResponse(city, city.site);
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
        seo: mergeContent(inheritedSeo, tariff.seo),
      })),
    };
  }

  pageResponse(page: any, inheritedContent: Record<string, unknown>, inheritedSeo: Record<string, unknown>, cityName?: string) {
    if (page.type === 'HOME' && cityName) validateCityHomeBlocks(page.blocks, cityName);
    else validatePublishedBlocks(page.blocks);
    return {
      ...page,
      content: mergeContent(inheritedContent, page.content),
      seo: mergeContent(inheritedSeo, page.seo),
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

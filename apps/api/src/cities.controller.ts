import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { mergeContent, publicContent } from './content-resolution';
import { normalizeRedirectPath } from './redirect.service';
import { validateCityHomeBlocks, validatePublishedBlocks } from './block-validation';
import { buildReleaseOneRoutes } from './public-route-policy';

@Controller('public/sites/:siteSlug/cities')
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('siteSlug') siteSlug: string) {
    const site = await this.prisma.site.findFirst({
      where: { slug: siteSlug, status: 'PUBLISHED' },
      include: { provider: { select: { settings: true } } },
    });
    if (!site) throw new NotFoundException('Site not found');

    const [cities, globalPages, redirects] = await Promise.all([
      this.prisma.city.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { name: 'asc' },
        include: {
          region: { select: { name: true, slug: true, content: true } },
          pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
          tariffs: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.page.findMany({
        where: { siteId: site.id, cityId: null, status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        include: { blocks: { where: { visible: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      }),
      this.prisma.redirect.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { sourcePath: 'asc' },
        select: { id: true, sourcePath: true, targetPath: true, status: true },
      }),
    ]);

    const resolvedGlobalPages = globalPages.map((page: any) => this.pageResponse(page, mergeContent(publicContent(site.provider.settings), publicContent(site.settings)), {}));
    const routes = buildReleaseOneRoutes(cities, resolvedGlobalPages);
    return {
      site: { name: site.name, slug: site.slug, domain: site.domain },
      globalPages: resolvedGlobalPages,
      routes,
      redirects: this.effectiveRedirects(routes, redirects),
      cities: cities.map((city: any) => this.cityResponse(city, site)),
    };
  }

  @Get(':citySlug')
  async getCity(
    @Param('siteSlug') siteSlug: string,
    @Param('citySlug') citySlug: string,
  ) {
    const city = await this.prisma.city.findFirst({
      where: { site: { slug: siteSlug, status: 'PUBLISHED' }, slug: citySlug, status: 'PUBLISHED' },
      include: {
        site: { select: { settings: true, provider: { select: { settings: true } } } },
        region: { select: { name: true, slug: true, content: true } },
        pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
        tariffs: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!city) {
      throw new NotFoundException('City not found');
    }

    return this.cityResponse(city, city.site);
  }

  private cityResponse(city: any, site: any) {
    const inheritedContent = mergeContent(publicContent(site.provider.settings), publicContent(site.settings), city.region.content, city.content);
    const inheritedSeo = mergeContent(city.seo);
    const { site: _site, region, pages, tariffs, ...cityData } = city;
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

  private pageResponse(page: any, inheritedContent: Record<string, unknown>, inheritedSeo: Record<string, unknown>, cityName?: string) {
    if (page.type === 'HOME' && cityName) validateCityHomeBlocks(page.blocks, cityName);
    else validatePublishedBlocks(page.blocks);
    return {
      ...page,
      content: mergeContent(inheritedContent, page.content),
      seo: mergeContent(inheritedSeo, page.seo),
    };
  }

  private effectiveRedirects(routes: Array<{ path: string }>, redirects: Array<{ id: string; sourcePath: string; targetPath: string; status: string }>) {
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

import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { mergeContent, publicContent } from './content-resolution';

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

    const [cities, redirects] = await Promise.all([
      this.prisma.city.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { name: 'asc' },
        include: {
          region: { select: { content: true } },
          pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true }, orderBy: { position: 'asc' } } } },
          tariffs: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.redirect.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { sourcePath: 'asc' },
        select: { id: true, sourcePath: true, targetPath: true, status: true },
      }),
    ]);

    return {
      site: { name: site.name, slug: site.slug, domain: site.domain },
      redirects,
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
        region: { select: { content: true } },
        pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true }, orderBy: { position: 'asc' } } } },
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
    const { site: _site, region: _region, pages, tariffs, ...cityData } = city;
    return {
      ...cityData,
      content: inheritedContent,
      seo: inheritedSeo,
      pages: pages.map((page: any) => ({
        ...page,
        content: mergeContent(inheritedContent, page.content),
        seo: mergeContent(inheritedSeo, page.seo),
      })),
      tariffs: tariffs.map((tariff: any) => ({
        ...tariff,
        seo: mergeContent(inheritedSeo, tariff.seo),
      })),
    };
  }
}

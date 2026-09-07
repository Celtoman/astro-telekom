import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { mergeContent, publicContent } from './content-resolution';

@Controller('public/sites/:siteSlug/cities')
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

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

    const inheritedContent = mergeContent(publicContent(city.site.provider.settings), publicContent(city.site.settings), city.region.content, city.content);
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

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { DadataService } from './dadata.service';
import { PrismaService } from './prisma.service';
import { AddressSuggestionsDto } from './public.dto';

@Controller('address-suggestions')
export class AddressSuggestionsController {
  constructor(private readonly dadata: DadataService, private readonly prisma: PrismaService) {}

  @Post()
  async suggest(@Body() body: AddressSuggestionsDto) {
    if (body.website) throw new BadRequestException('Некорректный запрос');
    const site = await this.prisma.site.findUnique({ where: { slug: body.siteSlug || 'domru-kazan' } });
    if (!site || site.status !== 'PUBLISHED') throw new BadRequestException('Сайт недоступен');
    const city = await this.prisma.city.findFirst({ where: { siteId: site.id, slug: body.citySlug ?? 'kazan', status: 'PUBLISHED' } });
    if (!city) throw new BadRequestException('Город недоступен');
    const suggestions = await this.dadata.suggest(body.query.trim(), city.name);
    return { suggestions };
  }
}

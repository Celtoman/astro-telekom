import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { CoverageService } from './coverage.service';
import { PrismaService } from './prisma.service';
import { AddressCheckDto } from './public.dto';
import { DadataService } from './dadata.service';
import { readDadataSuggestion } from './coverage.service';

@Controller('address-checks')
export class AddressChecksController {
  constructor(
    private readonly coverage: CoverageService,
    private readonly prisma: PrismaService,
    private readonly dadata: DadataService,
  ) {}

  @Post()
  async check(@Body() body: AddressCheckDto) {
    if (body.website) throw new BadRequestException('Некорректный запрос');
    if (typeof body.address !== 'string' || !body.address.trim()) {
      throw new BadRequestException('Адрес обязателен');
    }

    const site = await this.prisma.site.findUnique({ where: { slug: body.siteSlug || 'domru-site' } });
    if (!site || site.status !== 'PUBLISHED') throw new BadRequestException('Сайт недоступен');
    const city = await this.prisma.city.findFirst({
      where: { siteId: site.id, slug: body.citySlug ?? 'kazan', status: 'PUBLISHED' },
    });
    if (!city) throw new BadRequestException('Город недоступен');
    const page = body.pageSlug ? await this.prisma.page.findFirst({ where: { cityId: city.id, slug: body.pageSlug, status: 'PUBLISHED' } }) : null;
    if (body.pageSlug && !page) throw new BadRequestException('Страница недоступна');
    const selectedSuggestion = readDadataSuggestion(body.suggestion);
    const normalizedSuggestion = selectedSuggestion ? await this.dadata.clean(selectedSuggestion) : null;
    const cleanedResult = normalizedSuggestion && typeof normalizedSuggestion.data.result === 'string'
      ? normalizedSuggestion.data.result.trim()
      : '';
    const normalizedAddress = cleanedResult || normalizedSuggestion?.value || body.address.trim();
    const result = await this.coverage.check({
      address: normalizedAddress,
      suggestion: normalizedSuggestion,
      citySlug: body.citySlug ?? 'kazan',
      objectType: body.objectType ?? 'apartment',
    });
    const check = await this.prisma.addressCheck.create({
      data: {
        siteId: site.id,
        cityId: city.id,
        pageId: page?.id,
        address: normalizedAddress,
        objectType: body.objectType ?? 'apartment',
        status: result.status,
        response: result.providerResponse as object | undefined,
      },
    });
    const { providerResponse: _providerResponse, ...publicResult } = result;
    return { ...publicResult, id: check?.id, address: normalizedAddress, citySlug: body.citySlug ?? 'kazan' };
  }
}

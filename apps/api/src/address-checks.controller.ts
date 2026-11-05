import { BadRequestException, Body, Controller, Post, UnprocessableEntityException } from '@nestjs/common';
import { CoverageService } from './coverage.service';
import { PrismaService } from './prisma.service';
import { AddressCheckDto } from './public.dto';
import { DadataService } from './dadata.service';
import { readDadataSuggestion } from './coverage.service';
import { mapAddressCheckPublicResult } from './address-check-result';
import { servingEntities } from './serving-publication-context';
import { accountAddressCity, accountPublicSource } from './account-public-source';

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

    const global = body.pageScope === 'GLOBAL' ? await accountPublicSource(this.prisma, body.siteSlug || 'domru-site', body.pageSlug) : null;
    const serving = global ? null : await servingEntities(this.prisma, body.siteSlug || 'domru-site', body.citySlug ?? 'kazan', body.pageSlug);
    const workingSite = serving || global ? null : await this.prisma.site.findUnique({ where: { slug: body.siteSlug || 'domru-site' } });
    if (!serving && !global && workingSite?.status !== 'PUBLISHED') throw new BadRequestException('Сайт недоступен');
    const site = global?.site ?? serving?.site ?? workingSite;
    if (!site) throw new BadRequestException('Сайт недоступен');
    let city: { id: string; slug: string } | null = global ? null : serving?.city ?? await this.prisma.city.findFirst({
      where: { siteId: site.id, slug: body.citySlug ?? 'kazan', status: 'PUBLISHED' },
    });
    if (!global && !city) throw new BadRequestException('Город недоступен');
    const page = global?.page ?? (serving ? serving.page : body.pageSlug && city ? await this.prisma.page.findFirst({ where: { cityId: city.id, slug: body.pageSlug, status: 'PUBLISHED' } }) : null);
    if (body.pageSlug && !page) throw new BadRequestException('Страница недоступна');
    const selectedSuggestion = readDadataSuggestion(body.suggestion);
    const normalizedSuggestion = selectedSuggestion ? await this.dadata.clean(selectedSuggestion) : null;
    const normalizedHouse = normalizedSuggestion && typeof normalizedSuggestion.data.house === 'string'
      ? normalizedSuggestion.data.house.trim()
      : '';
    if (normalizedSuggestion && !normalizedHouse) {
      throw new UnprocessableEntityException('Выберите адрес с номером дома');
    }
    const cleanedResult = normalizedSuggestion && typeof normalizedSuggestion.data.result === 'string'
      ? normalizedSuggestion.data.result.trim()
      : '';
    const normalizedAddress = cleanedResult || normalizedSuggestion?.value || body.address.trim();
    if (global) {
      if (!normalizedSuggestion) throw new BadRequestException('Выберите структурированный адрес с домом');
      city = accountAddressCity(global.cities, normalizedSuggestion.data);
    }
    if (!city) throw new BadRequestException('Город недоступен');
    const result = await this.coverage.check({
      address: normalizedAddress,
      suggestion: normalizedSuggestion,
      citySlug: city.slug,
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
    return mapAddressCheckPublicResult(result, {
      checkId: check.id,
      address: normalizedAddress,
      citySlug: city.slug,
    });
  }
}

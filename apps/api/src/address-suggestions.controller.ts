import { BadRequestException, Body, Controller, Post, Req, Res } from '@nestjs/common';
import { DadataLocationBoost, DadataService } from './dadata.service';
import { PrismaService } from './prisma.service';
import { AddressSuggestionsDto } from './public.dto';
import { servingEntities } from './serving-publication-context';
import { accountPublicSource } from './account-public-source';

const ADDRESS_CITY_KLADR_COOKIE = 'address_city_kladr';
const ADDRESS_CITY_KLADR_NONE = 'none';

interface AddressSuggestionRequest {
  ip?: string;
  protocol?: string;
  cookies?: Record<string, string | undefined>;
}

interface AddressSuggestionReply {
  setCookie(name: string, value: string, options: Record<string, unknown>): void;
}

@Controller('address-suggestions')
export class AddressSuggestionsController {
  constructor(private readonly dadata: DadataService, private readonly prisma: PrismaService) {}

  @Post()
  async suggest(
    @Body() body: AddressSuggestionsDto,
    @Req() request: AddressSuggestionRequest,
    @Res({ passthrough: true }) response: AddressSuggestionReply,
  ) {
    if (body.website) throw new BadRequestException('Некорректный запрос');
    const global = body.pageScope === 'GLOBAL' ? await accountPublicSource(this.prisma, body.siteSlug || 'domru-site', body.pageSlug) : null;
    const serving = global ? null : await servingEntities(this.prisma, body.siteSlug || 'domru-site', body.citySlug ?? 'kazan');
    const workingSite = serving || global ? null : await this.prisma.site.findUnique({ where: { slug: body.siteSlug || 'domru-site' } });
    if (!serving && !global && workingSite?.status !== 'PUBLISHED') throw new BadRequestException('Сайт недоступен');
    const site = global?.site ?? serving?.site ?? workingSite;
    if (!site) throw new BadRequestException('Сайт недоступен');
    const city = global ? null : serving?.city ?? await this.prisma.city.findFirst({
      where: { siteId: site.id, slug: body.citySlug ?? 'kazan', status: 'PUBLISHED' },
      include: { region: { select: { name: true } } },
    });
    if (!city && !global) throw new BadRequestException('Город недоступен');
    const pageBoost: DadataLocationBoost | undefined = city ? { city: city.name, region: city.region.name } : undefined;
    const cookieValue = request.cookies?.[ADDRESS_CITY_KLADR_COOKIE];
    let boost: DadataLocationBoost | undefined = pageBoost;
    if (cookieValue && /^\d{13}$/.test(cookieValue)) {
      boost = { kladrId: cookieValue };
    } else if (cookieValue !== ADDRESS_CITY_KLADR_NONE) {
      const location = await this.dadata.locate(request.ip);
      response.setCookie(ADDRESS_CITY_KLADR_COOKIE, location?.kladrId ?? ADDRESS_CITY_KLADR_NONE, {
        httpOnly: true,
        maxAge: 86_400,
        path: '/',
        sameSite: 'lax',
        secure: request.protocol === 'https' || process.env.NODE_ENV === 'production',
      });
      if (location) boost = { kladrId: location.kladrId };
    }
    const suggestions = await this.dadata.suggest(body.query.trim(), boost);
    return { suggestions };
  }
}

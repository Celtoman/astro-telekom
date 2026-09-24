import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { APP_VERSION } from './app-version';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { quoteTariffConfiguration, type TariffSelection } from './tariff-configuration.service';
import { resolveVariableText } from './variable-registry';

type TariffVersion = 'working' | 'published';
type CatalogCity = { slug?: unknown; name?: unknown; nameIn?: unknown; tariffs?: unknown };
type CatalogTariff = Record<string, unknown>;

const records = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  : [];

function requiredSlug(value: string | undefined, label: string): string {
  if (!value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new BadRequestException(`Некорректный ${label}`);
  return value;
}

function publishedCity(catalog: Record<string, unknown> | null, citySlug: string): CatalogCity | null {
  return (records(catalog?.cities) as CatalogCity[]).find((city) => city.slug === citySlug) ?? null;
}

function publishedTariff(city: CatalogCity | null, tariffSlug: string): CatalogTariff | null {
  return records(city?.tariffs).find((tariff) => tariff.slug === tariffSlug) ?? null;
}

@Controller('admin/sites/:siteId/tariff-template')
@UseGuards(AdminTokenGuard)
export class AdminTariffTemplateController {
  constructor(private readonly prisma: PrismaService) {}

  private async context(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, slug: true, domain: true, connectionPhone: true, supportPhone: true, workingRevision: true, publishedRevision: true, provider: { select: { name: true } } },
    });
    if (!site) throw new NotFoundException('Site not found');
    const publication = await this.prisma.sitePublication.findFirst({
      where: { siteId, status: 'SUCCEEDED' },
      orderBy: { siteRevision: 'desc' },
      select: { siteRevision: true, catalog: true, publishedAt: true, providerDeploymentId: true },
    });
    return { site, publication, catalog: publication?.catalog as Record<string, unknown> | null ?? null };
  }

  @Get('cities')
  async cities(@Param('siteId') siteId: string) {
    const { site, catalog } = await this.context(siteId);
    const working = await this.prisma.city.findMany({
      where: { siteId }, select: { slug: true, name: true, status: true }, orderBy: { name: 'asc' },
    });
    const bySlug = new Map<string, { slug: string; name: string; working: boolean; published: boolean }>();
    for (const city of records(catalog?.cities)) {
      if (typeof city.slug === 'string') bySlug.set(city.slug, {
        slug: city.slug, name: String(city.name || city.slug), working: false, published: true,
      });
    }
    for (const city of working) {
      const previous = bySlug.get(city.slug);
      bySlug.set(city.slug, { slug: city.slug, name: city.name, working: true, published: previous?.published ?? false });
    }
    return { siteId: site.id, cities: [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')) };
  }

  @Get('tariffs')
  async tariffs(@Param('siteId') siteId: string, @Query('citySlug') rawCitySlug?: string, @Query('q') rawQuery?: string) {
    const citySlug = requiredSlug(rawCitySlug, 'slug города');
    const query = String(rawQuery ?? '').trim().toLocaleLowerCase('ru');
    if (query.length > 100) throw new BadRequestException('Поисковый запрос слишком длинный');
    const { catalog } = await this.context(siteId);
    const city = await this.prisma.city.findFirst({ where: { siteId, slug: citySlug }, select: { id: true } });
    const published = publishedCity(catalog, citySlug);
    if (!city && !published) throw new NotFoundException('Город не найден');
    const working = city ? await this.prisma.tariff.findMany({
      where: { cityId: city.id },
      select: { id: true, slug: true, name: true, externalId: true, status: true, availability: true },
      orderBy: { name: 'asc' },
    }) : [];
    const bySlug = new Map<string, { slug: string; name: string; externalId: string | null; working: boolean; published: boolean; workingStatus: string | null }>();
    for (const tariff of records(published?.tariffs)) {
      if (typeof tariff.slug === 'string') bySlug.set(tariff.slug, {
        slug: tariff.slug, name: String(tariff.name || tariff.slug), externalId: typeof tariff.externalId === 'string' ? tariff.externalId : null,
        working: false, published: true, workingStatus: null,
      });
    }
    for (const tariff of working) {
      const previous = bySlug.get(tariff.slug);
      bySlug.set(tariff.slug, {
        slug: tariff.slug, name: tariff.name, externalId: tariff.externalId ?? previous?.externalId ?? null,
        working: true, published: previous?.published ?? false, workingStatus: `${tariff.status} · ${tariff.availability}`,
      });
    }
    const all = [...bySlug.values()].filter((tariff) => !query || [tariff.name, tariff.slug, tariff.externalId ?? '']
      .some((value) => value.toLocaleLowerCase('ru').includes(query))).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return { citySlug, total: all.length, tariffs: all.slice(0, 100) };
  }

  @Get('preview')
  async preview(@Param('siteId') siteId: string, @Query('citySlug') rawCitySlug?: string, @Query('tariffSlug') rawTariffSlug?: string) {
    const citySlug = requiredSlug(rawCitySlug, 'slug города');
    const tariffSlug = requiredSlug(rawTariffSlug, 'slug тарифа');
    const { site, publication, catalog } = await this.context(siteId);
    const city = await this.prisma.city.findFirst({
      where: { siteId, slug: citySlug },
      select: { id: true, name: true, nameIn: true, nameGenitive: true, namePrepositional: true, slug: true, tariffs: { orderBy: { name: 'asc' } } },
    });
    const published = publishedCity(catalog, citySlug);
    const workingTariff = city?.tariffs.find((item) => item.slug === tariffSlug) ?? null;
    const publishedTariffRow = publishedTariff(published, tariffSlug);
    if (!workingTariff && !publishedTariffRow) throw new NotFoundException('Тариф не найден');
    const workingSnapshot = workingTariff ? JSON.parse(JSON.stringify(workingTariff)) as CatalogTariff : null;
    if (workingSnapshot && typeof workingSnapshot.promoText === 'string') {
      workingSnapshot.promoText = resolveVariableText(workingSnapshot.promoText, {
        site: { connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
        provider: { name: site.provider?.name },
        city: city ? { name: city.name, nameGenitive: city.nameGenitive, namePrepositional: city.namePrepositional } : undefined,
        tariff: workingSnapshot, now: new Date(),
      }, { path: 'Tariff.promoText', field: 'TEXT' }).text;
    }
    return {
      siteId: site.id, siteSlug: site.slug, siteDomain: site.domain,
      workingRevision: site.workingRevision, publishedRevision: site.publishedRevision,
      publishedAt: publication?.publishedAt ?? null,
      city: { slug: citySlug, name: city?.name ?? published?.name ?? citySlug, nameIn: city?.nameIn ?? published?.nameIn ?? city?.name ?? published?.name ?? citySlug },
      tariff: { working: workingSnapshot, published: publishedTariffRow },
      related: {
        working: city?.tariffs.filter((item) => item.slug !== tariffSlug && item.status === 'PUBLISHED' && item.availability === 'ACTIVE').slice(0, 3) ?? [],
        published: records(published?.tariffs).filter((item) => item.slug !== tariffSlug).slice(0, 3),
      },
    };
  }

  @Post('quote')
  async quote(@Param('siteId') siteId: string, @Body() body: { citySlug?: string; tariffSlug?: string; version?: TariffVersion; selection?: TariffSelection }) {
    if (!body || !['working', 'published'].includes(String(body.version))) throw new BadRequestException('Некорректная версия тарифа');
    const citySlug = requiredSlug(body.citySlug, 'slug города');
    const tariffSlug = requiredSlug(body.tariffSlug, 'slug тарифа');
    const { catalog } = await this.context(siteId);
    let tariff: Record<string, unknown> | null = null;
    if (body.version === 'published') tariff = publishedTariff(publishedCity(catalog, citySlug), tariffSlug);
    else {
      const row = await this.prisma.tariff.findFirst({ where: { slug: tariffSlug, city: { siteId, slug: citySlug } } });
      tariff = row ? JSON.parse(JSON.stringify(row)) as Record<string, unknown> : null;
    }
    if (!tariff) throw new NotFoundException('Тариф этой версии не найден');
    try { return quoteTariffConfiguration(tariff as unknown as Parameters<typeof quoteTariffConfiguration>[0], body.selection ?? {}); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Некорректная комплектация'); }
  }

  @Get('code-status')
  async codeStatus(@Param('siteId') siteId: string) {
    await this.context(siteId);
    const base = process.env.COOLIFY_API_URL?.replace(/\/+$/, '');
    const token = process.env.COOLIFY_API_TOKEN;
    const uuid = process.env.COOLIFY_RESOURCE_UUID;
    if (!base || !token || !uuid) return { appVersion: APP_VERSION, available: false, reason: 'Coolify API не настроен для этого окружения' };
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      const [deploymentsResponse, applicationResponse] = await Promise.all([
        fetch(`${base}/deployments/applications/${encodeURIComponent(uuid)}?take=10`, { headers, signal: AbortSignal.timeout(5000) }),
        fetch(`${base}/applications/${encodeURIComponent(uuid)}`, { headers, signal: AbortSignal.timeout(5000) }),
      ]);
      if (!deploymentsResponse.ok || !applicationResponse.ok) throw new Error('Coolify API не вернул состояние deployment');
      const deployments = await deploymentsResponse.json() as { deployments?: Array<{ deployment_uuid?: string; status?: string; commit?: string; created_at?: string; updated_at?: string }> };
      const application = await applicationResponse.json() as { status?: string };
      const latest = deployments.deployments?.[0] ?? null;
      const successful = deployments.deployments?.find((item) => item.status === 'finished') ?? null;
      return {
        appVersion: APP_VERSION, available: true, applicationStatus: application.status ?? null,
        latestDeployment: latest ? { id: latest.deployment_uuid, status: latest.status, startedAt: latest.created_at } : null,
        lastSuccessful: successful ? { id: successful.deployment_uuid, commit: successful.commit, finishedAt: successful.updated_at } : null,
      };
    } catch {
      return { appVersion: APP_VERSION, available: false, reason: 'Состояние Coolify временно недоступно' };
    }
  }
}

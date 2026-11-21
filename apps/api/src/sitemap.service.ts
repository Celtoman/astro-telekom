import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_ROUTE_PAGE_SIZE } from './admin-route-pagination';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { SiteCatalogService } from './site-catalog.service';
import {
  buildSitemapIndexXml,
  buildSitemapXml,
  normalizeSitemapOrigin,
  SITEMAP_FILES,
  sitemapGroupForRoute,
  type SitemapExclusionInput,
  type SitemapGroup,
  validateSitemapExclusions,
} from './sitemap-policy';

type PublicRoute = { id?: string; kind: string; path: string; citySlug?: string; tariffSlug?: string; pageType?: string };
type SitemapEntry = {
  path: string;
  group: SitemapGroup;
  sourceType: string;
  sourceLabel: string;
  publishStatus: string;
  eligible: boolean;
  included: boolean;
  reason: string | null;
};

@Injectable()
export class SitemapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: SiteCatalogService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  async getSettings(siteId: string, client: Prisma.TransactionClient = this.prisma) {
    const [site, latestPublication] = await Promise.all([
      client.site.findUnique({ where: { id: siteId }, select: { id: true, name: true, slug: true, domain: true, status: true, workingRevision: true, publishedRevision: true } }),
      client.sitePublication.findFirst({ where: { siteId }, orderBy: { createdAt: 'desc' }, select: { id: true, siteRevision: true, status: true, updatedAt: true, publishedAt: true, lastError: true } }),
    ]);
    if (!site) throw new NotFoundException('Site not found');
    return {
      site,
      origin: normalizeSitemapOrigin(process.env.PUBLIC_SITE_URL || site.domain || ''),
      workingRevision: site.workingRevision,
      publishedRevision: site.publishedRevision,
      hasUnpublishedChanges: site.workingRevision > site.publishedRevision,
      lastGeneration: latestPublication ? {
        id: latestPublication.id,
        siteRevision: latestPublication.siteRevision,
        status: latestPublication.status,
        generatedAt: latestPublication.publishedAt || latestPublication.updatedAt,
        lastError: latestPublication.lastError,
      } : null,
      files: SITEMAP_FILES,
    };
  }

  private async readInventory(siteId: string, client: Prisma.TransactionClient, expectedWorkingRevision?: number) {
    const settings = await this.getSettings(siteId, client);
    if (expectedWorkingRevision !== undefined && settings.workingRevision !== expectedWorkingRevision) {
      throw new ConflictException('Рабочая ревизия изменилась. Обновите данные и повторите действие.');
    }
    const [pages, cities, exclusions] = await Promise.all([
      client.page.findMany({ where: { siteId, cityId: null }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, type: true, slug: true, status: true } }),
      client.city.findMany({ where: { siteId }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true, tariffs: { orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true, availability: true } } } }),
      client.sitemapExclusion.findMany({ where: { siteId }, orderBy: { path: 'asc' }, select: { id: true, path: true, reason: true, createdById: true, createdAt: true, updatedAt: true } }),
    ]);

    const validation = { errors: [] as string[], warnings: [] as string[] };
    let routes: PublicRoute[] = [];
    let noindexPaths = new Set<string>();
    try {
      const useSealedBase = expectedWorkingRevision !== undefined && process.env.REBUILD_PROVIDER === 'static'
        && process.env.SERVING_CATALOG_PROJECTIONS_ENABLED === 'true';
      const currentCatalog = useSealedBase
        ? this.catalog.renderSource(await this.catalog.captureSourceBySiteId(siteId, client, {}))
        : await this.catalog.listBySiteId(siteId, client);
      routes = currentCatalog.routes as PublicRoute[];
      noindexPaths = new Set(Object.entries(currentCatalog.seoByPath || {}).filter(([, meta]) => meta.indexState === 'NOINDEX').map(([path]) => path));
    } catch (error) {
      validation.errors.push((error as Error).message || 'Не удалось построить опубликованный route inventory');
    }

    const exclusionByPath = new Map(exclusions.map((item) => [item.path, item]));
    const entries = routes.map((route) => this.publishedEntry(route, exclusionByPath.get(route.path), noindexPaths.has(route.path)));
    const entryPaths = new Set(entries.map((entry) => entry.path));
    this.appendUnpublishedEntries(entries, entryPaths, pages, cities);
    for (const exclusion of exclusions) {
      if (!entryPaths.has(exclusion.path)) validation.warnings.push(`Исключение ${exclusion.path} больше не относится к опубликованному маршруту`);
    }
    entries.sort((left, right) => left.group.localeCompare(right.group) || left.path.localeCompare(right.path));

    return { ...settings, entries, exclusions, validation };
  }

  async getInventory(siteId: string, query: { workingRevision: number; group?: string; page: number; search?: string }) {
    if (query.group !== undefined && (typeof query.group !== 'string' || !Object.hasOwn(SITEMAP_FILES, query.group))) {
      throw new BadRequestException('Неизвестная группа Sitemap');
    }
    if (query.search !== undefined && typeof query.search !== 'string') throw new BadRequestException('Укажите поисковый запрос');
    const inventory = await this.prisma.$transaction(
      tx => this.readInventory(siteId, tx, query.workingRevision),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 },
    );
    if (!query.group) return { ...inventory, total: inventory.entries.length };
    const search = (query.search ?? '').trim().toLocaleLowerCase('ru-RU');
    const reasons = new Map(inventory.exclusions.map(item => [item.path, item.reason]));
    const matches = inventory.entries.filter(item => item.group === query.group && (!search ||
      `${item.path} ${item.sourceLabel} ${item.publishStatus} ${reasons.get(item.path) ?? ''}`.toLocaleLowerCase('ru-RU').includes(search)));
    const offset = (query.page - 1) * ADMIN_ROUTE_PAGE_SIZE;
    return {
      ...inventory,
      entries: matches.slice(offset, offset + ADMIN_ROUTE_PAGE_SIZE),
      total: matches.length,
      page: query.page,
      pageSize: ADMIN_ROUTE_PAGE_SIZE,
    };
  }

  async getWorkspace(siteId: string) {
    const inventory = await this.readInventory(siteId, this.prisma);
    const { origin, entries } = inventory;
    const includedPaths = (group: SitemapGroup) => entries
      .filter(entry => entry.group === group && entry.included)
      .map(entry => entry.path);
    return {
      ...inventory,
      previews: {
        index: buildSitemapIndexXml(origin, Object.values(SITEMAP_FILES)),
        pages: buildSitemapXml(origin, includedPaths('PAGES')),
        cities: buildSitemapXml(origin, includedPaths('CITIES')),
        tariffs: buildSitemapXml(origin, includedPaths('TARIFFS')),
      },
    };
  }

  async replaceExclusions(siteId: string, body: { expectedWorkingRevision: number; exclusions: SitemapExclusionInput[] }, actorId?: string) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.findUnique({ where: { id: siteId }, select: { id: true, workingRevision: true } });
      if (!site) throw new NotFoundException('Site not found');
      if (site.workingRevision !== body.expectedWorkingRevision) {
        throw new ConflictException('Рабочая ревизия изменилась. Обновите данные и повторите действие.');
      }
      const currentCatalog = await this.catalog.listBySiteId(siteId, transaction);
      const eligiblePaths = new Set((currentCatalog.routes as PublicRoute[]).map((route) => route.path));
      const next = validateSitemapExclusions(body.exclusions || [], eligiblePaths);
      const current = await transaction.sitemapExclusion.findMany({ where: { siteId }, orderBy: { path: 'asc' }, select: { path: true, reason: true } });
      if (JSON.stringify(current) === JSON.stringify(next)) return { changed: false, workingRevision: site.workingRevision };

      await transaction.sitemapExclusion.deleteMany({ where: { siteId } });
      if (next.length) {
        await transaction.sitemapExclusion.createMany({ data: next.map((item) => ({ siteId, ...item, createdById: actorId || null })) });
      }
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId,
        entityType: 'SITE',
        entityId: siteId,
        action: 'UPDATE',
        previousSnapshot: { sitemapExclusions: current },
        snapshot: { sitemapExclusions: next },
        changedFields: ['sitemapExclusions'],
        actorId,
        source: 'admin-sitemap',
      });
      return { changed: true, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private publishedEntry(route: PublicRoute, exclusion?: { reason: string }, noindex = false): SitemapEntry {
    return {
      path: route.path,
      group: sitemapGroupForRoute(route.kind),
      sourceType: route.kind,
      sourceLabel: route.citySlug && route.tariffSlug
        ? `${route.citySlug} / ${route.tariffSlug}`
        : route.citySlug || route.pageType || 'Главная',
      publishStatus: 'PUBLISHED',
      eligible: !noindex,
      included: !exclusion && !noindex,
      reason: noindex ? 'Автоматически исключён: SEO-шаблон noindex' : exclusion?.reason || null,
    };
  }

  private appendUnpublishedEntries(entries: SitemapEntry[], paths: Set<string>, pages: any[], cities: any[]) {
    for (const page of pages) {
      const path = `/${page.slug}`;
      if (page.slug && !paths.has(path)) {
        entries.push({ path, group: 'PAGES', sourceType: 'GLOBAL_PAGE', sourceLabel: page.title || page.type, publishStatus: page.status, eligible: false, included: false, reason: 'Страница не опубликована' });
        paths.add(path);
      }
    }
    for (const city of cities) {
      const cityPath = `/${city.slug}`;
      if (!paths.has(cityPath)) {
        entries.push({ path: cityPath, group: 'CITIES', sourceType: 'CITY_HOME', sourceLabel: city.name, publishStatus: city.status, eligible: false, included: false, reason: 'Город не опубликован' });
        paths.add(cityPath);
      }
      for (const tariff of city.tariffs) {
        const path = `${cityPath}/${tariff.slug}`;
        if (!paths.has(path)) {
          entries.push({ path, group: 'TARIFFS', sourceType: 'CITY_TARIFF_DETAIL', sourceLabel: `${city.name} / ${tariff.name}`, publishStatus: tariff.status, eligible: false, included: false, reason: tariff.availability === 'ARCHIVED' ? 'Тариф в архиве' : city.status === 'PUBLISHED' ? 'Тариф не опубликован' : 'Город не опубликован', });
          paths.add(path);
        }
      }
    }
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async getWorkspace(siteId: string) {
    const [site, pages, cities, exclusions, latestPublication] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true, name: true, slug: true, domain: true, status: true, workingRevision: true, publishedRevision: true } }),
      this.prisma.page.findMany({ where: { siteId, cityId: null }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, type: true, slug: true, status: true } }),
      this.prisma.city.findMany({ where: { siteId }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true, tariffs: { orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true, availability: true } } } }),
      this.prisma.sitemapExclusion.findMany({ where: { siteId }, orderBy: { path: 'asc' }, select: { id: true, path: true, reason: true, createdById: true, createdAt: true, updatedAt: true } }),
      this.prisma.sitePublication.findFirst({ where: { siteId }, orderBy: { createdAt: 'desc' }, select: { id: true, siteRevision: true, status: true, updatedAt: true, publishedAt: true, lastError: true } }),
    ]);
    if (!site) throw new NotFoundException('Site not found');

    const origin = normalizeSitemapOrigin(process.env.PUBLIC_SITE_URL || site.domain || '');
    const validation = { errors: [] as string[], warnings: [] as string[] };
    let routes: PublicRoute[] = [];
    try {
      const currentCatalog = await this.catalog.listBySiteId(siteId);
      routes = currentCatalog.routes as PublicRoute[];
    } catch (error) {
      validation.errors.push((error as Error).message || 'Не удалось построить опубликованный route inventory');
    }

    const exclusionByPath = new Map(exclusions.map((item) => [item.path, item]));
    const entries = routes.map((route) => this.publishedEntry(route, exclusionByPath.get(route.path)));
    const entryPaths = new Set(entries.map((entry) => entry.path));
    this.appendUnpublishedEntries(entries, entryPaths, pages, cities);
    for (const exclusion of exclusions) {
      if (!entryPaths.has(exclusion.path)) validation.warnings.push(`Исключение ${exclusion.path} больше не относится к опубликованному маршруту`);
    }
    entries.sort((left, right) => left.group.localeCompare(right.group) || left.path.localeCompare(right.path));

    const includedPaths = (group: SitemapGroup) => entries
      .filter((entry) => entry.group === group && entry.included)
      .map((entry) => entry.path);
    const previews = {
      index: buildSitemapIndexXml(origin, Object.values(SITEMAP_FILES)),
      pages: buildSitemapXml(origin, includedPaths('PAGES')),
      cities: buildSitemapXml(origin, includedPaths('CITIES')),
      tariffs: buildSitemapXml(origin, includedPaths('TARIFFS')),
    };

    return {
      site,
      origin,
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
      entries,
      exclusions,
      validation,
      previews,
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

  private publishedEntry(route: PublicRoute, exclusion?: { reason: string }): SitemapEntry {
    return {
      path: route.path,
      group: sitemapGroupForRoute(route.kind),
      sourceType: route.kind,
      sourceLabel: route.citySlug && route.tariffSlug
        ? `${route.citySlug} / ${route.tariffSlug}`
        : route.citySlug || route.pageType || 'Главная',
      publishStatus: 'PUBLISHED',
      eligible: true,
      included: !exclusion,
      reason: exclusion?.reason || null,
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

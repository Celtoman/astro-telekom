import { validateOfficialSitePage } from './official-site-page';
import { projectCityHomeBlocks } from './tariff-collection-model';
import { validateAccountPage } from './account-page';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { validateCityHomeBlocks, validatePublishedBlocks } from './block-validation';
import { resolveCatalogVariables } from './catalog-variables';
import { mergeContent, publicContent } from './content-resolution';
import { PrismaService } from './prisma.service';
import { buildReleaseOneRoutes } from './public-route-policy';
import { validateAddressPageComposition } from './address-page';
import { normalizeRedirectPath } from './redirect-path';
import { materializeCityHomeSource } from './page-template';
import { formatSitePhone } from './site-phone';
import { resolveSeoTemplates } from './seo-templates';
import { collectSeoTemplateUsages } from './seo-template-usages';
import { firstScreenFromTemplate, validateFirstScreen } from './first-screen';
import { generalHomeFromTemplate } from './general-home-template';
import { readSitePublicDisplay } from './site-public-display';
import { CITY_HOME_VERSION } from './city-home-model';
import type { EditorialSource } from './editorial-publication-model';
import { editorialServingSource } from './editorial-serving-source';
import { newsRoutes, newsSeoForRoute } from './news-projection';
import { cityTariffFacts } from './city-tariff-facts';

type CatalogClient = Prisma.TransactionClient | PrismaService;
export type CatalogSource = {
  site: any;
  cities: any[];
  globalPages: any[];
  redirects: Array<{ id: string; sourcePath: string; targetPath: string; status: string }>;
  sitemapExclusions: Array<{ path: string }>;
  seoTemplates: any[];
  pageTemplates?: any[];
  editorial?: EditorialSource;
  publicationBaseId?: string;
};

@Injectable()
export class SiteCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(siteSlug: string, client: CatalogClient = this.prisma) {
    return this.build({ slug: siteSlug, status: 'PUBLISHED' }, client);
  }

  listBySiteId(siteId: string, client: CatalogClient = this.prisma) {
    return this.build({ id: siteId, status: 'PUBLISHED' }, client);
  }

  captureSourceBySiteId(siteId: string, client: CatalogClient = this.prisma) {
    return this.loadSource({ id: siteId, status: 'PUBLISHED' }, client);
  }

  private async build(siteWhere: Prisma.SiteWhereInput, client: CatalogClient) {
    return this.renderSource(await this.loadSource(siteWhere, client));
  }

  private async loadSource(siteWhere: Prisma.SiteWhereInput, client: CatalogClient): Promise<CatalogSource> {
    const site = await client.site.findFirst({
      where: siteWhere,
      include: { provider: { select: { name: true, settings: true } } },
    });
    if (!site) throw new NotFoundException('Site not found');

    const [cities, globalPages, redirects, sitemapExclusions, seoTemplates, pageTemplates] = await Promise.all([
      client.city.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { name: 'asc' },
        include: {
          region: { select: { name: true, slug: true } },
          pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
          tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
        },
      }),
      client.page.findMany({
        where: { siteId: site.id, cityId: null, status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      }),
      client.redirect.findMany({
        where: { siteId: site.id, status: 'PUBLISHED' },
        orderBy: { sourcePath: 'asc' },
        select: { id: true, sourcePath: true, targetPath: true, status: true },
      }),
      client.sitemapExclusion.findMany({
        where: { siteId: site.id },
        orderBy: { path: 'asc' },
        select: { path: true },
      }),
      client.seoTemplate.findMany({
        where: { siteId: site.id },
        orderBy: { kind: 'asc' },
      }),
      client.pageTemplate.findMany({
        where: { siteId: site.id },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      }),
    ]);

    // No draft editorial rows enter legacy capture. Before editorial activation
    // this leaves historical/bootstrap sources unchanged; afterwards live source
    // is authoritative even when working legacy content has changed.
    let editorial:EditorialSource|undefined;
    let publicationBaseId:string|undefined;
    if (client.sitePublication?.findFirst) {
      const editorialRelease=await client.sitePublication.findFirst({where:{siteId:site.id,scopeKey:{not:'legacy'},status:{in:['PENDING','RUNNING','SUCCEEDED']}},select:{id:true}});
      if(editorialRelease){
        const serving=await editorialServingSource(client,site),baseline=serving.source;
        publicationBaseId=serving.publication.id;
        editorial=baseline.editorial;
        const owned=new Set(editorial?.redirectIds??[]);
        const aliases=baseline.redirects.filter(item=>owned.has(item.id));
        for(const alias of aliases){
          if(alias.status!=='PUBLISHED')throw new BadRequestException('Некорректный статус опубликованного редакционного перенаправления');
          const index=redirects.findIndex(item=>item.id===alias.id);
          if(index>=0)redirects.splice(index,1,{...alias,status:'PUBLISHED'});else redirects.push({...alias,status:'PUBLISHED'});
        }
      }
    }
    return { site, cities, globalPages, redirects, sitemapExclusions, seoTemplates, pageTemplates, ...(editorial?{editorial}:{}),...(publicationBaseId?{publicationBaseId}:{}) };
  }

  renderSource(source: CatalogSource, now = new Date()) {
    const { site, cities, globalPages, redirects, sitemapExclusions, seoTemplates } = materializeCityHomeSource(source);
    const homeTemplate = source.pageTemplates?.find(template => template.kind === 'HOME');
    const homeScreen = homeTemplate ? firstScreenFromTemplate(homeTemplate) : undefined;
    const homeHero = homeScreen?.data;
    const generalHome = homeTemplate ? generalHomeFromTemplate(homeTemplate) : null;
    const publicDisplay = readSitePublicDisplay(site.settings);
    if (homeScreen) validateFirstScreen('HOME', homeHero, false, homeScreen.passportVersion);
    const resolvedGlobalPages = globalPages.map((page: any) => this.pageResponse(page, mergeContent(publicContent(site.provider.settings), publicContent(site.settings)), {}));
    const routes = buildReleaseOneRoutes(cities, resolvedGlobalPages, { addressCheck: source.pageTemplates?.some(template => template.kind === 'CITY_ADDRESS_CHECK') });
    const editorialRoutes=source.editorial?newsRoutes(source.editorial):[];
    const allRoutes=[...routes,...editorialRoutes];
    if(new Set(allRoutes.map(route=>route.path)).size!==allRoutes.length)throw new BadRequestException('Адрес раздела новостей занят существующей страницей');
    const resolved = resolveCatalogVariables({
      ...(generalHome ? { generalHome } : {}),
      ...(homeHero ? { homeHero, homeHeroVersion: homeScreen!.passportVersion, homeHeroBlockId: homeTemplate.blocks.find((block: any) => block.blockType === 'home.hero').id } : {}),
      site: {
        name: site.name,
        slug: site.slug,
        domain: site.domain,
        connectionPhone: site.connectionPhone ? formatSitePhone(site.connectionPhone) : null,
        supportPhone: site.supportPhone ? formatSitePhone(site.supportPhone) : null,
        connectionHours: publicDisplay.connectionHours,
        callbackWithinMinutes: publicDisplay.callbackWithinMinutes,
        publicDisplay,
      },
      globalPages: resolvedGlobalPages,
      routes:allRoutes,
      sitemap: { excludedPaths: sitemapExclusions.map((item) => item.path) },
      redirects: this.effectiveRedirects(allRoutes, redirects),
      cities: cities.map((city: any) => this.cityResponse(city, site)),
    }, {
      site: { ...publicDisplay, connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
      provider: { name: site.provider.name },
      now,
    });
    for (const page of resolved.globalPages) { if (page.type === 'ACCOUNT') validateAccountPage(page.content); if (page.type === 'OFFICIAL_SITE') validateOfficialSitePage(page.content); }
    const seo = resolveSeoTemplates({
      routes,
      templates: seoTemplates,
      cities: resolved.cities,
      site: { connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
      provider: { name: site.provider.name },
      now,
    });
    const noindexPaths = Object.entries(seo.byPath).filter(([, meta]) => meta.indexState === 'NOINDEX').map(([path]) => path);
    return {
      ...resolved,
      ...(source.editorial?{editorial:structuredClone(source.editorial)}:{}),
      variableUsages: [...resolved.variableUsages, ...collectSeoTemplateUsages(seoTemplates)],
      variableUsageVersion: 2,
      sitemap: { excludedPaths: [...new Set([...resolved.sitemap.excludedPaths, ...noindexPaths])].sort() },
      seoByPath: {...seo.byPath,...Object.fromEntries(editorialRoutes.map(route=>[route.path,newsSeoForRoute(source.editorial!,route)]))},
      seoWarnings: seo.warnings,
    };
  }

  async getCity(siteSlug: string, citySlug: string, client: CatalogClient = this.prisma) {
    const city = await client.city.findFirst({
      where: { site: { slug: siteSlug, status: 'PUBLISHED' }, slug: citySlug, status: 'PUBLISHED' },
      include: {
        site: { select: { settings: true, provider: { select: { settings: true } }, pageTemplates: { include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } } } },
        region: { select: { name: true, slug: true } },
        pages: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } },
        tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!city) throw new NotFoundException('City not found');
    const { pageTemplates, ...site } = city.site;
    const materialized = materializeCityHomeSource({
      site, cities: [city], globalPages: [], redirects: [], sitemapExclusions: [], seoTemplates: [], pageTemplates,
    });
    return this.cityResponse(materialized.cities[0], site);
  }

  cityResponse(city: any, site: any) {
    const inheritedContent = mergeContent(publicContent(site.provider.settings), publicContent(site.settings));
    const inheritedSeo: Record<string, unknown> = {};
    const { site: _site, region, pages, tariffs, ...cityData } = city;
    const homePages = pages.filter((page: any) => page.type === 'HOME');
    if (homePages.length !== 1) {
      throw new BadRequestException(`У опубликованного города «${city.name}» должна быть ровно одна страница HOME`);
    }
    if (homePages[0].slug !== '') {
      throw new BadRequestException(`Городская HOME «${city.name}» должна иметь пустой slug`);
    }
    if (homePages[0].content?.homeCompositionVersion === CITY_HOME_VERSION && !tariffs.some((tariff: any) => !['DRAFT', 'ARCHIVED'].includes(tariff.status))) {
      throw new BadRequestException(`Город «${city.name}» нельзя опубликовать без опубликованного тарифа. Добавьте тариф или снимите город с публикации.`);
    }
    return {
      ...cityData,
      content: inheritedContent,
      seo: inheritedSeo,
      region: { name: region.name, slug: region.slug },
      tariffFacts: cityTariffFacts(tariffs),
      pages: pages.map((page: any) => this.pageResponse(page, inheritedContent, inheritedSeo, city.name)),
      tariffs: tariffs.map((tariff: any) => ({
        ...tariff,
        seo: inheritedSeo,
      })),
    };
  }

  pageResponse(page: any, inheritedContent: Record<string, unknown>, inheritedSeo: Record<string, unknown>, cityName?: string) {
    if (page.type === 'OFFICIAL_SITE') { validateOfficialSitePage(page.content); return { ...page, content: page.content, seo: inheritedSeo }; }
    if (page.type === 'ACCOUNT') { validateAccountPage(page.content); return { ...page, content: page.content, seo: inheritedSeo }; }
    if (page.type === 'HOME' && cityName) { page = { ...page, blocks: projectCityHomeBlocks(page.blocks || []) }; validateCityHomeBlocks(page.blocks, cityName, page.content?.homeCompositionVersion); }
    else if (page.type === 'ADDRESS_CHECK' && page.content?.addressCheckCompositionVersion) validateAddressPageComposition(page.blocks.map(({ blockType, data }: any) => ({ blockType, data })), { version: page.content.addressCheckCompositionVersion });
    else validatePublishedBlocks(page.blocks, { pageType: cityName ? page.type : undefined });
    const { templateId: _templateId, ...publicPage } = page;
    return {
      ...publicPage,
      content: mergeContent(inheritedContent, page.content),
      seo: inheritedSeo,
    };
  }

  effectiveRedirects(routes: Array<{ path: string }>, redirects: Array<{ id: string; sourcePath: string; targetPath: string; status: string }>) {
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

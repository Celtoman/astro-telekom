import { validateTariffCollection } from './tariff-collection';
import { validateCityHomeBlocks, validatePublishedBlocks } from './block-validation';
import { resolveCatalogVariables } from './catalog-variables';
import { RELEASE_ONE_GLOBAL_PAGES, type PublicRoute } from './public-route-policy';
import { normalizeRedirectPath } from './redirect-path';
import { materializeCityHomeSource } from './page-template';
import type { CatalogSource } from './site-catalog.service';
import { sitePhoneReadinessErrors } from './site-phone';
import { resolveSeoTemplates } from './seo-templates';
import { tariffPreviewDiagnostics } from './tariff-preview-diagnostics';
import { firstScreenFromTemplate, validateFirstScreen } from './first-screen';
import { contentErrorLocation } from './content-validation-error';

export type PublicationValidationIssue = {
  severity: 'BLOCKING' | 'WARNING';
  code: string;
  path: string;
  message: string;
  relatedPath?: string;
  template?: string;
  block?: string;
  field?: string;
  reason?: string;
  context?: 'SERVICE_DATA';
  pageType?: string;
  entityId?: string;
};

export type PublicationValidationReport = {
  schemaVersion: 1;
  appVersion: string;
  validatedAt: string;
  requestedById: string | null;
  siteRevision: number;
  checkedUrlCount: number;
  checkedPaths: string[];
  issues: PublicationValidationIssue[];
  outcome: 'BLOCKED' | 'PASSED_WITH_WARNINGS' | 'PASSED';
};

type RouteSource = { route: PublicRoute; page?: any; city?: any; tariff?: any };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function routeSources(source: CatalogSource): RouteSource[] {
  const routes: RouteSource[] = [{ route: { id: 'HOME', kind: 'HOME', path: '/' } }];
  for (const expected of RELEASE_ONE_GLOBAL_PAGES) {
    const page = source.globalPages.find((item) => item.type === expected.type);
    routes.push({
      route: { id: expected.type, kind: 'GLOBAL_PAGE', path: `/${expected.slug}`, pageType: expected.type },
      page,
    });
  }
  for (const city of source.cities) {
    const cityPath = `/${city.slug}`;
    routes.push({ route: { id: 'CITY_HOME', kind: 'CITY_HOME', path: cityPath, citySlug: city.slug }, city });
    for (const tariff of city.tariffs || []) {
      routes.push({
        route: { id: 'CITY_TARIFF_DETAIL', kind: 'CITY_TARIFF_DETAIL', path: `${cityPath}/${tariff.slug}`, citySlug: city.slug, tariffSlug: tariff.slug },
        city,
        tariff,
      });
    }
  }
  return routes;
}

export function validatePublicationSource(
  rawSource: CatalogSource,
  input: { appVersion: string; requestedById?: string | null; siteRevision: number; now?: Date },
  renderSource: (source: CatalogSource, now: Date) => unknown,
): { report: PublicationValidationReport; catalog: unknown | null } {
  const now = input.now || new Date();
  const issues: PublicationValidationIssue[] = [];
  const issueKeys = new Set<string>();
  const add = (severity: PublicationValidationIssue['severity'], code: string, path: string, detail: string, relatedPath?: string,
    location?: Partial<Pick<PublicationValidationIssue, 'template' | 'block' | 'field' | 'reason' | 'context' | 'pageType' | 'entityId'>>) => {
    const issue: PublicationValidationIssue = { severity, code, path, message: detail };
    if (relatedPath) issue.relatedPath = relatedPath;
    if (location?.template) issue.template = location.template;
    if (location?.block) issue.block = location.block;
    if (location?.field) issue.field = location.field;
    if (location?.reason) issue.reason = location.reason;
    if (location?.context) issue.context = location.context;
    if (location?.pageType) issue.pageType = location.pageType;
    if (location?.entityId) issue.entityId = location.entityId;
    const key = JSON.stringify(issue);
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      issues.push(issue);
    }
  };
  let source = rawSource;
  try { source = materializeCityHomeSource(rawSource); }
  catch (error) { add('BLOCKING', 'CITY_HOME_TEMPLATE', '/', message(error)); }
  const routes = routeSources(source);
  const seen = new Map<string, string>();
  const checkedPaths: string[] = [];
  const site = source.site;
  const provider = site.provider;
  for (const template of rawSource.pageTemplates ?? []) {
    if (template.kind === 'CITY_HOME' && template.content?.tariffCollectionPassportVersion) {
      try { validateTariffCollection(template.blocks.find((block: any) => block.blockType === 'tariff_grid' && block.visible)?.data); }
      catch (error) { add('BLOCKING', 'TARIFF_COLLECTION_NOT_READY', '/{city}', message(error), undefined, { template: 'CITY_HOME', block: 'tariff_grid', ...contentErrorLocation(error) }); }
    }

    if (template.kind === 'HOME' || template.kind === 'CITY_HOME') {
      if (template.kind === 'HOME' || template.content?.firstScreenPassportVersion) {
        try { const screen = firstScreenFromTemplate(template); validateFirstScreen(screen.kind, screen.data, false, screen.passportVersion); }
        catch (error) { add('BLOCKING', 'FIRST_SCREEN_NOT_READY', template.kind === 'HOME' ? '/' : '/{city}', message(error), undefined, { template: template.kind, block: template.kind === 'HOME' ? 'home.hero' : 'hero', ...contentErrorLocation(error) }); }
      }
    }
  }

  // Service-page data participates in catalog rendering even though Release 1 gives it no detail URL.
  for (const city of source.cities) {
    for (const page of (city.pages || []).filter((page: any) => page.type !== 'HOME')) {
      try { validatePublishedBlocks(page.blocks, { pageType: page.type }); }
      catch (error) { add('BLOCKING', 'SERVICE_PAGE_BLOCKS', `/${city.slug}`, message(error), undefined,
        { context: 'SERVICE_DATA', pageType: page.type, entityId: page.id, ...contentErrorLocation(error) }); }
    }
  }

  for (const missing of sitePhoneReadinessErrors(site)) {
    add('BLOCKING', 'SITE_PHONE_MISSING', '/', `Не заполнено обязательное поле ${missing}`);
  }
  if (source.globalPages.length !== RELEASE_ONE_GLOBAL_PAGES.length) {
    add('BLOCKING', 'GLOBAL_PAGE_SET', '/', `Release 1 требует ровно ${RELEASE_ONE_GLOBAL_PAGES.length} общих страниц`);
  }
  for (const page of source.globalPages) {
    const expected = RELEASE_ONE_GLOBAL_PAGES.find((item) => item.type === page.type);
    if (!expected) add('BLOCKING', 'UNKNOWN_GLOBAL_PAGE', `/${page.slug}`, `Неизвестный тип опубликованной общей страницы: ${page.type}`);
    else if (page.slug !== expected.slug) add('BLOCKING', 'GLOBAL_PAGE_SLUG', `/${expected.slug}`, `Некорректный slug общей страницы ${page.type}: ${page.slug}`);
    if (source.globalPages.filter((item) => item.type === page.type).length > 1) {
      add('BLOCKING', 'DUPLICATE_GLOBAL_PAGE', `/${expected?.slug || page.slug}`, `Дублируется общая страница ${page.type}`);
    }
  }

  for (const item of routes) {
    const { route, page, city, tariff } = item;
    const previous = seen.get(route.path);
    if (previous) add('BLOCKING', 'ROUTE_CONFLICT', route.path, `Путь ${route.path} занят несколькими страницами`, previous);
    else {
      seen.set(route.path, route.id);
      checkedPaths.push(route.path);
    }
    if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?)?$/.test(route.path)) {
      add('BLOCKING', 'INVALID_ROUTE', route.path, `Недопустимый путь ${route.path}`);
    }
    if (route.kind === 'GLOBAL_PAGE') {
      if (!page) add('BLOCKING', 'GLOBAL_PAGE_MISSING', route.path, `Не опубликована обязательная страница ${route.pageType}`);
      else {
        try { validatePublishedBlocks(page.blocks); } catch (error) { add('BLOCKING', 'PAGE_BLOCKS', route.path, message(error), undefined, contentErrorLocation(error)); }
      }
    }
    if (route.kind === 'CITY_HOME') {
      const homes = (city.pages || []).filter((candidate: any) => candidate.type === 'HOME');
      if (homes.length !== 1) add('BLOCKING', 'CITY_HOME_COUNT', route.path, `У города «${city.name}» должна быть ровно одна HOME`);
      else {
        if (homes[0].slug !== '') add('BLOCKING', 'CITY_HOME_SLUG', route.path, 'Городская HOME должна иметь пустой slug');
        try { validateCityHomeBlocks(homes[0].blocks, city.name); } catch (error) { add('BLOCKING', 'CITY_HOME_BLOCKS', route.path, message(error), undefined, { template: 'CITY_HOME', ...contentErrorLocation(error) }); }
      }
    }
    if (route.kind === 'CITY_TARIFF_DETAIL') {
      for (const diagnostic of tariffPreviewDiagnostics(JSON.parse(JSON.stringify(tariff)), route.path)) {
        add(diagnostic.severity, diagnostic.code, diagnostic.path, diagnostic.message, undefined,
          { template: diagnostic.template, block: diagnostic.block, field: diagnostic.field, entityId: tariff.id });
      }
    }
    try {
      const mini = {
        site: { name: site.name, slug: site.slug, domain: site.domain, connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
        globalPages: page ? [page] : [],
        cities: city ? [{ ...city, pages: route.kind === 'CITY_HOME' ? (city.pages || []).filter((candidate: any) => candidate.type === 'HOME') : [], tariffs: tariff ? [tariff] : [] }] : [],
        routes: [route],
        redirects: [],
        sitemap: { excludedPaths: [] },
      };
      const resolved = resolveCatalogVariables(mini, {
        site: { connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
        provider: { name: provider.name },
        now,
      });
      for (const warning of resolved.variableWarnings) {
        add('WARNING', `VARIABLE_${warning.reason}`, route.path, `Переменная {${warning.code}}: ${warning.reason} (${warning.path})`);
      }
    } catch (error) {
      const detail = message(error);
      const tariffField = route.kind === 'CITY_TARIFF_DETAIL' && /\.promoText\b/.test(detail)
        ? { template: route.id, block: 'hero', field: 'promoText' } : undefined;
      add('BLOCKING', 'VARIABLE_RESOLUTION', route.path, detail, undefined, tariffField);
    }
    try {
      const seo = resolveSeoTemplates({
        routes: [route],
        templates: source.seoTemplates.filter((candidate) => candidate.kind === route.id),
        cities: city ? [city] : [],
        site: { connectionPhone: site.connectionPhone, supportPhone: site.supportPhone },
        provider: { name: provider.name },
        now,
      });
      for (const warning of seo.warnings) add('WARNING', `SEO_${warning.code}`, route.path, `SEO ${warning.code}${warning.length ? `: ${warning.length}` : ''}`);
    } catch (error) {
      add('BLOCKING', 'SEO_RESOLUTION', route.path, message(error));
    }
  }

  const paths = new Set(checkedPaths);
  for (const redirect of source.redirects) {
    try {
      const from = normalizeRedirectPath(redirect.sourcePath, 'sourcePath');
      const to = normalizeRedirectPath(redirect.targetPath, 'targetPath');
      if (paths.has(from)) add('BLOCKING', 'REDIRECT_ROUTE_CONFLICT', from, `Редирект занимает опубликованный URL ${from}`);
      if (!paths.has(to)) add('BLOCKING', 'REDIRECT_TARGET_MISSING', from, `Цель редиректа ${to} отсутствует в Release 1 inventory`);
    } catch (error) {
      add('BLOCKING', 'REDIRECT_INVALID', redirect.sourcePath, message(error));
    }
  }

  let catalog: unknown | null = null;
  if (!issues.some((issue) => issue.severity === 'BLOCKING')) {
    try {
      catalog = renderSource(rawSource, now);
      const rendered = catalog as { routes?: PublicRoute[]; variableWarnings?: Array<{ code: string; path: string; reason: string }>; seoWarnings?: Array<{ code: string; path: string; relatedPath?: string; length?: number }> };
      if (!Array.isArray(rendered.routes) || rendered.routes.length !== routes.length) {
        add('BLOCKING', 'CATALOG_ROUTE_COUNT', '/', 'Состав собранных маршрутов отличается от проверенного inventory');
        catalog = null;
      } else {
        for (const warning of rendered.variableWarnings || []) {
          const ownerPath = warning.path.match(/^cities\[(\d+)\](?:\.tariffs\[(\d+)\])?/);
          const city = ownerPath ? source.cities[Number(ownerPath[1])] : null;
          const tariff = city && ownerPath?.[2] !== undefined ? city.tariffs[Number(ownerPath[2])] : null;
          const path = city ? `/${city.slug}${tariff ? `/${tariff.slug}` : ''}` : '/';
          add('WARNING', `VARIABLE_${warning.reason}`, path, `Переменная {${warning.code}}: ${warning.reason} (${warning.path})`);
        }
        for (const warning of rendered.seoWarnings || []) {
          add('WARNING', `SEO_${warning.code}`, warning.path, `SEO ${warning.code}${warning.length ? `: ${warning.length}` : ''}`, warning.relatedPath);
        }
      }
    } catch (error) {
      add('BLOCKING', 'CATALOG_RENDER', '/', message(error));
      catalog = null;
    }
  }

  issues.sort((a, b) => a.path.localeCompare(b.path) || a.severity.localeCompare(b.severity) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
  const report: PublicationValidationReport = {
    schemaVersion: 1,
    appVersion: input.appVersion,
    validatedAt: now.toISOString(),
    requestedById: input.requestedById || null,
    siteRevision: input.siteRevision,
    checkedUrlCount: checkedPaths.length,
    checkedPaths,
    issues,
    outcome: issues.some((issue) => issue.severity === 'BLOCKING') ? 'BLOCKED' : issues.length ? 'PASSED_WITH_WARNINGS' : 'PASSED',
  };
  return { report, catalog: report.outcome === 'BLOCKED' ? null : catalog };
}

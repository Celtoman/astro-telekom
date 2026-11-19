import { ADDRESS_PAGE_SLUG } from './address-page-model';
import { SUPPORT_PAGE_SLUG } from './support-page-model';
import type { NewsRoute } from './news-projection';

export const RELEASE_ONE_GLOBAL_PAGES = [
  { type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera' },
  { type: 'CITIES', slug: 'goroda-obsluzhivaniya' },
  { type: 'PRIVACY', slug: 'politika-konfidencialnosti' },
  { type: 'PERSONAL_DATA_CONSENT', slug: 'soglasie-na-obrabotku-personalnyh-dannyh' },
  { type: 'COOKIE_POLICY', slug: 'politika-obrabotki-faylov-kuki' },
] as const;

export type ReleaseOneGlobalPageType = typeof RELEASE_ONE_GLOBAL_PAGES[number]['type'];
export const OPTIONAL_GLOBAL_PAGES = [{ type: 'FAQ', slug: 'faq' }, { type: 'ACCOUNT', slug: 'lichnyy-kabinet-dom-ru' }, { type: 'OFFICIAL_SITE', slug: 'official-site-domru' }, { type: 'SPEED_TEST', slug: 'proverit-skorost-interneta' }] as const;
export const SUPPORTED_GLOBAL_PAGES = [...RELEASE_ONE_GLOBAL_PAGES, ...OPTIONAL_GLOBAL_PAGES] as const;

export type LegacyPublicRoute = {
  id: 'HOME' | 'CITY_HOME' | 'CITY_TARIFF_DETAIL' | 'CITY_ADDRESS_CHECK' | 'CITY_SUPPORT' | ReleaseOneGlobalPageType | 'ACCOUNT' | 'OFFICIAL_SITE' | 'SPEED_TEST' | 'FAQ';
  kind: 'HOME' | 'CITY_HOME' | 'CITY_TARIFF_DETAIL' | 'CITY_ADDRESS_CHECK' | 'CITY_SUPPORT' | 'GLOBAL_PAGE';
  path: string;
  citySlug?: string;
  tariffSlug?: string;
  pageType?: ReleaseOneGlobalPageType | 'ACCOUNT' | 'OFFICIAL_SITE' | 'SPEED_TEST' | 'FAQ';
};
export type PublicRoute = LegacyPublicRoute | (NewsRoute & {citySlug?:never;tariffSlug?:never;pageType?:never});
export function isLegacyPublicRoute(route:PublicRoute):route is LegacyPublicRoute {return route.kind!=='NEWS_LIST'&&route.kind!=='NEWS_ARTICLE'&&route.kind!=='NEWS_CATEGORY'}

type CityRouteSource = { slug: string; tariffs?: Array<{ slug: string }>; pages?: Array<{ type: string; slug: string }> };
type GlobalPageRouteSource = { type: string; slug: string };
export interface PublicRouteOptions { addressCheck?: boolean; support?: boolean }

export function buildReleaseOneRoutes(cities: CityRouteSource[], globalPages: GlobalPageRouteSource[], options: PublicRouteOptions = {}): LegacyPublicRoute[] {
  const pagesByType = new Map<string, GlobalPageRouteSource>();
  for (const page of globalPages) {
    if (pagesByType.has(page.type)) throw new Error(`Дублируется общая страница Release 1: ${page.type}`);
    pagesByType.set(page.type, page);
  }

  const routes: LegacyPublicRoute[] = [{ id: 'HOME', kind: 'HOME', path: '/' }];
  const occupiedPaths = new Set(['/']);
  for (const expected of SUPPORTED_GLOBAL_PAGES) {
    const page = pagesByType.get(expected.type);
    if (!page && OPTIONAL_GLOBAL_PAGES.some(p => p.type === expected.type)) continue;
    if (!page) throw new Error(`Не опубликована обязательная общая страница Release 1: ${expected.type}`);
    if (page.slug !== expected.slug) {
      throw new Error(`Некорректный slug общей страницы ${expected.type}: ожидается ${expected.slug}`);
    }
    const path = `/${page.slug}`;
    routes.push({ id: expected.type, kind: 'GLOBAL_PAGE', path, pageType: expected.type });
    occupiedPaths.add(path);
  }
  if (globalPages.some(page => !SUPPORTED_GLOBAL_PAGES.some(expected => expected.type === page.type))) {
    throw new Error(`Release 1 требует ровно ${RELEASE_ONE_GLOBAL_PAGES.length} опубликованные общие страницы`);
  }

  for (const city of cities) {
    const path = `/${city.slug}`;
    if (occupiedPaths.has(path)) throw new Error(`Конфликт маршрута Release 1: ${path}`);
    occupiedPaths.add(path);
    routes.push({ id: 'CITY_HOME', kind: 'CITY_HOME', path, citySlug: city.slug });
    if (options.addressCheck) {
      const addressPages = (city.pages ?? []).filter(page => page.type === 'ADDRESS_CHECK' && page.slug === ADDRESS_PAGE_SLUG);
      if (addressPages.length !== 1) throw new Error(`Не найдена единственная страница проверки подключения города: ${city.slug}`);
      const addressPath = `/${city.slug}/${ADDRESS_PAGE_SLUG}`;
      if (occupiedPaths.has(addressPath)) throw new Error(`Конфликт маршрута Release 1: ${addressPath}`);
      occupiedPaths.add(addressPath);
      routes.push({ id: 'CITY_ADDRESS_CHECK', kind: 'CITY_ADDRESS_CHECK', path: addressPath, citySlug: city.slug });
    }
    if (options.support) {
      const pages = (city.pages ?? []).filter(page => page.type === 'CITY_SUPPORT');
      if (pages.length !== 1 || pages[0].slug !== SUPPORT_PAGE_SLUG) throw new Error('Не найдена единственная страница поддержки города: ' + city.slug);
      const supportPath = '/' + city.slug + '/' + SUPPORT_PAGE_SLUG;
      if (occupiedPaths.has(supportPath)) throw new Error('Конфликт маршрута Release 1: ' + supportPath);
      occupiedPaths.add(supportPath);
      routes.push({ id: 'CITY_SUPPORT', kind: 'CITY_SUPPORT', path: supportPath, citySlug: city.slug });
    }
    for (const tariff of city.tariffs || []) {
      const tariffPath = `/${city.slug}/${tariff.slug}`;
      if (occupiedPaths.has(tariffPath)) throw new Error(`Конфликт маршрута Release 1: ${tariffPath}`);
      occupiedPaths.add(tariffPath);
      routes.push({
        id: 'CITY_TARIFF_DETAIL',
        kind: 'CITY_TARIFF_DETAIL',
        path: tariffPath,
        citySlug: city.slug,
        tariffSlug: tariff.slug,
      });
    }
  }
  return routes;
}

export function releaseOnePaths(cities: CityRouteSource[], globalPages: GlobalPageRouteSource[], options: PublicRouteOptions = {}) {
  return new Set(buildReleaseOneRoutes(cities, globalPages, options).map((route) => route.path));
}

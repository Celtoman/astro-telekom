export const RELEASE_ONE_GLOBAL_PAGES = [
  { type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera' },
  { type: 'CITIES', slug: 'goroda-obsluzhivaniya' },
  { type: 'PRIVACY', slug: 'politika-konfidencialnosti' },
  { type: 'PERSONAL_DATA_CONSENT', slug: 'soglasie-na-obrabotku-personalnyh-dannyh' },
  { type: 'COOKIE_POLICY', slug: 'politika-obrabotki-faylov-kuki' },
] as const;

export type ReleaseOneGlobalPageType = typeof RELEASE_ONE_GLOBAL_PAGES[number]['type'];

export type PublicRoute = {
  id: 'HOME' | 'CITY_HOME' | 'CITY_TARIFF_DETAIL' | ReleaseOneGlobalPageType;
  kind: 'HOME' | 'CITY_HOME' | 'CITY_TARIFF_DETAIL' | 'GLOBAL_PAGE';
  path: string;
  citySlug?: string;
  tariffSlug?: string;
  pageType?: ReleaseOneGlobalPageType;
};

type CityRouteSource = { slug: string; tariffs?: Array<{ slug: string }> };
type GlobalPageRouteSource = { type: string; slug: string };

export function buildReleaseOneRoutes(cities: CityRouteSource[], globalPages: GlobalPageRouteSource[]): PublicRoute[] {
  const pagesByType = new Map<string, GlobalPageRouteSource>();
  for (const page of globalPages) {
    if (pagesByType.has(page.type)) throw new Error(`Дублируется общая страница Release 1: ${page.type}`);
    pagesByType.set(page.type, page);
  }

  const routes: PublicRoute[] = [{ id: 'HOME', kind: 'HOME', path: '/' }];
  const occupiedPaths = new Set(['/']);
  for (const expected of RELEASE_ONE_GLOBAL_PAGES) {
    const page = pagesByType.get(expected.type);
    if (!page) throw new Error(`Не опубликована обязательная общая страница Release 1: ${expected.type}`);
    if (page.slug !== expected.slug) {
      throw new Error(`Некорректный slug общей страницы ${expected.type}: ожидается ${expected.slug}`);
    }
    const path = `/${page.slug}`;
    routes.push({ id: expected.type, kind: 'GLOBAL_PAGE', path, pageType: expected.type });
    occupiedPaths.add(path);
  }
  if (globalPages.length !== RELEASE_ONE_GLOBAL_PAGES.length) {
    throw new Error(`Release 1 требует ровно ${RELEASE_ONE_GLOBAL_PAGES.length} опубликованные общие страницы`);
  }

  for (const city of cities) {
    const path = `/${city.slug}`;
    if (occupiedPaths.has(path)) throw new Error(`Конфликт маршрута Release 1: ${path}`);
    occupiedPaths.add(path);
    routes.push({ id: 'CITY_HOME', kind: 'CITY_HOME', path, citySlug: city.slug });
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

export function releaseOnePaths(cities: CityRouteSource[], globalPages: GlobalPageRouteSource[]) {
  return new Set(buildReleaseOneRoutes(cities, globalPages).map((route) => route.path));
}

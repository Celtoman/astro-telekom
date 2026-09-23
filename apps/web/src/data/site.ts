import { tariffView, type TariffView } from './tariff-view';
import { normalizePublicHtmlPath, publicHtmlPath } from './public-url';

export interface PageView {
  type: string;
  slug: string;
  title?: string;
  status: string;
  content?: Record<string, unknown> | null;
  seo?: Record<string, unknown> | null;
  blocks?: Array<{ blockType: string; data: Record<string, unknown> }>;
}

export interface CityView {
  name: string;
  nameIn: string;
  slug: string;
  region: { name: string; slug: string };
  status: string;
  pages: PageView[];
  tariffs: TariffView[];
}

export interface SiteView {
  name: string;
  slug: string;
  domain?: string | null;
  connectionPhone: string;
  supportPhone: string;
}

export interface RedirectView {
  id: string;
  sourcePath: string;
  targetPath: string;
  status: string;
}

export interface PublicRouteView {
  id: string;
  kind: 'HOME' | 'CITY_HOME' | 'CITY_TARIFF_DETAIL' | 'GLOBAL_PAGE';
  path: string;
  citySlug?: string;
  tariffSlug?: string;
  pageType?: string;
}

export interface SiteCatalog {
  site: SiteView;
  globalPages: PageView[];
  routes: PublicRouteView[];
  cities: CityView[];
  redirects: RedirectView[];
  sitemap: { excludedPaths: string[] };
  seoByPath?: Record<string, { title: string; description: string; indexState: 'INDEX' | 'NOINDEX'; ogTitle: string; ogDescription: string; ogImage: string }>;
}

export const defaultSiteImagePath = '/images/home-connection-equipment.webp';

export const publicSiteSlug = import.meta.env.PUBLIC_SITE_SLUG || 'domru-site';
const fallbackConnectionPhone = import.meta.env.PUBLIC_CONNECTION_PHONE || '8 (800) 000-00-00';
const fallbackSupportPhone = import.meta.env.PUBLIC_SUPPORT_PHONE || fallbackConnectionPhone;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const redirectIdPattern = /^[a-zA-Z0-9_-]+$/;
const redirectPathPattern = /^\/[a-z0-9._~/-]*$/;
const cityHomeBlockSequence = ['hero', 'service_grid', 'tariff_grid', 'steps', 'feature_grid', 'feature_grid', 'faq'];

export const releaseOneGlobalPages = [
  { type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera' },
  { type: 'CITIES', slug: 'goroda-obsluzhivaniya' },
  { type: 'PRIVACY', slug: 'politika-konfidencialnosti' },
  { type: 'PERSONAL_DATA_CONSENT', slug: 'soglasie-na-obrabotku-personalnyh-dannyh' },
  { type: 'COOKIE_POLICY', slug: 'politika-obrabotki-faylov-kuki' },
] as const;

function normalizePage(item: Record<string, any>): PageView {
  return {
    ...item,
    type: String(item.type || ''),
    slug: String(item.slug || ''),
    status: 'PUBLISHED',
    content: item.content && typeof item.content === 'object' ? item.content : {},
    seo: item.seo && typeof item.seo === 'object' ? item.seo : {},
    blocks: Array.isArray(item.blocks) ? item.blocks : [],
  };
}

function assertCityHomeTemplate(city: CityView): void {
  const homePages = city.pages.filter((page) => page.type === 'HOME');
  if (homePages.length !== 1 || homePages[0]?.slug !== '') {
    throw new Error(`Город «${city.name}» должен иметь ровно одну опубликованную HOME с пустым slug`);
  }
  const sequence = homePages[0].blocks?.map((block) => block.blockType) || [];
  if (JSON.stringify(sequence) !== JSON.stringify(cityHomeBlockSequence)) {
    throw new Error(`Город «${city.name}»: опубликованная HOME не соответствует каноническому шаблону из 7 блоков`);
  }
}

function expectedReleaseOneRoutes(cities: CityView[], globalPages: PageView[]): PublicRouteView[] {
  const pagesByType = new Map(globalPages.map((page) => [page.type, page]));
  if (pagesByType.size !== releaseOneGlobalPages.length || globalPages.length !== releaseOneGlobalPages.length) {
    throw new Error(`Release 1 требует ровно ${releaseOneGlobalPages.length} опубликованные общие страницы`);
  }

  const routes: PublicRouteView[] = [{ id: 'HOME', kind: 'HOME', path: '/' }];
  const occupiedPaths = new Set(['/']);
  for (const expected of releaseOneGlobalPages) {
    const page = pagesByType.get(expected.type);
    if (!page) throw new Error(`Не опубликована обязательная общая страница Release 1: ${expected.type}`);
    if (page.slug !== expected.slug) throw new Error(`Некорректный slug общей страницы ${expected.type}: ожидается ${expected.slug}`);
    const path = publicHtmlPath(expected.slug);
    occupiedPaths.add(path);
    routes.push({ id: expected.type, kind: 'GLOBAL_PAGE', path, pageType: expected.type });
  }

  const citySlugs = new Set<string>();
  for (const city of cities) {
    if (citySlugs.has(city.slug)) throw new Error(`Конфликт опубликованного URL /${city.slug}: дублируется slug города`);
    citySlugs.add(city.slug);
    const path = publicHtmlPath(city.slug);
    if (occupiedPaths.has(path)) throw new Error(`Конфликт маршрута Release 1: ${path}`);
    occupiedPaths.add(path);
    routes.push({ id: 'CITY_HOME', kind: 'CITY_HOME', path, citySlug: city.slug });
    for (const tariff of city.tariffs) {
      if (!slugPattern.test(tariff.slug)) throw new Error(`Некорректный slug опубликованного тарифа: ${tariff.slug || '(пусто)'}`);
      const tariffPath = publicHtmlPath(city.slug, tariff.slug);
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

function normalizeRoutes(value: unknown, expected: PublicRouteView[]) {
  if (!Array.isArray(value)) throw new Error('API не вернул реестр маршрутов Release 1');
  const routes = value.map((item: Record<string, unknown>) => ({
    id: String(item.id || ''),
    kind: String(item.kind || '') as PublicRouteView['kind'],
    path: normalizePublicHtmlPath(String(item.path || '')),
    ...(item.citySlug ? { citySlug: String(item.citySlug) } : {}),
    ...(item.tariffSlug ? { tariffSlug: String(item.tariffSlug) } : {}),
    ...(item.pageType ? { pageType: String(item.pageType) } : {}),
  }));
  if (JSON.stringify(routes) !== JSON.stringify(expected)) {
    throw new Error('API вернул реестр маршрутов, который не соответствует структуре Release 1');
  }
  return routes;
}

function normalizeRedirects(value: unknown, routes: PublicRouteView[]): RedirectView[] {
  const redirects = (Array.isArray(value) ? value : [])
    .filter((item: Record<string, unknown>) => item?.status === 'PUBLISHED')
    .map((item: Record<string, unknown>) => ({
      id: String(item.id || ''),
      sourcePath: normalizePublicHtmlPath(String(item.sourcePath || '')),
      targetPath: normalizePublicHtmlPath(String(item.targetPath || '')),
      status: 'PUBLISHED',
    }));
  const routePaths = new Set(routes.map((route) => route.path));
  const sourcePaths = new Set<string>();
  for (const redirect of redirects) {
    if (!redirectIdPattern.test(redirect.id)) throw new Error('Некорректный id опубликованного redirect');
    for (const [field, path] of [['sourcePath', redirect.sourcePath], ['targetPath', redirect.targetPath]] as const) {
      if (!redirectPathPattern.test(path) || path.includes('//') || path.includes('..')) {
        throw new Error(`Некорректный ${field} опубликованного redirect: ${path || '(пусто)'}`);
      }
    }
    if (redirect.sourcePath === '/' || redirect.sourcePath === redirect.targetPath) throw new Error('Некорректная петля опубликованного redirect');
    if (sourcePaths.has(redirect.sourcePath)) throw new Error(`Дублируется sourcePath redirect: ${redirect.sourcePath}`);
    if (routePaths.has(redirect.sourcePath)) throw new Error(`sourcePath redirect занят опубликованным URL: ${redirect.sourcePath}`);
    sourcePaths.add(redirect.sourcePath);
  }
  for (const redirect of redirects) {
    if (sourcePaths.has(redirect.targetPath)) throw new Error(`Цепочка redirects запрещена: ${redirect.sourcePath} -> ${redirect.targetPath}`);
    if (!routePaths.has(redirect.targetPath)) throw new Error(`targetPath redirect не опубликован: ${redirect.targetPath}`);
  }
  return redirects;
}

function normalizeSitemap(value: unknown, routes: PublicRouteView[], seoByPath?: SiteCatalog['seoByPath']) {
  const raw = value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).excludedPaths)
    ? (value as { excludedPaths: unknown[] }).excludedPaths
    : [];
  const routePaths = new Set(routes.map((route) => route.path));
  const excludedPaths = raw.map((item) => normalizePublicHtmlPath(String(item || '')));
  const unique = new Set<string>();
  for (const path of excludedPaths) {
    if (path === '/' && seoByPath?.['/']?.indexState !== 'NOINDEX') throw new Error('Корневой URL нельзя исключить из sitemap без noindex');
    if (!routePaths.has(path)) throw new Error(`Sitemap исключает неизвестный опубликованный URL: ${path}`);
    if (unique.has(path)) throw new Error(`Sitemap содержит дублирующее исключение: ${path}`);
    unique.add(path);
  }
  if (seoByPath) for (const [path, meta] of Object.entries(seoByPath)) {
    if (meta.indexState === 'NOINDEX' && !unique.has(path)) throw new Error(`noindex URL отсутствует в исключениях sitemap: ${path}`);
  }
  return { excludedPaths: [...unique].sort() };
}

function normalizeSeoByPath(value: unknown, routes: PublicRouteView[]): SiteCatalog['seoByPath'] {
  if (value === undefined) return undefined; // Historical publication snapshot.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('API вернул некорректный SEO-снимок');
  const source = value as Record<string, any>;
  if (Object.keys(source).length !== routes.length) throw new Error('SEO-снимок не покрывает все маршруты Release 1');
  const normalized: NonNullable<SiteCatalog['seoByPath']> = {};
  for (const route of routes) {
    const meta = source[route.path];
    if (!meta || typeof meta.title !== 'string' || !meta.title.trim() || typeof meta.description !== 'string' || !meta.description.trim() || !['INDEX', 'NOINDEX'].includes(meta.indexState)) {
      throw new Error(`Некорректное SEO для маршрута ${route.path}`);
    }
    for (const field of ['ogTitle', 'ogDescription', 'ogImage'] as const) {
      if (meta[field] !== undefined && (typeof meta[field] !== 'string' || !meta[field].trim())) {
        throw new Error(`Некорректное поле ${field} SEO-снимка: ${route.path}`);
      }
    }
    normalized[route.path] = {
      title: meta.title.trim(), description: meta.description.trim(), indexState: meta.indexState,
      ogTitle: meta.ogTitle?.trim() || meta.title.trim(),
      ogDescription: meta.ogDescription?.trim() || meta.description.trim(),
      ogImage: meta.ogImage?.trim() || defaultSiteImagePath,
    };
  }
  return normalized;
}

const demoGlobalPages: PageView[] = [
  { type: 'COVERAGE', slug: 'karta-pokrytiya-provaydera', title: 'Карта покрытия', status: 'PUBLISHED', content: { text: 'Выберите город и проверьте возможность подключения по адресу.' } },
  { type: 'CITIES', slug: 'goroda-obsluzhivaniya', title: 'Города обслуживания', status: 'PUBLISHED', content: { text: 'Список опубликованных городов обслуживания.' } },
  { type: 'PRIVACY', slug: 'politika-konfidencialnosti', title: 'Политика конфиденциальности', status: 'PUBLISHED', content: { text: 'Демонстрационный текст политики конфиденциальности.' } },
  { type: 'PERSONAL_DATA_CONSENT', slug: 'soglasie-na-obrabotku-personalnyh-dannyh', title: 'Согласие на обработку персональных данных', status: 'PUBLISHED', content: { text: 'Демонстрационный текст согласия на обработку персональных данных.' } },
  { type: 'COOKIE_POLICY', slug: 'politika-obrabotki-faylov-kuki', title: 'Политика обработки файлов cookie', status: 'PUBLISHED', content: { text: 'Демонстрационный текст политики обработки файлов cookie.' } },
];
const demoCities: CityView[] = [{
  name: 'Казань',
  nameIn: 'Казани',
  slug: 'kazan',
  region: { name: 'Республика Татарстан', slug: 'respublika-tatarstan' },
  status: 'PUBLISHED',
  pages: [{
    type: 'HOME', slug: '', title: 'Домашний интернет в Казани', status: 'PUBLISHED', seo: {}, blocks: [
      { blockType: 'hero', data: { eyebrow: 'Дом.ру в Казани', title: 'Домашний интернет и телевидение в Казани', text: 'Выберите услугу и проверьте подключение по адресу.' } },
      { blockType: 'service_grid', data: { title: 'Услуги для дома', items: [{ pageType: 'INTERNET', title: 'Домашний интернет', text: 'Тарифы для квартиры и дома.' }] } },
      { blockType: 'tariff_grid', data: { title: 'Популярные тарифы' } },
      { blockType: 'steps', data: { title: 'Как проходит подключение', items: [{ title: 'Проверка адреса', text: 'Уточняем техническую возможность.' }, { title: 'Заявка', text: 'Оператор подтверждает условия.' }] } },
      { blockType: 'feature_grid', data: { title: 'Оборудование', items: [{ title: 'Wi-Fi-роутер', text: 'Условия предоставления уточнит оператор.' }] } },
      { blockType: 'feature_grid', data: { title: 'Что важно при выборе', items: [{ title: 'Скорость', text: 'Сравните опубликованные тарифы.' }] } },
      { blockType: 'faq', data: { title: 'Популярные вопросы', items: [{ question: 'Как проверить адрес?', answer: 'Введите точный адрес в форме на первом экране.' }] } },
    ],
  }],
  tariffs: [
    tariffView({ slug: 'internet-300', name: 'Интернет 300 Мбит/с', serviceType: 'INTERNET', speed: 300 }),
    tariffView({
      slug: 'internet-tv-500',
      name: 'Интернет + ТВ 500 Мбит/с',
      serviceType: 'INTERNET_TV',
      speed: 500,
      attributes: { tv_channels_total: 190, tv_channels_hd: 60 },
    }),
  ],
}];
const demoRoutes = expectedReleaseOneRoutes(demoCities, demoGlobalPages);
const demoCatalog: SiteCatalog = {
  site: { name: 'Дом.ру', slug: publicSiteSlug, connectionPhone: fallbackConnectionPhone, supportPhone: fallbackSupportPhone },
  globalPages: demoGlobalPages,
  routes: demoRoutes,
  redirects: [],
  sitemap: { excludedPaths: [] },
  cities: demoCities,
};

function normalizedCatalog(value: unknown): SiteCatalog {
  if (!value || typeof value !== 'object') throw new Error('API вернул некорректный каталог');
  const payload = value as Record<string, any>;
  if (!payload.site || !Array.isArray(payload.cities) || !Array.isArray(payload.globalPages)) {
    throw new Error('API вернул неполный каталог Release 1');
  }
  const cities = payload.cities
    .filter((item: Record<string, unknown>) => item?.status === 'PUBLISHED')
    .map((item: Record<string, any>) => {
      const slug = String(item.slug || '');
      if (!slugPattern.test(slug)) throw new Error(`Некорректный slug опубликованного города: ${slug || '(пусто)'}`);
      const regionName = String(item.region?.name || '').trim();
      const regionSlug = String(item.region?.slug || '').trim();
      if (!regionName || !slugPattern.test(regionSlug)) throw new Error(`Город «${item.name || slug}»: API не вернул корректный регион`);
      const city = {
        name: String(item.name || slug),
        nameIn: String(item.namePrepositional || item.name || slug),
        slug,
        region: { name: regionName, slug: regionSlug },
        status: 'PUBLISHED',
        pages: (Array.isArray(item.pages) ? item.pages : [])
          .filter((page: Record<string, unknown>) => page?.status === 'PUBLISHED')
          .map((page: Record<string, any>) => normalizePage(page)),
        tariffs: (Array.isArray(item.tariffs) ? item.tariffs : [])
          .filter((tariff: Record<string, unknown>) => tariff?.status === 'PUBLISHED')
          .map((tariff: Record<string, unknown>) => tariffView(tariff)),
      } satisfies CityView;
      assertCityHomeTemplate(city);
      return city;
    });
  const globalPages = payload.globalPages
    .filter((item: Record<string, unknown>) => item?.status === 'PUBLISHED')
    .map((item: Record<string, any>) => normalizePage(item));
  const expectedRoutes = expectedReleaseOneRoutes(cities, globalPages);
  const routes = normalizeRoutes(payload.routes, expectedRoutes);
  const redirects = normalizeRedirects(payload.redirects, routes);
  const seoByPath = normalizeSeoByPath(payload.seoByPath, routes);
  const sitemap = normalizeSitemap(payload.sitemap, routes, seoByPath);
  const connectionPhone = String(payload.site.connectionPhone || '').trim();
  const supportPhone = String(payload.site.supportPhone || '').trim();
  if (!connectionPhone || !supportPhone) throw new Error('API не вернул обязательные телефоны сайта');
  return {
    site: {
      name: String(payload.site.name || 'Дом.ру'),
      slug: String(payload.site.slug || publicSiteSlug),
      domain: typeof payload.site.domain === 'string' ? payload.site.domain : null,
      connectionPhone,
      supportPhone,
    },
    globalPages,
    routes,
    cities,
    redirects,
    sitemap,
    seoByPath,
  };
}

export function seoMeta(catalog: SiteCatalog, path: string, fallback: { title: string; description: string }) {
  const meta = catalog.seoByPath?.[path];
  if (catalog.seoByPath && !meta) throw new Error(`SEO-снимок не содержит ${path}`);
  return meta || { ...fallback, indexState: 'INDEX' as const, ogTitle: fallback.title, ogDescription: fallback.description, ogImage: defaultSiteImagePath };
}

let catalogPromise: Promise<SiteCatalog> | undefined;

export function loadSiteData(): Promise<SiteCatalog> {
  catalogPromise ??= (async () => {
    const apiUrl = import.meta.env.SITE_DATA_API_URL
      || import.meta.env.PUBLIC_API_URL
      || 'http://localhost:3000/api/v1';
    const publicationMode = process.env.SITE_DATA_PUBLICATION_MODE === 'processing';
    const publicationToken = process.env.SITE_DATA_API_TOKEN;
    const catalogPath = publicationMode
      ? `/internal/site-publications/${publicSiteSlug}/catalog`
      : `/public/sites/${publicSiteSlug}/cities`;
    try {
      if (publicationMode && !publicationToken) throw new Error('SITE_DATA_API_TOKEN is required for processing publication mode');
      const response = await fetch(`${apiUrl}${catalogPath}`, {
        signal: AbortSignal.timeout(5000),
        ...(publicationToken ? { headers: { 'x-admin-token': publicationToken } } : {}),
      });
      if (!response.ok) throw new Error(`API responded ${response.status}`);
      return normalizedCatalog(await response.json());
    } catch (error) {
      if (process.env.ALLOW_DEMO_DATA === 'true') {
        console.warn(`[site] ALLOW_DEMO_DATA=true: используются демонстрационные данные вместо ${apiUrl}. Причина: ${(error as Error).message}`);
        return demoCatalog;
      }
      throw new Error(
        `Не удалось получить каталог опубликованных городов из ${apiUrl}: ${(error as Error).message}. Поднимите API перед сборкой либо явно установите ALLOW_DEMO_DATA=true для демонстрационной сборки.`,
      );
    }
  })();
  return catalogPromise;
}

export function pageMeta(
  pages: PageView[],
  slug: string,
  fallbackTitle: string,
  fallbackDescription: string,
) {
  const seo = pages.find((page) => page.slug === slug)?.seo;
  return {
    title: typeof seo?.title === 'string' && seo.title ? seo.title : fallbackTitle,
    description: typeof seo?.description === 'string' && seo.description ? seo.description : fallbackDescription,
  };
}

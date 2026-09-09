import { tariffView, type TariffView } from './tariff-view';

export interface PageView {
  type: string;
  slug: string;
  title?: string;
  status: string;
  seo?: Record<string, unknown> | null;
  blocks?: Array<{ blockType: string; data: Record<string, unknown> }>;
}

export interface CityView {
  name: string;
  nameIn: string;
  slug: string;
  phone: string;
  status: string;
  pages: PageView[];
  tariffs: TariffView[];
}

export interface SiteView {
  name: string;
  slug: string;
  domain?: string | null;
}

export interface SiteCatalog {
  site: SiteView;
  cities: CityView[];
}

export const publicSiteSlug = import.meta.env.PUBLIC_SITE_SLUG || 'domru-kazan';
const fallbackPhone = import.meta.env.PUBLIC_SUPPORT_PHONE || '8 (800) 000-00-00';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertUniquePublishedPaths(cities: CityView[]) {
  const citySlugs = new Set<string>();
  for (const city of cities) {
    if (citySlugs.has(city.slug)) throw new Error(`Конфликт опубликованного URL /${city.slug}/: дублируется slug города`);
    citySlugs.add(city.slug);
    const resources = new Map<string, string>();
    const register = (slug: string, owner: string) => {
      if (!slugPattern.test(slug)) throw new Error(`Некорректный slug опубликованного ресурса в городе ${city.slug}: ${slug || '(пусто)'}`);
      const current = resources.get(slug);
      if (current) throw new Error(`Конфликт опубликованного URL /${city.slug}/${slug}/: ${current} и ${owner}`);
      resources.set(slug, owner);
    };
    for (const page of city.pages) {
      if (page.type !== 'HOME' && page.type !== 'TARIFF') register(page.slug, `страница ${page.type}`);
    }
    for (const tariff of city.tariffs) register(tariff.slug, `тариф ${tariff.name}`);
  }
}

const demoPages: PageView[] = [
  { type: 'HOME', slug: '', title: 'Домашний интернет в Казани', status: 'PUBLISHED', seo: {}, blocks: [] },
  { type: 'INTERNET', slug: 'internet', title: 'Домашний интернет в Казани', status: 'PUBLISHED', seo: {}, blocks: [] },
  { type: 'INTERNET_TV', slug: 'internet-tv', title: 'Интернет и ТВ в Казани', status: 'PUBLISHED', seo: {}, blocks: [] },
  { type: 'TV', slug: 'tv', title: 'Телевидение в Казани', status: 'PUBLISHED', seo: {}, blocks: [] },
  { type: 'ADDRESS_CHECK', slug: 'proverka-adresa', title: 'Проверка адреса в Казани', status: 'PUBLISHED', seo: {}, blocks: [] },
  { type: 'FAQ', slug: 'faq', title: 'Вопросы и ответы — Казань', status: 'PUBLISHED', seo: {}, blocks: [] },
];

const demoCatalog: SiteCatalog = {
  site: { name: 'Дом.ру', slug: publicSiteSlug },
  cities: [{
    name: 'Казань',
    nameIn: 'Казани',
    slug: 'kazan',
    phone: fallbackPhone,
    status: 'PUBLISHED',
    pages: demoPages,
    tariffs: [
      tariffView({ slug: 'internet-300', name: 'Интернет 300 Мбит/с', serviceType: 'INTERNET', speed: 300 }),
      tariffView({ slug: 'internet-tv-500', name: 'Интернет + ТВ 500 Мбит/с', serviceType: 'INTERNET_TV', speed: 500 }),
    ],
  }],
};

function normalizedCatalog(value: unknown): SiteCatalog {
  if (!value || typeof value !== 'object') throw new Error('API вернул некорректный каталог');
  const payload = value as Record<string, any>;
  if (!payload.site || !Array.isArray(payload.cities)) throw new Error('API вернул неполный каталог');
  const cities = payload.cities
    .filter((item: Record<string, unknown>) => item?.status === 'PUBLISHED')
    .map((item: Record<string, any>) => {
      const slug = String(item.slug || '');
      if (!slugPattern.test(slug)) throw new Error(`Некорректный slug опубликованного города: ${slug || '(пусто)'}`);
      return {
        name: String(item.name || slug),
        nameIn: String(item.namePrepositional || item.name || slug),
        slug,
        phone: String(item.phone || fallbackPhone),
        status: 'PUBLISHED',
        pages: (Array.isArray(item.pages) ? item.pages : [])
          .filter((page: Record<string, unknown>) => page?.status === 'PUBLISHED')
          .map((page: Record<string, any>) => ({ ...page, type: String(page.type), slug: String(page.slug || ''), status: 'PUBLISHED' })),
        tariffs: (Array.isArray(item.tariffs) ? item.tariffs : [])
          .filter((tariff: Record<string, unknown>) => tariff?.status === 'PUBLISHED')
          .map((tariff: Record<string, unknown>) => tariffView(tariff)),
      } satisfies CityView;
    });

  const catalog = {
    site: {
      name: String(payload.site.name || 'Дом.ру'),
      slug: String(payload.site.slug || publicSiteSlug),
      domain: typeof payload.site.domain === 'string' ? payload.site.domain : null,
    },
    cities,
  };
  assertUniquePublishedPaths(cities);
  return catalog;
}

let catalogPromise: Promise<SiteCatalog> | undefined;

export function loadSiteData(): Promise<SiteCatalog> {
  catalogPromise ??= (async () => {
    const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    try {
      const response = await fetch(`${apiUrl}/public/sites/${publicSiteSlug}/cities`, { signal: AbortSignal.timeout(5000) });
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

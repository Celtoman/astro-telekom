import { tariffView, type TariffView } from './tariff-view';

export interface CityView {
  name: string;
  nameIn: string;
  slug: string;
  phone: string;
}

export interface PageView {
  type?: string;
  slug?: string;
  seo?: Record<string, unknown> | null;
  blocks?: Array<{ blockType: string; data: Record<string, unknown> }>;
}

export const city: CityView = {
  name: 'Казань',
  nameIn: 'Казани',
  slug: 'kazan',
  phone: '8 (800) 000-00-00',
};

export const tariffs: TariffView[] = [
  {
    slug: 'internet-300',
    name: 'Интернет 300 Мбит/с',
    service: 'Домашний интернет',
    speed: 'до 300 Мбит/с',
    price: 'Цена уточняется',
  },
  {
    slug: 'internet-tv-500',
    name: 'Интернет + ТВ 500 Мбит/с',
    service: 'Интернет и телевидение',
    speed: 'до 500 Мбит/с',
    price: 'Цена уточняется',
  },
];

export async function loadKazanData(): Promise<{ city: CityView; tariffs: TariffView[]; pages: PageView[] }> {
  const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  try {
    const response = await fetch(`${apiUrl}/public/sites/domru-kazan/cities/kazan`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`API responded ${response.status}`);
    const data = await response.json();
    return {
      city: { name: data.name, nameIn: data.name === 'Казань' ? 'Казани' : data.name, slug: data.slug, phone: data.phone || city.phone },
      pages: data.pages || [],
      tariffs: (data.tariffs || []).map(tariffView),
    };
  } catch {
    return { city, tariffs, pages: [] };
  }
}

export function pageMeta(
  pages: Array<{ slug?: string; seo?: Record<string, unknown> | null }>,
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

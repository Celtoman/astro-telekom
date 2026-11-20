type MenuItem = { slug?: string; name?: string; tariffs?: MenuItem[]; type?: string; title?: string };
type MenuRoute = { path: string; kind: string; citySlug?: string; tariffSlug?: string; pageType?: string };
type MenuCatalog = { routes?: MenuRoute[]; cities?: MenuItem[]; globalPages?: MenuItem[] };

function label(route: MenuRoute, city?: MenuItem, tariff?: MenuItem, page?: MenuItem) {
  if (route.kind === 'HOME') return 'Главная сайта';
  if (route.kind === 'CITY_HOME') return city?.name || route.citySlug;
  if (route.kind === 'CITY_SUPPORT') return `Поддержка — ${city?.name || route.citySlug}`;
  if (route.kind === 'CITY_ADDRESS_CHECK') return `Проверка подключения — ${city?.name || route.citySlug}`;
  if (route.kind === 'CITY_TARIFF_DETAIL') return `${tariff?.name || route.tariffSlug} — ${city?.name || route.citySlug}`;
  return page?.title || route.pageType || route.path;
}

export function previewRouteLabel(catalog: MenuCatalog, route: MenuRoute) {
  const city = (catalog.cities ?? []).find(item => item.slug === route.citySlug);
  const tariff = city?.tariffs?.find(item => item.slug === route.tariffSlug);
  const page = (catalog.globalPages ?? []).find(item => item.type === route.pageType);
  return label(route, city, tariff, page) ?? route.path;
}

export function previewRouteOptions(catalog: MenuCatalog | null | undefined) {
  const cities = new Map((catalog?.cities ?? []).map(city => [city.slug, city]));
  const tariffs = new Map((catalog?.cities ?? []).map(city => [city.slug, new Map((city.tariffs ?? []).map(tariff => [tariff.slug, tariff]))]));
  const pages = new Map((catalog?.globalPages ?? []).map(page => [page.type, page]));
  return (catalog?.routes ?? []).map(route => ({
    path: String(route.path || ''), kind: String(route.kind || ''),
    label: label(route, cities.get(route.citySlug), tariffs.get(route.citySlug)?.get(route.tariffSlug), pages.get(route.pageType)) ?? route.path,
  }));
}

import type { PublicRouteView, SiteCatalog } from './site';

export const sitemapFiles = {
  pages: 'sitemap-pages.xml',
  cities: 'sitemap-cities.xml',
  tariffs: 'sitemap-tariffs.xml',
} as const;

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function sitemapRoutes(catalog: SiteCatalog, group: keyof typeof sitemapFiles) {
  const excluded = new Set(catalog.sitemap.excludedPaths);
  return catalog.routes.filter((route) => !excluded.has(route.path) && routeGroup(route) === group);
}

function routeGroup(route: PublicRouteView): keyof typeof sitemapFiles {
  if (route.kind === 'CITY_HOME') return 'cities';
  if (route.kind === 'CITY_TARIFF_DETAIL') return 'tariffs';
  return 'pages';
}

export function sitemapUrlset(origin: string, routes: PublicRouteView[]) {
  const urls = routes.map((route) => `<url><loc>${escapeXml(`${origin}${route.path}`)}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export function sitemapIndex(origin: string) {
  const entries = Object.values(sitemapFiles).map((file) => `<sitemap><loc>${escapeXml(`${origin}/${file}`)}</loc></sitemap>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
}

export function xmlResponse(body: string) {
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}

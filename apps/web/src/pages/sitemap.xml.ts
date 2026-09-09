import { loadSiteData } from '../data/site';

export async function GET({ site }: { site?: URL }) {
  const { cities } = await loadSiteData();
  const baseUrl = site?.origin || 'http://localhost:4321';
  const paths = [
    '/',
    ...cities.flatMap((city) => [
      `/${city.slug}/`,
      ...city.pages.filter((page) => page.type !== 'HOME' && page.type !== 'TARIFF' && page.slug).map((page) => `/${city.slug}/${page.slug}/`),
      ...city.tariffs.map((tariff) => `/${city.slug}/${tariff.slug}/`),
    ]),
  ];
  const urls = paths.map((path) => `<url><loc>${baseUrl}${path}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

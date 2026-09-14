import { loadSiteData } from '../data/site';

export async function GET({ site }: { site?: URL }) {
  const { routes } = await loadSiteData();
  const baseUrl = site?.origin || 'http://localhost:4321';
  const urls = routes.map((route) => `<url><loc>${baseUrl}${route.path}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

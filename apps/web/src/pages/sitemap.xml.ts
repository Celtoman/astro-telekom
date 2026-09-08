import { loadKazanData } from '../data/kazan';

export async function GET({ site }: { site?: URL }) {
  const { tariffs } = await loadKazanData();
  const baseUrl = site?.origin || 'http://localhost:4321';
  const paths = [
    '/',
    '/kazan/',
    '/kazan/internet/',
    '/kazan/internet-tv/',
    '/kazan/tv/',
    '/kazan/proverka-adresa/',
    '/kazan/faq/',
    ...tariffs.map((tariff) => `/kazan/${tariff.slug}/`),
  ];
  const urls = paths.map((path) => `<url><loc>${baseUrl}${path}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

import { loadSiteData } from '../data/site';
import { sitemapRoutes, sitemapUrlset, xmlResponse } from '../data/sitemap';

export async function GET({ site }: { site?: URL }) {
  const catalog = await loadSiteData();
  return xmlResponse(sitemapUrlset(site?.origin || 'http://localhost:4321', sitemapRoutes(catalog, 'tariffs')));
}

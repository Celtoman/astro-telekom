import { sitemapIndex, xmlResponse } from '../data/sitemap';

export async function GET({ site }: { site?: URL }) {
  const baseUrl = site?.origin || 'http://localhost:4321';
  return xmlResponse(sitemapIndex(baseUrl));
}

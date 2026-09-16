import { BadRequestException } from '@nestjs/common';
import { normalizeRedirectPath } from './redirect-path';

export const SITEMAP_FILES = {
  PAGES: 'sitemap-pages.xml',
  CITIES: 'sitemap-cities.xml',
  TARIFFS: 'sitemap-tariffs.xml',
} as const;

export type SitemapGroup = keyof typeof SITEMAP_FILES;

export type SitemapExclusionInput = { path: string; reason: string };

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function normalizeSitemapOrigin(value: string) {
  const candidate = value.trim();
  if (!candidate) throw new BadRequestException('Origin sitemap не настроен');
  let url: URL;
  try {
    url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
  } catch {
    throw new BadRequestException('Origin sitemap должен быть корректным HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new BadRequestException('Origin sitemap должен быть корректным HTTP(S) URL');
  }
  return url.origin;
}

export function buildSitemapXml(origin: string, paths: string[]) {
  const normalizedOrigin = normalizeSitemapOrigin(origin);
  const urls = paths.map((path) => `<url><loc>${escapeXml(`${normalizedOrigin}${path}`)}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export function buildSitemapIndexXml(origin: string, files: string[]) {
  const normalizedOrigin = normalizeSitemapOrigin(origin);
  const sitemaps = files.map((file) => `<sitemap><loc>${escapeXml(`${normalizedOrigin}/${file}`)}</loc></sitemap>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps}</sitemapindex>`;
}

export function sitemapGroupForRoute(kind: string): SitemapGroup {
  if (kind === 'CITY_HOME') return 'CITIES';
  if (kind === 'CITY_TARIFF_DETAIL') return 'TARIFFS';
  return 'PAGES';
}

export function validateSitemapExclusions(input: SitemapExclusionInput[], eligiblePaths: Set<string>) {
  const seen = new Set<string>();
  return input.map((item, index) => {
    const path = normalizeRedirectPath(item.path, 'targetPath');
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    if (path === '/') throw new BadRequestException('Корневой URL нельзя исключить из sitemap');
    if (!eligiblePaths.has(path)) throw new BadRequestException(`URL ${path} не является опубликованным маршрутом`);
    if (seen.has(path)) throw new BadRequestException(`URL ${path} дублируется в исключениях`);
    if (!reason) throw new BadRequestException(`Укажите причину исключения для ${path}`);
    if (reason.length > 500) throw new BadRequestException(`Причина исключения #${index + 1} длиннее 500 символов`);
    seen.add(path);
    return { path, reason };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

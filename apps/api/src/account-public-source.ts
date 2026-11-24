import { BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { globalPageType, servingGlobalProjection, servingPublication } from './serving-publication-context';
import { extractDomruLocation, normalizeDomruLocality, normalizeDomruRegion } from './domru-profile-catalog';

/** A global source never borrows a city's page or the example city from a mockup. */
export async function accountPublicSource(prisma: PrismaService, siteSlug: string, pageSlug?: string) {
  const type = globalPageType(pageSlug);
  if (!type) throw new BadRequestException('Неизвестная общая страница обращения');
  const projected = await servingGlobalProjection(prisma, siteSlug, pageSlug, type);
  if (projected) {
    const { site, page, cities } = projected.data;
    if (!page?.id) throw new BadRequestException('Общая страница недоступна в обслуживаемой публикации');
    return { site: { ...site, id: projected.publication.siteId }, page, cities, publication: projected.publication };
  }
  const publication = await servingPublication(prisma, siteSlug);
  if (publication) {
    const catalog = publication.catalog as any;
    const page = catalog.globalPages?.find((p: any) => p.type === type && p.slug === pageSlug);
    if (!page?.id) throw new BadRequestException('Общая страница недоступна в обслуживаемой публикации');
    return { site: { ...catalog.site, id: publication.siteId }, page, cities: catalog.cities as any[], publication };
  }
  const site = await prisma.site.findFirst({ where: { slug: siteSlug, status: 'PUBLISHED' } });
  if (!site) throw new BadRequestException('Сайт недоступен');
  const page = await prisma.page.findFirst({ where: { siteId: site.id, cityId: null, type, slug: pageSlug, status: 'PUBLISHED' } });
  if (!page) throw new BadRequestException('Общая страница недоступна');
  const cities = await prisma.city.findMany({ where: { siteId: site.id, status: 'PUBLISHED' }, include: { region: { select: { name: true } } } });
  return { site, page, cities, publication: null };
}

export function accountAddressCity(cities: Array<{ id: string; slug: string; name: string; region: { name: string } }>, data: Record<string, unknown>) {
  const location = extractDomruLocation(data);
  if (!location || !normalizeDomruRegion(location.region)) throw new BadRequestException('Не удалось подтвердить город и регион адреса. Выберите дом из подсказок.');
  const matches = cities.filter(city => normalizeDomruLocality(city.name) === normalizeDomruLocality(location.locality)
    && normalizeDomruRegion(city.region.name) === normalizeDomruRegion(location.region));
  if (matches.length !== 1) throw new BadRequestException('Город выбранного адреса отсутствует в опубликованном каталоге');
  return matches[0];
}

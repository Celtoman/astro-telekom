import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated';
import { supportPageDefaults } from './support-page-defaults';
import { SUPPORT_PAGE_SLUG, SUPPORT_PAGE_VERSION, SUPPORT_SECTION_ORDER } from './support-page-model';

export async function ensureSupportTemplate(tx: Prisma.TransactionClient, siteId: string) {
  const content = supportPageDefaults();
  return tx.pageTemplate.upsert({ where: { siteId_kind: { siteId, kind: 'CITY_SUPPORT' } }, update: {}, create: {
    siteId, kind: 'CITY_SUPPORT', status: 'PUBLISHED', titleTemplate: content.hero.h1,
    content: { supportVersion: SUPPORT_PAGE_VERSION },
    blocks: { create: SUPPORT_SECTION_ORDER.map((key,index) => ({ blockType: 'support.' + key, position: (index+1)*10, visible: true, data: content[key] as Prisma.InputJsonObject, source: 'support:init' })) },
  } });
}
export async function ensureCitySupportPage(tx: Prisma.TransactionClient, city: { id: string; siteId: string }) {
  const template = await tx.pageTemplate.findUnique({ where: { siteId_kind: { siteId: city.siteId, kind: 'CITY_SUPPORT' } } });
  if (!template) return null;
  const existing = await tx.page.findUnique({ where: { cityId_slug: { cityId: city.id, slug: SUPPORT_PAGE_SLUG } } });
  if (existing) {
    if (existing.type !== 'CITY_SUPPORT' || existing.templateId !== template.id) throw new BadRequestException('Адрес поддержки занят другой страницей; существующее содержание сохранено.');
    return existing;
  }
  return tx.page.create({ data: { siteId: city.siteId, cityId: city.id, type: 'CITY_SUPPORT', slug: SUPPORT_PAGE_SLUG, status: 'PUBLISHED', templateId: template.id, title: template.titleTemplate } });
}

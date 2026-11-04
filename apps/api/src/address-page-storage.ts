import { Prisma } from '../generated';
import { ADDRESS_PAGE_METADATA, ADDRESS_PAGE_SLUG } from './address-page-model';
import { addressPageDefaultBlocks } from './address-page-defaults';

export async function ensureAddressTemplate(tx: Prisma.TransactionClient, siteId: string) {
  return tx.pageTemplate.upsert({ where: { siteId_kind: { siteId, kind: 'CITY_ADDRESS_CHECK' } }, update: {}, create: {
    siteId, kind: 'CITY_ADDRESS_CHECK', status: 'PUBLISHED', titleTemplate: 'Проверка подключения Дом.ру по адресу в {CITY_NAME_PREPOSITIONAL}', content: { ...ADDRESS_PAGE_METADATA },
    blocks: { create: addressPageDefaultBlocks().map((block, index) => ({ ...block, position: (index + 1) * 10, visible: true, source: 'address-page:init' })) },
  } });
}

/** Only create dependent pages when this site's ADDRESS rollout has been initialized. */
export async function ensureCityAddressPage(tx: Prisma.TransactionClient, city: { id: string; siteId: string; namePrepositional?: string | null }) {
  const template = await tx.pageTemplate.findUnique({ where: { siteId_kind: { siteId: city.siteId, kind: 'CITY_ADDRESS_CHECK' } } });
  if (!template) return null;
  return tx.page.upsert({ where: { cityId_slug: { cityId: city.id, slug: ADDRESS_PAGE_SLUG } }, update: {}, create: {
    siteId: city.siteId, cityId: city.id, type: 'ADDRESS_CHECK', slug: ADDRESS_PAGE_SLUG, status: 'PUBLISHED', templateId: template.id, title: template.titleTemplate,
  } });
}

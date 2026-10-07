import type { Prisma } from '../generated';
import { CITY_HOME_SEQUENCE, tariffCollectionDefaults } from './tariff-collection-model';
export const CITY_HOME_TEMPLATE_SOURCE = 'template:city-home:v2';
export const CITY_HOME_BLOCK_SEQUENCE = CITY_HOME_SEQUENCE;
export function cityHomeTemplateBlocks(city: { name: string; namePrepositional?: string | null }): Prisma.PageBlockCreateWithoutPageInput[] {
  const cityIn = city.namePrepositional?.trim() || city.name.trim();
  return [
    { blockType: 'hero', position: 10, visible: true, source: CITY_HOME_TEMPLATE_SOURCE, data: {
      eyebrow: `Дом.ру в ${cityIn}`, title: `Домашний интернет и телевидение в ${cityIn}`,
      text: 'Сравните опубликованные тарифы, проверьте возможность подключения по адресу и оставьте заявку на консультацию.',
    } },
    { blockType: 'tariff_grid', position: 30, visible: true, source: CITY_HOME_TEMPLATE_SOURCE, data: tariffCollectionDefaults() },
  ];
}

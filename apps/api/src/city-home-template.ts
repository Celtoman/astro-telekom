import type { Prisma } from '../generated';
import { CITY_HOME_BLOCK_ORDER } from './city-home-model';
import { cityHomeDefaultBlocks } from './city-home-defaults';
export const CITY_HOME_TEMPLATE_SOURCE = 'template:city-home:v3';
export const CITY_HOME_BLOCK_SEQUENCE = CITY_HOME_BLOCK_ORDER;
export function cityHomeTemplateBlocks(city: { name: string; namePrepositional?: string | null }): Prisma.PageBlockCreateWithoutPageInput[] {
  const cityIn = city.namePrepositional?.trim() || city.name.trim();
  return cityHomeDefaultBlocks().map((block, index) => ({
    blockType: block.blockType, position: (index + 1) * 10, visible: true, source: CITY_HOME_TEMPLATE_SOURCE,
    data: block.blockType === 'hero' ? { ...block.data, title: `Домашний интернет и телевидение в ${cityIn}` } : block.data,
  }));
}

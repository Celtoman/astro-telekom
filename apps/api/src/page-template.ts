import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated';
import { cityHomeTemplateBlocks } from './city-home-template';
import type { CatalogSource } from './site-catalog.service';
import type { PublicationWorkflowService } from './publication-workflow.service';
import { FIRST_SCREEN_IMPLEMENTATION, FIRST_SCREEN_VERSION } from './first-screen';

import { projectCityHomeBlocks, TARIFF_COLLECTION_VERSION, TARIFF_COLLECTION_IMPLEMENTATION } from './tariff-collection-model';
import { cityHomeFromTemplate } from './city-home-view';
import { CITY_HOME_METADATA } from './city-home-model';
import { materializeAddressPageSource } from './address-page-view';
import { materializeSupportPageSource } from './support-page-view';

const CITY_TOKEN = '{CITY_NAME_PREPOSITIONAL}';

export async function ensureCityHomeTemplate(
  tx: Prisma.TransactionClient,
  siteId: string,
  publications?: PublicationWorkflowService,
  actorId?: string,
) {
  const existing = await tx.pageTemplate.findUnique({ where: { siteId_kind: { siteId, kind: 'CITY_HOME' } } });
  if (existing) return existing;
  const blocks = cityHomeTemplateBlocks({ name: CITY_TOKEN, namePrepositional: CITY_TOKEN });
  const template = await tx.pageTemplate.create({
    data: {
      siteId, kind: 'CITY_HOME', status: 'PUBLISHED',
      titleTemplate: `Домашний интернет в ${CITY_TOKEN}`,
      content: { firstScreenPassportVersion: FIRST_SCREEN_VERSION, firstScreenImplementationVersion: FIRST_SCREEN_IMPLEMENTATION, tariffCollectionPassportVersion: TARIFF_COLLECTION_VERSION, tariffCollectionImplementationVersion: TARIFF_COLLECTION_IMPLEMENTATION, ...CITY_HOME_METADATA },
      blocks: { create: blocks.map(({ blockType, position, visible, data, source }) => ({
        blockType, position, visible, data, source,
      })) },
    },
    include: { blocks: true },
  });
  if (publications) await publications.recordWorkingRevision(tx, {
    siteId, entityType: 'PAGE_TEMPLATE', entityId: template.id, action: 'CREATE',
    snapshot: template as unknown as Record<string, unknown>,
    changedFields: ['titleTemplate', 'content', 'blocks'], actorId,
    source: 'city-home-template:init',
  });
  return template;
}

export function materializeCityHomeSource<T extends CatalogSource>(source: T): T {
  source = materializeAddressPageSource(source);
  source = materializeSupportPageSource(source);
  if (!source.pageTemplates?.length) {
    if (source.cities.some((city: any) => city.pages.some((page: any) => page.type === 'HOME' && page.templateId))) {
      throw new BadRequestException('Не найден шаблон городской HOME');
    }
    return { ...source, cities: source.cities.map((city: any) => ({ ...city, pages: city.pages.map((page: any) => page.type === 'HOME' ? { ...page, blocks: projectCityHomeBlocks(page.blocks || []) } : page) })) };
  }
  const templates = new Map(source.pageTemplates.map((template: any) => [template.id, template]));
  const homeTemplate = source.pageTemplates.find((template: any) => template.kind === 'CITY_HOME');
  if (homeTemplate) cityHomeFromTemplate(homeTemplate);
  return {
    ...source,
    cities: source.cities.map((city: any) => ({
      ...city,
      pages: city.pages.map((page: any) => {
        if (page.type !== 'HOME') return page;
        const template = templates.get(page.templateId);
        if (!template || template !== homeTemplate || template.status !== 'PUBLISHED') {
          throw new BadRequestException(`Городская HOME «${city.name}» не связана с опубликованным шаблоном`);
        }
        const legacyByPosition = new Map((page.blocks || []).map((block: any) => [block.position, block]));
        const blocks = projectCityHomeBlocks<any>(template.blocks).map((block: any) => {
          const legacy = legacyByPosition.get(block.position) as any;
          return {
            id: legacy?.id || block.id,
            pageId: page.id,
            blockType: block.blockType,
            position: block.position,
            visible: block.visible,
            data: block.data,
            source: legacy ? legacy.source : block.source,
            archivedAt: null,
          };
        });
        const { templateId: _templateId, ...pageData } = page;
        return { ...pageData, title: template.titleTemplate, content: template.content,
          seo: {}, blocks };
      }),
    })),
  };
}

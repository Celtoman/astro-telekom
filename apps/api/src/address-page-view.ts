import { BadRequestException } from '@nestjs/common';
import { ContentValidationError } from './content-validation-error';
import { ADDRESS_PAGE_IMPLEMENTATION, ADDRESS_PAGE_SLUG, ADDRESS_PAGE_VERSION, type AddressPageBlock } from './address-page-model';
import { validateAddressPageComposition } from './address-page';

export interface AddressPageView { version: string; implementationVersion: string; blocks: (AddressPageBlock & { id: string })[] }
interface TemplateSource { id?: string; kind: string; status?: string; titleTemplate?: string; content?: any; blocks?: readonly { id?: string; blockType: string; position: number; visible: boolean; data: any; source?: string | null }[] }
export function addressPageFromTemplate(template: TemplateSource, draft = false): AddressPageView {
  if (template.kind !== 'CITY_ADDRESS_CHECK' || template.content?.addressCheckCompositionVersion !== ADDRESS_PAGE_VERSION || template.content?.addressCheckImplementationVersion !== ADDRESS_PAGE_IMPLEMENTATION) {
    throw new ContentValidationError('addressCheckCompositionVersion', 'VERSION', 'Неизвестная версия или реализация ADDRESS.');
  }
  const blocks = Array.from(template.blocks ?? []).sort((a, b) => a.position - b.position);
  if (blocks.some((block, index) => block.visible !== true || block.position !== (index + 1) * 10 || typeof block.id !== 'string' || !block.id)
    || new Set(blocks.map(block => block.id)).size !== blocks.length) throw new ContentValidationError('blocks', 'COMPOSITION', 'Нарушены идентификаторы, видимость или позиции ADDRESS.');
  validateAddressPageComposition(blocks.map(({ blockType, data }) => ({ blockType, data })), { draft });
  return { version: ADDRESS_PAGE_VERSION, implementationVersion: ADDRESS_PAGE_IMPLEMENTATION,
    blocks: blocks.map(({ id, blockType, data }) => ({ id: id!, blockType, data })) as AddressPageView['blocks'] };
}

/** Materialization reads a captured snapshot; it never writes page rows or published history. */
export function materializeAddressPageSource<T extends { cities: any[]; pageTemplates?: any[] }>(source: T): T {
  const template = source.pageTemplates?.find(item => item.kind === 'CITY_ADDRESS_CHECK');
  if (!template) return source;
  if (template.status !== 'PUBLISHED') throw new BadRequestException('Шаблон проверки подключения должен быть опубликован.');
  addressPageFromTemplate(template);
  return { ...source, cities: source.cities.map(city => ({ ...city, pages: city.pages.map((page: any) => {
    if (page.type !== 'ADDRESS_CHECK' || page.slug !== ADDRESS_PAGE_SLUG) return page;
    if (page.templateId !== template.id) throw new BadRequestException(`Страница проверки подключения «${city.name}» не связана с общим шаблоном`);
    const { templateId: _templateId, ...pageData } = page;
    return { ...pageData, title: template.titleTemplate, content: template.content,
      blocks: template.blocks.map((block: any) => ({ ...block, pageId: page.id, archivedAt: null })) };
  }) })) };
}

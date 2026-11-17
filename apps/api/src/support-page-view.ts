import { BadRequestException } from '@nestjs/common';
import { ContentValidationError } from './content-validation-error';
import { SUPPORT_PAGE_SLUG, SUPPORT_PAGE_VERSION, SUPPORT_SECTION_ORDER, type SupportPageContent } from './support-page-model';
import { validateSupportPage } from './support-page';

interface SupportTemplate { id?: string; kind: string; status?: string; titleTemplate?: string; content?: any; blocks?: readonly { id?: string; blockType: string; position: number; visible: boolean; data: any }[] }
export function supportPageFromTemplate(template: SupportTemplate, draft = false): SupportPageContent {
  const fail = (message: string): never => { throw new ContentValidationError('blocks', 'COMPOSITION', message); };
  if (template.kind !== 'CITY_SUPPORT' || template.content?.supportVersion !== SUPPORT_PAGE_VERSION) fail('Неизвестная версия CITY_SUPPORT.');
  const blocks = [...template.blocks ?? []].sort((a,b) => a.position - b.position);
  if (blocks.length !== SUPPORT_SECTION_ORDER.length || blocks.some((b,i) => b.blockType !== 'support.' + SUPPORT_SECTION_ORDER[i] || b.position !== (i+1)*10 || b.visible !== true || !b.id) || new Set(blocks.map(b=>b.id)).size !== blocks.length) fail('Нарушены состав, позиции, видимость или идентификаторы CITY_SUPPORT.');
  const content = { version: SUPPORT_PAGE_VERSION, ...Object.fromEntries(blocks.map((b,i)=>[SUPPORT_SECTION_ORDER[i], b.data])) } as SupportPageContent;
  validateSupportPage(content, draft);
  return content;
}
/** Only project a captured version; never expand an old snapshot or write page rows. */
export function materializeSupportPageSource<T extends { cities: any[]; pageTemplates?: any[] }>(source: T): T {
  const templates = source.pageTemplates?.filter(t=>t.kind === 'CITY_SUPPORT') ?? [];
  if (!templates.length) return source;
  if (templates.length !== 1 || templates[0].status !== 'PUBLISHED') throw new BadRequestException('Нужен единственный опубликованный шаблон CITY_SUPPORT.');
  const template = templates[0], content = supportPageFromTemplate(template);
  return { ...source, cities: source.cities.map(city => {
    const pages = city.pages.filter((p:any)=>p.type === 'CITY_SUPPORT');
    if (pages.length !== 1 || pages[0].slug !== SUPPORT_PAGE_SLUG || pages[0].templateId !== template.id) throw new BadRequestException('Город «' + city.name + '» не связан с единственным шаблоном поддержки.');
    if (!city.namePrepositional?.trim()) throw new BadRequestException('CITY_SUPPORT: заполните предложный падеж города «' + city.name + '».');
    return { ...city, pages: city.pages.map((page:any) => {
      if (page !== pages[0]) return page;
      const { templateId: _id, ...rest } = page;
      return { ...rest, supportTemplateId: template.id, title: content.hero.h1, content: structuredClone(content), blocks: [] };
    }) };
  }) };
}

import { ContentValidationError } from './content-validation-error';
import { CITY_HOME_IMPLEMENTATION, CITY_HOME_VERSION, CITY_HOME_HIDDEN_LEGACY_TYPES, type CityHomeBlock } from './city-home-model';
import { validateCityHomeComposition } from './city-home';
import { FIRST_SCREEN_VERSION } from './first-screen';
import { TARIFF_COLLECTION_VERSION } from './tariff-collection-model';

export interface CityHomeView { version: string; implementationVersion: string; blocks: (CityHomeBlock & { id: string })[] }
interface TemplateSource { kind: string; content?: any; blocks?: readonly { id?: string; blockType: string; position: number; visible: boolean; data: any }[] }
export function cityHomeFromTemplate(template: TemplateSource, draft = false): CityHomeView | null {
  const content = template.content && typeof template.content === 'object' && !Array.isArray(template.content) ? template.content : {};
  const all = Array.from(template.blocks ?? []);
  if (!content.homeCompositionVersion || content.homeCompositionVersion === '2.0.0') {
    if (all.some(block => block.blockType?.startsWith('city.'))) throw new ContentValidationError('homeCompositionVersion', 'VERSION', 'Новая CITY_HOME требует явной версии 3.0.0.');
    return null;
  }
  if (template.kind !== 'CITY_HOME' || content.homeCompositionVersion !== CITY_HOME_VERSION || content.cityHomeImplementationVersion !== CITY_HOME_IMPLEMENTATION) {
    throw new ContentValidationError('homeCompositionVersion', 'VERSION', 'Неизвестная версия или реализация CITY_HOME.');
  }
  if (content.firstScreenPassportVersion !== FIRST_SCREEN_VERSION) throw new ContentValidationError('firstScreenPassportVersion', 'VERSION', 'CITY_HOME требует согласованный паспорт первого экрана.');
  if (content.tariffCollectionPassportVersion !== TARIFF_COLLECTION_VERSION) throw new ContentValidationError('tariffCollectionPassportVersion', 'VERSION', 'CITY_HOME требует согласованный паспорт каталога тарифов.');
  if (all.some(block => block.visible === false && (!CITY_HOME_HIDDEN_LEGACY_TYPES.includes(block.blockType) || block.position < 1000))) {
    throw new ContentValidationError('blocks', 'COMPOSITION', 'Скрывать действующие блоки CITY_HOME вручную нельзя.');
  }
  const blocks = all.filter(block => block.visible !== false).sort((a, b) => a.position - b.position);
  validateCityHomeComposition(blocks.map(({ blockType, data }) => ({ blockType, data })), { draft });
  if (blocks.some((block, index) => block.visible !== true || block.position !== (index + 1) * 10 || typeof block.id !== 'string' || !block.id)
    || new Set(blocks.map(block => block.id)).size !== blocks.length) {
    throw new ContentValidationError('blocks', 'COMPOSITION', 'Нарушены идентификаторы, видимость или системные позиции CITY_HOME.');
  }
  return { version: CITY_HOME_VERSION, implementationVersion: CITY_HOME_IMPLEMENTATION,
    blocks: blocks.map(({ id, blockType, data }) => ({ id: id!, blockType, data })) as CityHomeView['blocks'] };
}

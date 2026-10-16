import { ContentValidationError } from './content-validation-error';
import { GENERAL_HOME_VERSION, GENERAL_HOME_IMPLEMENTATION, type GeneralHomeBlock } from './general-home-model';
import { validateGeneralHomeComposition } from './general-home';
import { HOME_HERO_VERSION } from './home-hero-model';

interface TemplateSource {
  kind: string;
  content?: unknown;
  blocks: readonly { id?: string; blockType: string; position: number; visible: boolean; data: unknown }[];
}
export interface GeneralHomeView {
  version: string;
  implementationVersion: string;
  blocks: (GeneralHomeBlock & { id: string })[];
}

/** Public snapshots have no storage columns. Reconstruct those fixed columns only for validation. */
export function generalHomeFromCatalog(raw: unknown): GeneralHomeView | null {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ContentValidationError('generalHome', 'TYPE', 'Некорректный опубликованный состав HOME.');
  const view = raw as Record<string, unknown>;
  if (!Array.isArray(view.blocks)) throw new ContentValidationError('blocks', 'TYPE', 'Нужен список опубликованных блоков HOME.');
  return generalHomeFromTemplate({
    kind: 'HOME', content: {
      generalHomeCompositionVersion: view.version, generalHomeImplementationVersion: view.implementationVersion, firstScreenPassportVersion: HOME_HERO_VERSION,
    },
    blocks: view.blocks.map((block: any, index: number) => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) throw new ContentValidationError(`blocks.${index}`, 'TYPE', 'Некорректный опубликованный блок HOME.');
      return { id: block.id, blockType: block.blockType, data: block.data, position: (index + 1) * 10, visible: true };
    }),
  });
}

/** Only the explicit composition version enables the new HOME; legacy snapshots stay legacy. */
export function generalHomeFromTemplate(template: TemplateSource, draft = false): GeneralHomeView | null {
  const content = template.content && typeof template.content === 'object' && !Array.isArray(template.content) ? template.content as Record<string, unknown> : {};
  const blocks = [...(template.blocks ?? [])].filter(block => block.visible).sort((a, b) => a.position - b.position);
  if (!Object.hasOwn(content, 'generalHomeCompositionVersion')) {
    if (blocks.some(block => block.blockType !== 'home.hero')) throw new ContentValidationError('generalHomeCompositionVersion', 'VERSION', 'Новая композиция HOME требует явной версии.');
    return null;
  }
  if (template.kind !== 'HOME' || content.generalHomeCompositionVersion !== GENERAL_HOME_VERSION) throw new ContentValidationError('generalHomeCompositionVersion', 'VERSION', 'Неизвестная версия композиции HOME.');
  if (content.generalHomeImplementationVersion !== GENERAL_HOME_IMPLEMENTATION) throw new ContentValidationError('generalHomeImplementationVersion', 'VERSION', 'Неизвестная реализация композиции HOME.');
  if (content.firstScreenPassportVersion !== HOME_HERO_VERSION) throw new ContentValidationError('firstScreenPassportVersion', 'VERSION', 'Новая композиция HOME требует Hero 2.0.0.');
  validateGeneralHomeComposition(blocks.map(({ blockType, data }) => ({ blockType, data })), GENERAL_HOME_VERSION, draft);
  if (blocks.some((block, index) => block.position !== (index + 1) * 10 || typeof block.id !== 'string' || !block.id)) throw new ContentValidationError('blocks', 'COMPOSITION', 'Нарушены идентификаторы или системные позиции композиции HOME.');
  if (new Set(blocks.map(block => block.id)).size !== blocks.length) throw new ContentValidationError('blocks', 'COMPOSITION', 'Идентификаторы блоков HOME повторяются.');
  return {
    version: GENERAL_HOME_VERSION, implementationVersion: GENERAL_HOME_IMPLEMENTATION,
    blocks: blocks.map(({ id, blockType, data }) => ({ id, blockType, data })) as GeneralHomeView['blocks'],
  };
}

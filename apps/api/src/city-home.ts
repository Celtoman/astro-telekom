import { ContentValidationError } from './content-validation-error';
import { validateFirstScreen } from './first-screen';
import { validateTariffCollection } from './tariff-collection';
import { validateStructuredBlock } from './general-home';
import { CITY_HOME_BLOCK_ORDER, CITY_HOME_VERSION, type CityHomeBlockType, type CityHomeMissingField } from './city-home-model';
import { CITY_HOME_SCHEMAS } from './general-home-model';

const fail = (field: string, reason: string, message: string): never => { throw new ContentValidationError(field, reason, message); };
export function validateCityHomeBlock(blockType: string, raw: unknown, draft = false): string[] {
  try {
    if (blockType === 'hero') return validateFirstScreen('CITY_HOME', raw, draft);
    if (blockType === 'tariff_grid') return validateTariffCollection(raw, draft);
    if (!Object.hasOwn(CITY_HOME_SCHEMAS, blockType)) fail('blockType', 'UNKNOWN_BLOCK', 'Неизвестный блок CITY_HOME.');
    return validateStructuredBlock(blockType, raw, CITY_HOME_SCHEMAS[blockType as keyof typeof CITY_HOME_SCHEMAS], draft, ['SITE', 'CITY']);
  } catch (error) {
    if (error instanceof ContentValidationError) error.block = blockType;
    throw error;
  }
}

/** The editable projection has no row IDs, visibility flags or drag-and-drop positions. */
export function validateCityHomeComposition(raw: unknown, options: { draft?: boolean; version?: string } = {}): CityHomeMissingField[] {
  if ((options.version ?? CITY_HOME_VERSION) !== CITY_HOME_VERSION) fail('homeCompositionVersion', 'VERSION', 'Неизвестная версия композиции CITY_HOME.');
  if (!Array.isArray(raw) || raw.length !== CITY_HOME_BLOCK_ORDER.length) fail('blocks', 'COMPOSITION', 'Нужны десять согласованных блоков CITY_HOME.');
  const blocks = Array.from(raw as unknown[]);
  if (blocks.some((block: any, index) => !block || typeof block !== 'object' || Array.isArray(block)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(block)) || !Object.hasOwn(block, 'blockType') || block.blockType !== CITY_HOME_BLOCK_ORDER[index])) {
    fail('blocks', 'COMPOSITION', 'Нарушен состав или порядок CITY_HOME.');
  }
  const missing: CityHomeMissingField[] = [];
  blocks.forEach((rawBlock: any, index) => {
    const blockType = CITY_HOME_BLOCK_ORDER[index];
    const unknownKey = Object.keys(rawBlock).find(key => !['blockType', 'data'].includes(key));
    if (unknownKey) { const error = new ContentValidationError(`blocks.${index}.${unknownKey}`, 'UNKNOWN_FIELD', 'Системные поля композиции изменять нельзя.'); error.block = blockType; throw error; }
    const fields = validateCityHomeBlock(blockType, rawBlock.data, true);
    missing.push(...fields.map(field => ({ block: blockType as CityHomeBlockType, field })));
  });
  if (!options.draft && missing.length) {
    const error = new ContentValidationError(missing[0].field, 'REQUIRED', 'CITY_HOME не готова к публикации: заполните обязательное поле.');
    error.block = missing[0].block;
    throw error;
  }
  return missing;
}

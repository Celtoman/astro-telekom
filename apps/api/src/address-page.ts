import { ContentValidationError } from './content-validation-error';
import { validateStructuredBlock } from './general-home';
import { ADDRESS_PAGE_BLOCK_ORDER, ADDRESS_PAGE_SCHEMAS, ADDRESS_PAGE_VERSION, type AddressPageBlockType, type AddressPageMissingField } from './address-page-model';

export function validateAddressPageBlock(blockType: string, raw: unknown, draft = false): string[] {
  if (!Object.hasOwn(ADDRESS_PAGE_SCHEMAS, blockType)) throw new ContentValidationError('blockType', 'UNKNOWN_BLOCK', 'Неизвестный блок страницы проверки подключения.');
  return validateStructuredBlock(blockType, raw, ADDRESS_PAGE_SCHEMAS[blockType as AddressPageBlockType], draft, ['SITE', 'CITY']);
}

/** Only editable data is accepted. Structure, positions, visibility and facts belong to code. */
export function validateAddressPageComposition(raw: unknown, options: { draft?: boolean; version?: string } = {}): AddressPageMissingField[] {
  if ((options.version ?? ADDRESS_PAGE_VERSION) !== ADDRESS_PAGE_VERSION) throw new ContentValidationError('addressCheckCompositionVersion', 'VERSION', 'Неизвестная версия страницы проверки подключения.');
  if (!Array.isArray(raw) || raw.length !== ADDRESS_PAGE_BLOCK_ORDER.length) throw new ContentValidationError('blocks', 'COMPOSITION', 'Нужны восемь согласованных контентных блоков ADDRESS.');
  const rows = Array.from(raw);
  if (rows.some((row, index) => !row || typeof row !== 'object' || Array.isArray(row) || ![Object.prototype, null].includes(Object.getPrototypeOf(row))
    || !Object.hasOwn(row, 'blockType') || row.blockType !== ADDRESS_PAGE_BLOCK_ORDER[index])) throw new ContentValidationError('blocks', 'COMPOSITION', 'Нарушен состав или порядок ADDRESS.');
  const missing: AddressPageMissingField[] = [];
  rows.forEach((row, index) => {
    const blockType = ADDRESS_PAGE_BLOCK_ORDER[index];
    const unknown = Object.keys(row).find(key => !['blockType', 'data'].includes(key));
    if (unknown) { const error = new ContentValidationError(`blocks.${index}.${unknown}`, 'UNKNOWN_FIELD', 'Системные поля композиции изменять нельзя.'); error.block = blockType; throw error; }
    missing.push(...validateAddressPageBlock(blockType, row.data, true).map(field => ({ block: blockType, field })));
  });
  if (!options.draft && missing.length) {
    const error = new ContentValidationError(missing[0].field, 'REQUIRED', 'Страница проверки подключения не готова к публикации: заполните обязательное поле.');
    error.block = missing[0].block; throw error;
  }
  return missing;
}

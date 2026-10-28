import { ContentValidationError, validateContentText } from './content-validation-error';
import { validateFirstScreen } from './first-screen';
import { HOME_HERO_VERSION, HOME_HERO_TEXT_LIMITS } from './home-hero-model';
import { listVariableDefinitions, resolveVariableText } from './variable-registry';
import {
  GENERAL_HOME_VERSION, GENERAL_HOME_BLOCK_TYPES, GENERAL_HOME_BLOCK_ORDER, GENERAL_HOME_SCHEMAS,
  type GeneralHomeBlockType, type GeneralHomeFieldRule, type GeneralHomeMissingField,
} from './general-home-model';

function fail(block: string | undefined, field: string, reason: string, message: string): never {
  const error = new ContentValidationError(field, reason, message);
  if (block) error.block = block;
  throw error;
}

function object(raw: unknown, block: string | undefined, path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) {
    fail(block, path, 'TYPE', 'Нужен объект с полями утверждённого паспорта.');
  }
  return raw as Record<string, unknown>;
}

function knownKeys(data: Record<string, unknown>, allowed: readonly string[], block: string | undefined, path: string) {
  const key = Object.keys(data).find(key => !allowed.includes(key));
  if (key !== undefined) fail(block, path ? `${path}.${key}` : key, 'UNKNOWN_FIELD', 'Неизвестное или системное поле нельзя изменять.');
}

function checkUrl(value: string, kind: 'asset' | 'https', block: string, path: string) {
  if (/\s|\\/.test(value)) fail(block, path, 'URL', 'URL не должен содержать пробелы или обратные слеши.');
  if (kind === 'asset' && value.startsWith('/')) {
    if (!/^\/(?:[\w.-]+\/)*[\w.-]+$/.test(value) || value.split('/').some(part => part === '.' || part === '..')) {
      fail(block, path, 'URL', 'Нужен безопасный локальный путь файла или HTTPS URL.');
    }
    return;
  }
  try {
    const url = new URL(value);
    if (!/^https:\/\//i.test(value) || url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error();
  } catch {
    fail(block, path, 'URL', 'Нужен HTTPS URL без имени пользователя и пароля.');
  }
}

function checkVariables(value: string, allowed: boolean, block: string, path: string, scopes: readonly string[] = ['SITE']) {
  if (!/[{}]/.test(value)) return;
  if (!allowed) fail(block, path, 'VARIABLE', 'Переменные недоступны в этом поле.');
  // Validate syntax and URL interpolation using the existing registry, without storing resolved values.
  try { resolveVariableText(value, { now: new Date(0) }, { path, field: 'TEXT' }); }
  catch (error) { fail(block, path, 'VARIABLE', error instanceof Error ? error.message : 'Некорректная переменная.'); }
  const definitions = listVariableDefinitions();
  for (const token of value.matchAll(/\{([^{}]+)\}/g)) {
    if (!definitions.some(definition => definition.code === token[1] && scopes.includes(definition.scope))) {
      fail(block, path, 'VARIABLE', scopes.length === 1 ? 'В общей HOME доступны только разрешённые переменные сайта.' : 'Доступны только разрешённые переменные сайта и города.');
    }
  }
}

function validateField(raw: unknown, rule: GeneralHomeFieldRule, block: string, path: string, missing: string[], scopes: readonly string[] = ['SITE']) {
  if (rule.kind === 'object') {
    const data = object(raw, block, path || 'data');
    knownKeys(data, Object.keys(rule.fields), block, path);
    for (const [key, child] of Object.entries(rule.fields)) {
      const field = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(data, key)) fail(block, field, 'TYPE', 'Поле отсутствует. Передайте поле утверждённого паспорта.');
      validateField(data[key], child, block, field, missing, scopes);
    }
    return;
  }
  if (rule.kind === 'list') {
    if (!Array.isArray(raw)) fail(block, path, 'TYPE', 'Нужен список вопросов и ответов.');
    if (raw.length > rule.max) fail(block, path, 'RANGE', `Допустимо не более ${rule.max} элементов.`);
    if (raw.length < rule.min) missing.push(path);
    for (let index = 0; index < raw.length; index++) validateField(raw[index], rule.item, block, `${path}.${index}`, missing, scopes);
    return;
  }
  validateContentText(raw, path, rule.limit);
  if (/[\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) fail(block, path, 'UNSAFE_TEXT', 'Служебные символы запрещены.');
  checkVariables(raw, rule.variables, block, path, scopes);
  if (!raw.trim()) { missing.push(path); return; }
  if (rule.kind !== 'text') checkUrl(raw, rule.kind, block, path);
}

/** Reuses the safe structural contract while the caller explicitly owns variable scopes. */
export function validateStructuredBlock(block: string, raw: unknown, schema: GeneralHomeFieldRule, draft = false, scopes: readonly ('SITE' | 'CITY')[] = ['SITE']): string[] {
  const missing: string[] = [];
  try { validateField(raw, schema, block, '', missing, scopes); }
  catch (error) { if (error instanceof ContentValidationError) error.block = block; throw error; }
  if (!draft && missing.length) fail(block, missing[0], 'REQUIRED', 'Блок не готов к публикации: заполните обязательное поле.');
  return missing;
}

/** Pure contract check shared by guarded writes, catalog projection and publication preflight. */
export function validateGeneralHomeBlock(blockType: string, raw: unknown, draft = false, passportVersion: string = GENERAL_HOME_VERSION): string[] {
  if (passportVersion !== GENERAL_HOME_VERSION) fail(blockType, 'passportVersion', 'VERSION', 'Неизвестная версия паспорта общей HOME.');
  if (!(GENERAL_HOME_BLOCK_TYPES as readonly string[]).includes(blockType)) fail(blockType, 'blockType', 'UNKNOWN_BLOCK', 'Неизвестный блок общей HOME.');
  const missing: string[] = [];
  try { validateField(raw, GENERAL_HOME_SCHEMAS[blockType as GeneralHomeBlockType], blockType, '', missing); }
  catch (error) {
    if (error instanceof ContentValidationError) error.block = blockType;
    throw error;
  }
  if (!draft && missing.length) fail(blockType, missing[0], 'REQUIRED', 'Блок не готов к публикации: заполните обязательное поле.');
  return missing;
}

/** Input is the editable ten-block projection, not raw Prisma rows with system columns. */
export function validateGeneralHomeComposition(raw: unknown, version: string = GENERAL_HOME_VERSION, draft = false): GeneralHomeMissingField[] {
  if (version !== GENERAL_HOME_VERSION) fail(undefined, 'generalHomeCompositionVersion', 'VERSION', 'Неизвестная версия композиции общей HOME.');
  if (!Array.isArray(raw) || raw.length !== GENERAL_HOME_BLOCK_ORDER.length) fail(undefined, 'blocks', 'COMPOSITION', 'Нужны десять блоков утверждённой композиции HOME.');
  const blocks = Array.from(raw, (value, index) => object(value, undefined, `blocks.${index}`));
  if (blocks.some((block, index) => block.blockType !== GENERAL_HOME_BLOCK_ORDER[index])) fail(undefined, 'blocks', 'COMPOSITION', 'Нарушен состав или порядок общей HOME.');
  const missing: GeneralHomeMissingField[] = [];
  blocks.forEach((block, index) => {
    const blockType = GENERAL_HOME_BLOCK_ORDER[index];
    knownKeys(block, ['blockType', 'data'], blockType, `blocks.${index}`);
    let fields: string[];
    if (blockType === 'home.hero') {
      const data = object(block.data, blockType, 'data');
      knownKeys(data, [...Object.keys(HOME_HERO_TEXT_LIMITS), 'steps'], blockType, '');
      try { fields = validateFirstScreen('HOME', block.data, true, HOME_HERO_VERSION); }
      catch (error) { if (error instanceof ContentValidationError) error.block = blockType; throw error; }
    } else fields = validateGeneralHomeBlock(blockType, block.data, true);
    missing.push(...fields.map(field => ({ block: blockType, field })));
  });
  if (!draft && missing.length) fail(missing[0].block, missing[0].field, 'REQUIRED', 'HOME не готова к публикации: заполните обязательное поле.');
  return missing;
}

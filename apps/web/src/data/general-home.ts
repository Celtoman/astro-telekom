import {
  GENERAL_HOME_VERSION, GENERAL_HOME_IMPLEMENTATION, GENERAL_HOME_BLOCK_ORDER, GENERAL_HOME_SCHEMAS,
  type GeneralHomeBlock, type GeneralHomeBlockType, type GeneralHomeFieldRule,
} from '../../../api/src/general-home-model.ts';
import { assertRenderedHomeHero } from '../../../api/src/home-hero-model.ts';

export interface GeneralHomeCatalog {
  version: typeof GENERAL_HOME_VERSION;
  implementationVersion: typeof GENERAL_HOME_IMPLEMENTATION;
  blocks: (GeneralHomeBlock & { id: string })[];
}

export function generalHomeBlock<T extends GeneralHomeBlock['blockType']>(home: GeneralHomeCatalog, type: T): Extract<GeneralHomeBlock, { blockType: T }>['data'] {
  const block = home.blocks.find(value => value.blockType === type) as Extract<GeneralHomeBlock, { blockType: T }> | undefined;
  if (!block) throw new Error(`Нет обязательного блока HOME: ${type}`);
  return block.data;
}

export class GeneralHomeRenderError extends Error {
  block: string;
  field: string;
  constructor(block: string, field: string, message: string) {
    super(`HOME · ${block} · ${field}: ${message}`);
    this.name = 'GeneralHomeRenderError'; this.block = block; this.field = field;
  }
}
function fail(block: string, field: string, message: string): never { throw new GeneralHomeRenderError(block, field, message); }
function record(value: unknown, block: string, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(block, field, 'Нужен объект утверждённой схемы.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: readonly string[], block: string, field: string) {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail(block, field, 'Изменён состав полей.');
}
export function safeHomeUrl(value: string, local = true): string {
  if (typeof value !== 'string' || /[\s\\<>\u0000-\u001f]/.test(value)) throw new Error('Некорректный URL HOME.');
  if (local && value.startsWith('/')) {
    if (!/^\/(?:[\w.-]+\/)*[\w.-]+$/.test(value) || value.split('/').some(part => part === '.' || part === '..')) throw new Error('Небезопасный локальный путь HOME.');
    return value;
  }
  const url = new URL(value);
  if (!/^https:\/\//i.test(value) || url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('Нужен HTTPS URL без имени пользователя и пароля.');
  return value;
}
function field(value: unknown, rule: GeneralHomeFieldRule, block: string, path: string) {
  if (rule.kind === 'object') {
    const data = record(value, block, path); keys(data, Object.keys(rule.fields), block, path);
    for (const [key, child] of Object.entries(rule.fields)) field(data[key], child, block, path ? `${path}.${key}` : key);
  } else if (rule.kind === 'list') {
    if (!Array.isArray(value) || value.length < rule.min || value.length > rule.max) fail(block, path, 'Неполный список.');
    for (let index = 0; index < value.length; index++) field(value[index], rule.item, block, `${path}.${index}`);
  } else {
    if (typeof value !== 'string' || !value.trim() || value.length > rule.limit || /[<>{}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(block, path, 'Неполный или необработанный контент.');
    if (rule.kind !== 'text') { try { safeHomeUrl(value, rule.kind === 'asset'); } catch { fail(block, path, 'Небезопасный URL.'); } }
  }
}

/** Public rendered snapshots are stricter than editable raw templates: no unresolved variables or incomplete drafts. */
export function generalHomeCatalog(raw: unknown): GeneralHomeCatalog | undefined {
  if (raw === undefined || raw === null) return undefined;
  const source = record(raw, 'composition', 'generalHome');
  keys(source, ['version', 'implementationVersion', 'blocks'], 'composition', 'generalHome');
  if (source.version !== GENERAL_HOME_VERSION || source.implementationVersion !== GENERAL_HOME_IMPLEMENTATION) fail('composition', 'version', 'Неизвестная версия полной HOME.');
  if (!Array.isArray(source.blocks) || source.blocks.length !== GENERAL_HOME_BLOCK_ORDER.length) fail('composition', 'blocks', 'Нужны десять согласованных блоков.');
  const ids = new Set<string>();
  for (let index = 0; index < source.blocks.length; index++) {
    const expected = GENERAL_HOME_BLOCK_ORDER[index], block = record(source.blocks[index], expected, 'block');
    keys(block, ['id', 'blockType', 'data'], expected, 'block');
    if (block.blockType !== expected || typeof block.id !== 'string' || !block.id || ids.has(block.id)) fail(expected, 'block', 'Нарушены порядок или идентификаторы.');
    ids.add(block.id);
    if (expected === 'home.hero') {
      try { assertRenderedHomeHero(record(block.data, expected, 'data')); } catch { fail(expected, 'data', 'Некорректный Hero2.0.0.'); }
    } else field(block.data, GENERAL_HOME_SCHEMAS[expected as GeneralHomeBlockType], expected, '');
  }
  return raw as GeneralHomeCatalog;
}

export function generalHomeImageOrigins(home: GeneralHomeCatalog | undefined): string[] {
  const origins = new Set<string>();
  function visit(data: any, rule: GeneralHomeFieldRule) {
    if (rule.kind === 'object') for (const [key, child] of Object.entries(rule.fields)) visit(data[key], child);
    else if (rule.kind === 'list') for (const item of data) visit(item, rule.item);
    else if (rule.kind === 'asset' && /^https:\/\//i.test(data)) origins.add(new URL(data).origin);
  }
  for (const block of home?.blocks ?? []) if (block.blockType !== 'home.hero') visit(block.data, GENERAL_HOME_SCHEMAS[block.blockType]);
  return [...origins].sort();
}

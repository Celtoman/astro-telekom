import { BadRequestException } from '@nestjs/common';
import { validateFirstScreen } from './first-screen';
import { validateTariffCollection } from './tariff-collection';
import { ContentValidationError } from './content-validation-error';

export const BLOCK_TYPES = ['hero', 'rich_text', 'tariff_grid', 'service_grid', 'feature_grid', 'steps', 'faq'] as const;
const SERVICE_PAGE_TYPES = ['INTERNET', 'INTERNET_TV', 'TV', 'ADDRESS_CHECK', 'FAQ'] as const;
const ROOT_FIELDS = ['blockType', 'position', 'visible', 'data', 'source'] as const;

type BlockType = (typeof BLOCK_TYPES)[number];
type JsonObject = Record<string, unknown>;
type BlockContext = { pageType?: string; deferData?: boolean };
const LEGACY_COLLECTION_PAGES = ['INTERNET', 'INTERNET_TV', 'TV'];

function fail(message: string): never {
  throw new BadRequestException(message);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} должен быть объектом`);
  return value as JsonObject;
}

function exactKeys(value: JsonObject, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) fail(`${label}: неизвестное поле ${unexpected}`);
}

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') fail(`${label} должно быть строкой`);
  const normalized = value.trim();
  if (!normalized) fail(`${label} не должно быть пустым`);
  if (normalized.length > maxLength) fail(`${label} длиннее ${maxLength} символов`);
  if (/[<>]/.test(normalized)) fail(`${label} не должно содержать HTML-разметку`);
  return normalized;
}

function requiredText(data: JsonObject, key: string, maxLength: number): string {
  const value = data[key];
  if (typeof value !== 'string') throw new ContentValidationError(key, 'TYPE', 'Поле отсутствует или имеет неверный формат. Нужен текст.');
  const normalized = value.trim();
  if (!normalized) throw new ContentValidationError(key, 'REQUIRED', 'Обязательное поле пустое. Заполните его и повторите проверку.');
  if (normalized.length > maxLength) throw new ContentValidationError(key, 'TOO_LONG', `Введено ${normalized.length} символов; допустимо не более ${maxLength}. Сократите текст.`);
  if (/[<>]/.test(normalized)) throw new ContentValidationError(key, 'UNSAFE_TEXT', 'Поле должно содержать обычный текст без HTML. Удалите разметку и символы < и >.');
  return normalized;
}

function optionalText(data: JsonObject, key: string, maxLength: number): string | undefined {
  if (!(key in data)) return undefined;
  return text(data[key], `Поле ${key}`, maxLength);
}

function items(data: JsonObject, minimum: number, maximum: number): JsonObject[] {
  if (!Array.isArray(data.items)) fail('Поле items должно быть массивом');
  if (data.items.length < minimum || data.items.length > maximum) {
    fail(`Поле items должно содержать от ${minimum} до ${maximum} элементов`);
  }
  return data.items.map((item, index) => object(item, `Элемент items[${index}]`));
}

function validateCtaHref(value: unknown): void {
  const href = text(value, 'Поле ctaHref', 2048);
  if (/\s|\\/.test(href) || href.startsWith('//')) fail('Недопустимая ссылка кнопки');

  if (href.startsWith('#')) {
    if (!/^#[A-Za-z0-9_-]+$/.test(href)) fail('Недопустимая ссылка кнопки');
    return;
  }

  if (href.startsWith('/')) {
    const url = new URL(href, 'https://public.invalid');
    if (url.pathname !== '/' && url.pathname.endsWith('/')) fail('Внутренний URL кнопки должен быть без слэша в конце');
    return;
  }

  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) fail('Недопустимая ссылка кнопки');
  } catch {
    fail('Недопустимая ссылка кнопки');
  }
}

function validateTitledItems(data: JsonObject, minimum: number, maximum: number): void {
  for (const [index, item] of items(data, minimum, maximum).entries()) {
    exactKeys(item, ['title', 'text'], `Элемент items[${index}]`);
    requiredText(item, 'title', 120);
    requiredText(item, 'text', 1000);
  }
}

function validateData(blockType: BlockType, rawData: unknown, context: BlockContext): void {
  const data = object(rawData, 'Данные блока');

  switch (blockType) {
    case 'hero':
      if ('image' in data || 'addressPlaceholder' in data) { validateFirstScreen('CITY_HOME', data); return; }
      exactKeys(data, ['eyebrow', 'title', 'text', 'ctaText', 'ctaHref'], 'Данные hero');
      optionalText(data, 'eyebrow', 80);
      requiredText(data, 'title', 120);
      requiredText(data, 'text', 1000);
      optionalText(data, 'ctaText', 80);
      if ('ctaHref' in data) validateCtaHref(data.ctaHref);
      if (('ctaText' in data) !== ('ctaHref' in data)) fail('Поля ctaText и ctaHref должны быть указаны вместе');
      return;
    case 'rich_text':
      exactKeys(data, ['title', 'text'], 'Данные rich_text');
      requiredText(data, 'title', 120);
      requiredText(data, 'text', 4000);
      return;
    case 'tariff_grid':
      if (LEGACY_COLLECTION_PAGES.includes(context.pageType ?? '') && !('initialCount' in data || 'sort' in data || 'text' in data)) {
        exactKeys(data, ['title', 'serviceType', 'limit', 'morePageType'], 'Данные старого тарифного блока');
        requiredText(data, 'title', 120);
        for (const key of ['serviceType', 'morePageType']) {
          if (key in data && !LEGACY_COLLECTION_PAGES.includes(String(data[key]))) throw new ContentValidationError(key, 'ENUM', 'Выберите допустимый тип услуги: интернет, интернет и ТВ или телевидение.');
        }
        if ('limit' in data && (!Number.isInteger(data.limit) || Number(data.limit) < 1 || Number(data.limit) > 12)) throw new ContentValidationError('limit', 'RANGE', 'В старом тарифном блоке допустимо от 1 до 12 карточек.');
        return;
      }
      validateTariffCollection(data);
      return;
    case 'service_grid':
      exactKeys(data, ['title', 'items'], 'Данные service_grid');
      requiredText(data, 'title', 120);
      for (const [index, item] of items(data, 1, 8).entries()) {
        exactKeys(item, ['pageType', 'title', 'text'], `Элемент items[${index}]`);
        if (typeof item.pageType !== 'string' || !SERVICE_PAGE_TYPES.includes(item.pageType as (typeof SERVICE_PAGE_TYPES)[number])) {
          fail(`Элемент items[${index}]: неизвестный тип страницы`);
        }
        requiredText(item, 'title', 120);
        requiredText(item, 'text', 1000);
      }
      return;
    case 'feature_grid':
      exactKeys(data, ['title', 'items'], 'Данные feature_grid');
      requiredText(data, 'title', 120);
      validateTitledItems(data, 1, 8);
      return;
    case 'steps':
      exactKeys(data, ['title', 'items'], 'Данные steps');
      requiredText(data, 'title', 120);
      validateTitledItems(data, 2, 8);
      return;
    case 'faq':
      exactKeys(data, ['title', 'items'], 'Данные faq');
      requiredText(data, 'title', 120);
      for (const [index, item] of items(data, 1, 12).entries()) {
        exactKeys(item, ['question', 'answer'], `Элемент items[${index}]`);
        requiredText(item, 'question', 240);
        requiredText(item, 'answer', 4000);
      }
  }
}

export function validateBlock(body: unknown, partial = false, context: BlockContext = {}): void {
  const value = object(body, 'Блок');
  exactKeys(value, ROOT_FIELDS, 'Блок');
  if (partial && Object.keys(value).length === 0) fail('Изменения блока не указаны');

  let blockType: BlockType | undefined;
  if (!partial || 'blockType' in value) {
    if (typeof value.blockType !== 'string' || !BLOCK_TYPES.includes(value.blockType as BlockType)) fail('Неизвестный тип блока');
    blockType = value.blockType as BlockType;
  }

  if (!partial || 'position' in value) {
    if (typeof value.position !== 'number' || !Number.isInteger(value.position) || value.position < 0 || value.position > 2147483647) {
      fail('Позиция должна быть неотрицательным целым числом');
    }
  }
  if ('visible' in value && typeof value.visible !== 'boolean') fail('Видимость должна быть логическим значением');
  if ('source' in value && value.source !== null) text(value.source, 'Источник', 200);

  if (!partial) {
    if (!context.deferData) validateData(blockType!, value.data, context);
  } else if ('data' in value) {
    object(value.data, 'Данные блока');
    if (blockType && !context.deferData) validateData(blockType, value.data, context);
  }
}

export function validatePublishedBlocks(rawBlocks: unknown, context: BlockContext = {}): void {
  if (!Array.isArray(rawBlocks)) fail('Блоки опубликованной страницы должны быть массивом');
  if (rawBlocks.length === 0) return;

  let heroCount = 0;
  for (const rawBlock of rawBlocks) {
    const block = object(rawBlock, 'Опубликованный блок');
    if (block.blockType === 'hero') heroCount += 1;
    try { validateBlock({
      blockType: block.blockType,
      position: block.position,
      visible: block.visible,
      data: block.data,
      source: block.source ?? null,
    }, false, context); } catch (error) {
      if (error instanceof ContentValidationError) error.block = String(block.blockType);
      throw error;
    }
  }

  if (heroCount !== 1) fail('Опубликованная страница с блоками должна содержать ровно один видимый hero');
}

const CITY_HOME_BLOCK_SEQUENCE = ['hero', 'tariff_grid'];

export function validateCityHomeBlocks(rawBlocks: unknown, cityName: string): void {
  if (!Array.isArray(rawBlocks)) fail('Блоки городской HOME должны быть массивом');
  const blocks = rawBlocks.filter(block => block.visible !== false) as Array<Record<string, unknown>>;
  validatePublishedBlocks(blocks);
  const actualSequence = blocks.map((block) => block.blockType);
  if (JSON.stringify(actualSequence) !== JSON.stringify(CITY_HOME_BLOCK_SEQUENCE)) {
    fail(`Городская HOME «${cityName}» должна содержать каноническую последовательность из 2 видимых блоков`);
  }
}

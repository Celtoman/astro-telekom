import { BadRequestException } from '@nestjs/common';

const BLOCK_TYPES = ['hero', 'rich_text', 'tariff_grid', 'service_grid', 'feature_grid', 'steps', 'faq'] as const;
const SERVICE_PAGE_TYPES = ['INTERNET', 'INTERNET_TV', 'TV', 'ADDRESS_CHECK', 'FAQ'] as const;
const TARIFF_SERVICE_TYPES = ['INTERNET', 'INTERNET_TV', 'TV'] as const;
const ROOT_FIELDS = ['blockType', 'position', 'visible', 'data', 'source'] as const;

type BlockType = (typeof BLOCK_TYPES)[number];
type JsonObject = Record<string, unknown>;

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
  return text(data[key], `Поле ${key}`, maxLength);
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

function validateData(blockType: BlockType, rawData: unknown): void {
  const data = object(rawData, 'Данные блока');

  switch (blockType) {
    case 'hero':
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
      exactKeys(data, ['title', 'serviceType', 'limit', 'morePageType'], 'Данные tariff_grid');
      requiredText(data, 'title', 120);
      if ('serviceType' in data && (typeof data.serviceType !== 'string' || !TARIFF_SERVICE_TYPES.includes(data.serviceType as (typeof TARIFF_SERVICE_TYPES)[number]))) {
        fail('Поле serviceType содержит неизвестный тип услуги');
      }
      if ('limit' in data && (typeof data.limit !== 'number' || !Number.isInteger(data.limit) || data.limit < 1 || data.limit > 12)) {
        fail('Поле limit должно быть целым числом от 1 до 12');
      }
      if ('morePageType' in data && (typeof data.morePageType !== 'string' || !TARIFF_SERVICE_TYPES.includes(data.morePageType as (typeof TARIFF_SERVICE_TYPES)[number]))) {
        fail('Поле morePageType содержит неизвестный тип страницы тарифа');
      }
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

export function validateBlock(body: unknown, partial = false): void {
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
    validateData(blockType!, value.data);
  } else if ('data' in value) {
    object(value.data, 'Данные блока');
    if (blockType) validateData(blockType, value.data);
  }
}

export function validatePublishedBlocks(rawBlocks: unknown): void {
  if (!Array.isArray(rawBlocks)) fail('Блоки опубликованной страницы должны быть массивом');
  if (rawBlocks.length === 0) return;

  let heroCount = 0;
  for (const rawBlock of rawBlocks) {
    const block = object(rawBlock, 'Опубликованный блок');
    if (block.blockType === 'hero') heroCount += 1;
    validateBlock({
      blockType: block.blockType,
      position: block.position,
      visible: block.visible,
      data: block.data,
      source: block.source ?? null,
    });
  }

  if (heroCount !== 1) fail('Опубликованная страница с блоками должна содержать ровно один видимый hero');
}

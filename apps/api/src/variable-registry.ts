import { BadRequestException } from '@nestjs/common';
import { formatSitePhone } from './site-phone';

type VariableType = 'text' | 'number' | 'phone' | 'date';
type VariableScope = 'SITE' | 'CITY' | 'TARIFF';
type VariableCode =
  | 'CONNECTION_PHONE' | 'SUPPORT_PHONE' | 'PROVIDER_NAME'
  | 'CITY_NAME' | 'CITY_NAME_GENITIVE' | 'CITY_NAME_PREPOSITIONAL'
  | 'TARIFF_NAME' | 'TARIFF_SPEED' | 'TARIFF_PRICE' | 'TARIFF_CHANNELS' | 'YEAR';

export interface VariableDefinition {
  code: VariableCode;
  type: VariableType;
  source: string;
  scope: VariableScope;
  name: string;
  description: string;
  example: string;
  status: 'ACTIVE' | 'DEPRECATING';
  replacementCode?: VariableCode;
  allowedContexts: string[];
  allowedFields: string[];
}

const BLOCK_FIELDS = ['eyebrow', 'title', 'text', 'ctaText', 'items.title', 'items.text', 'items.question', 'items.answer'];
const PAGE_FIELDS = ['Page.title', 'Page.content.text', ...BLOCK_FIELDS.map((field) => `PageBlock.data.${field}`),
  'PageTemplate.titleTemplate', 'PageTemplate.content.text', ...BLOCK_FIELDS.map((field) => `PageTemplateBlock.data.${field}`)];
const TARIFF_FIELDS = ['Tariff.promoText'];
const SEO_TEMPLATE_FIELDS = ['SeoTemplate.titleTemplate', 'SeoTemplate.descriptionTemplate', 'SeoTemplate.ogTitleTemplate', 'SeoTemplate.ogDescriptionTemplate'];
const SITE_CONTEXTS = ['Общая страница', 'Городская страница', 'Тариф'];
const CITY_CONTEXTS = ['Городская страница', 'Тариф'];
const TARIFF_CONTEXTS = ['Тариф'];

const DEFINITIONS: readonly VariableDefinition[] = [
  { code: 'CONNECTION_PHONE', type: 'phone', source: 'Site.connectionPhone', scope: 'SITE', name: 'Телефон подключения', description: 'Единый номер для новых подключений.', example: '+7 (800) 555-72-44', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'SUPPORT_PHONE', type: 'phone', source: 'Site.supportPhone', scope: 'SITE', name: 'Телефон техподдержки', description: 'Единый номер поддержки действующих абонентов.', example: '+7 (800) 250-77-77', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'PROVIDER_NAME', type: 'text', source: 'Provider.name', scope: 'SITE', name: 'Название провайдера', description: 'Публичное имя провайдера из его карточки.', example: 'Дом.ру', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CITY_NAME', type: 'text', source: 'City.name', scope: 'CITY', name: 'Город', description: 'Название выбранного города в именительном падеже.', example: 'Казань', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CITY_NAME_GENITIVE', type: 'text', source: 'City.nameGenitive', scope: 'CITY', name: 'Город в родительном падеже', description: 'Форма выбранного города для фраз «жители Казани».', example: 'Казани', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CITY_NAME_PREPOSITIONAL', type: 'text', source: 'City.namePrepositional', scope: 'CITY', name: 'Город в предложном падеже', description: 'Форма выбранного города для фраз «в Казани».', example: 'Казани', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_NAME', type: 'text', source: 'Tariff.name', scope: 'TARIFF', name: 'Название тарифа', description: 'Название выбранного тарифа.', example: 'Гига 500', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_SPEED', type: 'number', source: 'Tariff.speed', scope: 'TARIFF', name: 'Скорость тарифа', description: 'Скорость без единицы измерения.', example: '500', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_PRICE', type: 'number', source: 'Tariff.effectivePrice', scope: 'TARIFF', name: 'Цена тарифа', description: 'Промо-цена при наличии, иначе стандартная цена; без валюты.', example: '599', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_CHANNELS', type: 'number', source: 'Tariff.attributes.tv_channels_total', scope: 'TARIFF', name: 'Телеканалы', description: 'Общее число каналов без единицы измерения.', example: '150', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'YEAR', type: 'date', source: 'Catalog.resolvedAt', scope: 'SITE', name: 'Год публикации', description: 'Год формирования снимка каталога.', example: '2026', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
];

const BY_CODE = new Map(DEFINITIONS.map((definition) => [definition.code, definition]));

export interface VariableContext {
  site?: { connectionPhone?: string | null; supportPhone?: string | null };
  provider?: { name?: string | null };
  city?: { name?: string | null; nameGenitive?: string | null; namePrepositional?: string | null };
  tariff?: {
    name?: string | null;
    speed?: unknown;
    standardPrice?: unknown;
    promoPrice?: unknown;
    attributes?: unknown;
  };
  now: Date;
}

export interface VariableWarning {
  code: VariableCode;
  path: string;
  reason: 'EMPTY' | 'OUT_OF_CONTEXT';
}

export function listVariableDefinitions(): VariableDefinition[] {
  return DEFINITIONS.map((definition) => ({ ...definition, allowedContexts: [...definition.allowedContexts], allowedFields: [...definition.allowedFields] }));
}

function sourceValue(code: VariableCode, context: VariableContext): unknown {
  switch (code) {
    case 'CONNECTION_PHONE': return context.site?.connectionPhone;
    case 'SUPPORT_PHONE': return context.site?.supportPhone;
    case 'PROVIDER_NAME': return context.provider?.name;
    case 'CITY_NAME': return context.city?.name;
    case 'CITY_NAME_GENITIVE': return context.city?.nameGenitive;
    case 'CITY_NAME_PREPOSITIONAL': return context.city?.namePrepositional;
    case 'TARIFF_NAME': return context.tariff?.name;
    case 'TARIFF_SPEED': return context.tariff?.speed;
    case 'TARIFF_PRICE': return context.tariff?.promoPrice ?? context.tariff?.standardPrice;
    case 'TARIFF_CHANNELS': {
      const attributes = context.tariff?.attributes;
      return attributes && typeof attributes === 'object' && !Array.isArray(attributes)
        ? (attributes as Record<string, unknown>).tv_channels_total
        : undefined;
    }
    case 'YEAR': return context.now;
  }
}

function formatValue(value: unknown, definition: VariableDefinition, path: string): string {
  const invalid = () => new BadRequestException(`Недопустимое значение переменной {${definition.code}} в ${path}`);
  if (definition.type === 'date') {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw invalid();
    return String(value.getUTCFullYear());
  }
  if (definition.type === 'phone') {
    if (typeof value !== 'string') throw invalid();
    try { return formatSitePhone(value); } catch { throw invalid(); }
  }
  const stringValue = typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : value && typeof value === 'object' && typeof (value as { toString?: unknown }).toString === 'function'
      ? String(value)
      : '';
  if (definition.type === 'number') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(stringValue)) throw invalid();
    const numeric = Number(stringValue);
    if (!Number.isFinite(numeric)) throw invalid();
    return new Intl.NumberFormat('ru-RU', { useGrouping: false, maximumFractionDigits: 2 }).format(numeric);
  }
  if (typeof value !== 'string' || /[<>\r\n{}]|https?:\/\/|www\./i.test(value)) throw invalid();
  return value;
}

export function resolveVariableText(
  input: string,
  context: VariableContext,
  location: { path: string; field: 'TEXT' | 'URL' },
): { text: string; warnings: VariableWarning[] } {
  const matches = [...input.matchAll(/\{([^{}]*)\}/g)];
  if (matches.length && /[<>]/.test(input)) {
    throw new BadRequestException(`HTML-разметка запрещена при подстановке: ${location.path}`);
  }
  if (location.field === 'URL' && /[{}]/.test(input)) {
    throw new BadRequestException(`Переменные запрещены в URL: ${location.path}`);
  }
  if (matches.length && /(?:https?:\/\/|www\.|\/\/)\S*\{[A-Z_]+\}/i.test(input)) {
    throw new BadRequestException(`Подстановка в ссылки запрещена: ${location.path}`);
  }
  const remainder = input.replace(/\{[^{}]*\}/g, '');
  if (/[{}]/.test(remainder)) throw new BadRequestException(`Неверный формат скобок переменной: ${location.path}`);
  const warnings: VariableWarning[] = [];
  const text = input.replace(/\{([^{}]*)\}/g, (_token, rawCode: string) => {
    const definition = BY_CODE.get(rawCode as VariableCode);
    if (!definition || !/^[A-Z][A-Z0-9_]*$/.test(rawCode)) {
      throw new BadRequestException(`Неизвестный код переменной {${rawCode}}: ${location.path}`);
    }
    if ((definition.scope === 'CITY' && !context.city) || (definition.scope === 'TARIFF' && !context.tariff)) {
      warnings.push({ code: definition.code, path: location.path, reason: 'OUT_OF_CONTEXT' });
      return '';
    }
    const value = sourceValue(definition.code, context);
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
      warnings.push({ code: definition.code, path: location.path, reason: 'EMPTY' });
      return '';
    }
    return formatValue(value, definition, location.path);
  });
  return { text, warnings };
}

import { ROUTER_PAGE_SCHEMA } from './router-page-model';
import { SPEED_TEST_PAGE_SCHEMA } from './speed-test-page-model';
import { SUPPORT_PAGE_SCHEMA } from './support-page-model';
import { BadRequestException } from '@nestjs/common';
import { formatSitePhone } from './site-phone';
import { GENERAL_HOME_SCHEMAS, CITY_HOME_SCHEMAS, type GeneralHomeFieldRule } from './general-home-model';

type VariableType = 'text' | 'number' | 'phone' | 'date';
type VariableScope = 'SITE' | 'CITY' | 'TARIFF';
type VariableCode =
  | 'CONNECTION_PHONE' | 'SUPPORT_PHONE' | 'CORPORATE_PHONE' | 'PROVIDER_NAME'
  | 'CITY_NAME' | 'CITY_NAME_GENITIVE' | 'CITY_NAME_PREPOSITIONAL'
  | 'TARIFF_NAME' | 'TARIFF_SPEED' | 'TARIFF_PRICE' | 'TARIFF_CHANNELS' | 'YEAR'
  | 'CONNECTION_HOURS' | 'SUPPORT_HOURS' | 'ONLINE_APPLICATIONS_HOURS' | 'CALLBACK_WITHIN_MINUTES'
  | 'CITY_MIN_PRICE' | 'CITY_MAX_SPEED' | 'CITY_MAX_CHANNELS';

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
const PAGE_FIELDS = ['Page.title', 'Page.content.text', 'Page.content.faq.items[].question', 'Page.content.faq.items[].answer', ...BLOCK_FIELDS.map((field) => `PageBlock.data.${field}`),
  'PageTemplate.titleTemplate', 'PageTemplate.content.text', ...BLOCK_FIELDS.map((field) => `PageTemplateBlock.data.${field}`)];
function homeVariableFields(rule: GeneralHomeFieldRule, path = '', prefix = 'PageTemplateBlock.data'): string[] {
  if (rule.kind === 'object') return Object.entries(rule.fields).flatMap(([key, child]) => homeVariableFields(child, path ? `${path}.${key}` : key, prefix));
  if (rule.kind === 'list') return homeVariableFields(rule.item, `${path}[]`, prefix);
  return rule.variables ? [`${prefix}.${path}`] : [];
}
const HOME_VARIABLE_FIELDS = [...new Set(Object.values(GENERAL_HOME_SCHEMAS).flatMap(rule => homeVariableFields(rule)))];
const CITY_VARIABLE_FIELDS = [...new Set(Object.values(CITY_HOME_SCHEMAS).flatMap(rule => homeVariableFields(rule)))];
const ROUTER_VARIABLE_FIELDS = homeVariableFields(ROUTER_PAGE_SCHEMA, '', 'Page.content');
const SPEED_TEST_VARIABLE_FIELDS = homeVariableFields(SPEED_TEST_PAGE_SCHEMA, '', 'Page.content');
const SUPPORT_VARIABLE_FIELDS = [...homeVariableFields(SUPPORT_PAGE_SCHEMA, '', 'Page.content'), ...homeVariableFields(SUPPORT_PAGE_SCHEMA, '', 'PageTemplateBlock.data')];
const TARIFF_FIELDS = ['Tariff.promoText'];
const SEO_TEMPLATE_FIELDS = ['SeoTemplate.titleTemplate', 'SeoTemplate.descriptionTemplate', 'SeoTemplate.ogTitleTemplate', 'SeoTemplate.ogDescriptionTemplate'];
const SITE_CONTEXTS = ['Общая страница', 'Городская страница', 'Тариф'];
const CITY_CONTEXTS = ['Городская страница', 'Тариф'];
const TARIFF_CONTEXTS = ['Тариф'];

const DEFINITIONS: readonly VariableDefinition[] = [
  { code: 'CONNECTION_PHONE', type: 'phone', source: 'Site.connectionPhone', scope: 'SITE', name: 'Телефон подключения', description: 'Единый номер для новых подключений.', example: '+7 (800) 555-72-44', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'SUPPORT_PHONE', type: 'phone', source: 'Site.supportPhone', scope: 'SITE', name: 'Телефон техподдержки', description: 'Единый номер поддержки действующих абонентов.', example: '+7 (800) 250-77-77', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CORPORATE_PHONE', type: 'phone', source: 'Site.settings.contactPhones.corporatePhone', scope: 'SITE', name: 'Телефон корпоративной поддержки', description: 'Номер поддержки корпоративных клиентов из общих значений сайта.', example: '+7 (800) 222-86-34', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: PAGE_FIELDS },
  { code: 'PROVIDER_NAME', type: 'text', source: 'Provider.name', scope: 'SITE', name: 'Название провайдера', description: 'Публичное имя провайдера из его карточки.', example: 'Дом.ру', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CITY_NAME', type: 'text', source: 'City.name', scope: 'CITY', name: 'Город', description: 'Название выбранного города в именительном падеже.', example: 'Казань', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CITY_NAME_GENITIVE', type: 'text', source: 'City.nameGenitive', scope: 'CITY', name: 'Город в родительном падеже', description: 'Форма выбранного города для фраз «жители Казани».', example: 'Казани', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CITY_NAME_PREPOSITIONAL', type: 'text', source: 'City.namePrepositional', scope: 'CITY', name: 'Город в предложном падеже', description: 'Форма выбранного города для фраз «в Казани».', example: 'Казани', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_NAME', type: 'text', source: 'Tariff.name', scope: 'TARIFF', name: 'Название тарифа', description: 'Название выбранного тарифа.', example: 'Гига 500', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_SPEED', type: 'number', source: 'Tariff.speed', scope: 'TARIFF', name: 'Скорость тарифа', description: 'Скорость без единицы измерения.', example: '500', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_PRICE', type: 'number', source: 'Tariff.effectivePrice', scope: 'TARIFF', name: 'Цена тарифа', description: 'Промо-цена при наличии, иначе стандартная цена; без валюты.', example: '599', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'TARIFF_CHANNELS', type: 'number', source: 'Tariff.attributes.tv_channels_total', scope: 'TARIFF', name: 'Телеканалы', description: 'Общее число каналов без единицы измерения.', example: '150', status: 'ACTIVE', allowedContexts: TARIFF_CONTEXTS, allowedFields: [...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'YEAR', type: 'date', source: 'Catalog.resolvedAt', scope: 'SITE', name: 'Год публикации', description: 'Год формирования снимка каталога.', example: '2026', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: [...PAGE_FIELDS, ...TARIFF_FIELDS, ...SEO_TEMPLATE_FIELDS] },
  { code: 'CONNECTION_HOURS', type: 'text', source: 'Site.publicDisplay.connectionHours', scope: 'SITE', name: 'Приём звонков', description: 'Единый график входящей линии подключения.', example: 'Ежедневно с 8:00 до 22:00', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: PAGE_FIELDS },
  { code: 'SUPPORT_HOURS', type: 'text', source: 'Site.publicDisplay.supportHours', scope: 'SITE', name: 'График поддержки', description: 'Единый график поддержки абонентов.', example: 'Круглосуточно', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: PAGE_FIELDS },
  { code: 'ONLINE_APPLICATIONS_HOURS', type: 'text', source: 'Site.publicDisplay.onlineApplicationsHours', scope: 'SITE', name: 'Приём онлайн-заявок', description: 'График приёма заявок через сайт.', example: 'Круглосуточно', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: PAGE_FIELDS },
  { code: 'CALLBACK_WITHIN_MINUTES', type: 'number', source: 'Site.publicDisplay.callbackWithinMinutes', scope: 'SITE', name: 'Срок обратного звонка', description: 'Срок в минутах, без единицы измерения.', example: '15', status: 'ACTIVE', allowedContexts: SITE_CONTEXTS, allowedFields: PAGE_FIELDS },
  { code: 'CITY_MIN_PRICE', type: 'number', source: 'City.tariffFacts.minPrice', scope: 'CITY', name: 'Минимальная цена города', description: 'Минимальная действующая цена опубликованных тарифов города, без валюты.', example: '599', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: PAGE_FIELDS },
  { code: 'CITY_MAX_SPEED', type: 'number', source: 'City.tariffFacts.maxSpeed', scope: 'CITY', name: 'Максимальная скорость города', description: 'Максимальная известная скорость опубликованных тарифов, без единицы измерения.', example: '1000', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: PAGE_FIELDS },
  { code: 'CITY_MAX_CHANNELS', type: 'number', source: 'City.tariffFacts.maxChannels', scope: 'CITY', name: 'Максимум каналов города', description: 'Максимальное известное число каналов опубликованных пакетов с ТВ.', example: '150', status: 'ACTIVE', allowedContexts: CITY_CONTEXTS, allowedFields: PAGE_FIELDS },
];

const BY_CODE = new Map<string, VariableDefinition>(DEFINITIONS.map((definition) => [definition.code, definition]));
const VARIABLE_NUMBER_FORMAT = new Intl.NumberFormat('ru-RU', { useGrouping: false, maximumFractionDigits: 2 });

export function getVariableScope(code: string): VariableScope | undefined {
  return BY_CODE.get(code)?.scope;
}

export interface VariableContext {
  site?: { connectionPhone?: string | null; supportPhone?: string | null; corporatePhone?: string | null; connectionHours?: string | null; supportHours?: string | null; onlineApplicationsHours?: string | null; callbackWithinMinutes?: number | null };
  provider?: { name?: string | null };
  city?: { name?: string | null; nameGenitive?: string | null; namePrepositional?: string | null; tariffFacts?: { minPrice?: number | null; maxSpeed?: number | null; maxChannels?: number | null } };
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

export interface VariableTextResolution {
  text: string;
  warnings: VariableWarning[];
  codes?: readonly VariableCode[];
}

export function listVariableDefinitions(): VariableDefinition[] {
  return DEFINITIONS.map((definition) => ({ ...definition, allowedContexts: [...definition.allowedContexts], allowedFields: [...new Set([
    ...definition.allowedFields, ...(definition.scope === 'SITE' ? [...HOME_VARIABLE_FIELDS, ...SPEED_TEST_VARIABLE_FIELDS, ...ROUTER_VARIABLE_FIELDS] : []), ...(['SITE', 'CITY'].includes(definition.scope) ? SUPPORT_VARIABLE_FIELDS : []),
    ...(['SITE', 'CITY'].includes(definition.scope) ? CITY_VARIABLE_FIELDS : []),
  ])] }));
}

function sourceValue(code: VariableCode, context: VariableContext): unknown {
  switch (code) {
    case 'CONNECTION_PHONE': return context.site?.connectionPhone;
    case 'SUPPORT_PHONE': return context.site?.supportPhone;
    case 'CORPORATE_PHONE': return context.site?.corporatePhone;
    case 'CONNECTION_HOURS': return context.site?.connectionHours;
    case 'SUPPORT_HOURS': return context.site?.supportHours;
    case 'ONLINE_APPLICATIONS_HOURS': return context.site?.onlineApplicationsHours;
    case 'CALLBACK_WITHIN_MINUTES': return context.site?.callbackWithinMinutes;
    case 'PROVIDER_NAME': return context.provider?.name;
    case 'CITY_NAME': return context.city?.name;
    case 'CITY_NAME_GENITIVE': return context.city?.nameGenitive;
    case 'CITY_NAME_PREPOSITIONAL': return context.city?.namePrepositional;
    case 'CITY_MIN_PRICE': return context.city?.tariffFacts?.minPrice;
    case 'CITY_MAX_SPEED': return context.city?.tariffFacts?.maxSpeed;
    case 'CITY_MAX_CHANNELS': return context.city?.tariffFacts?.maxChannels;
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

export function snapshotVariableInputs(codes: readonly string[], context: VariableContext) {
  const inputs: Array<string | number | null | undefined> = [];
  for (const code of codes) {
    const definition = BY_CODE.get(code);
    if (!definition) return null;
    const value = sourceValue(definition.code, context);
    if (definition.type === 'date') {
      if (!(value instanceof Date)) return null;
      inputs.push(value.getTime());
    } else if (value == null || typeof value === 'string' || typeof value === 'number') inputs.push(value);
    else return null;
  }
  return inputs;
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
    return VARIABLE_NUMBER_FORMAT.format(numeric);
  }
  if (typeof value !== 'string' || /[<>\r\n{}]|https?:\/\/|www\./i.test(value)) throw invalid();
  return value;
}

const VARIABLE_TOKEN = /\{([^{}]*)\}/g;
const VARIABLE_BRACE = /[{}]/;
const COMPILED_TEXT_LIMIT = 256;
const NO_CODES: readonly VariableCode[] = [];

function variableTextSyntaxIssue(input: string, hasTokens: boolean, field: 'TEXT' | 'URL') {
  if (hasTokens && /[<>]/.test(input)) return 'HTML-разметка запрещена при подстановке';
  if (field === 'URL') return 'Переменные запрещены в URL';
  if (hasTokens && /(?:https?:\/\/|www\.|\/\/)\S*\{[A-Z_]+\}/i.test(input)) return 'Подстановка в ссылки запрещена';
  return null;
}

function variableDefinition(code: string) {
  const definition = BY_CODE.get(code);
  return definition && /^[A-Z][A-Z0-9_]*$/.test(code) ? definition : undefined;
}

function resolveToken(
  definition: VariableDefinition,
  context: VariableContext,
  path: string,
  warnings: VariableWarning[],
) {
  if ((definition.scope === 'CITY' && !context.city) || (definition.scope === 'TARIFF' && !context.tariff)) {
    warnings.push({ code: definition.code, path, reason: 'OUT_OF_CONTEXT' });
    return '';
  }
  const value = sourceValue(definition.code, context);
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    warnings.push({ code: definition.code, path, reason: 'EMPTY' });
    return '';
  }
  return formatValue(value, definition, path);
}

export function resolveVariableText(
  input: string,
  context: VariableContext,
  location: { path: string; field: 'TEXT' | 'URL' },
): VariableTextResolution {
  if (!input.includes('{') && !input.includes('}')) return { text: input, warnings: [] };

  const matches = [...input.matchAll(VARIABLE_TOKEN)];
  const syntaxIssue = variableTextSyntaxIssue(input, matches.length > 0, location.field);
  if (syntaxIssue) throw new BadRequestException(`${syntaxIssue}: ${location.path}`);
  if (VARIABLE_BRACE.test(input.replace(VARIABLE_TOKEN, ''))) {
    throw new BadRequestException(`Неверный формат скобок переменной: ${location.path}`);
  }
  const warnings: VariableWarning[] = [];
  const text = input.replace(VARIABLE_TOKEN, (_token, rawCode: string) => {
    const definition = variableDefinition(rawCode);
    if (!definition) {
      throw new BadRequestException(`Неизвестный код переменной {${rawCode}}: ${location.path}`);
    }
    return resolveToken(definition, context, location.path, warnings);
  });
  return { text, warnings };
}

interface CompiledVariableText {
  parts: Array<string | VariableDefinition>;
  codes: VariableCode[];
}

function compileVariableText(input: string): CompiledVariableText | null {
  if (variableTextSyntaxIssue(input, true, 'TEXT')) return null;
  const parts: CompiledVariableText['parts'] = [];
  const codes: VariableCode[] = [];
  let end = 0;
  for (const match of input.matchAll(VARIABLE_TOKEN)) {
    const literal = input.slice(end, match.index);
    const definition = variableDefinition(match[1]);
    if (!definition || VARIABLE_BRACE.test(literal)) return null;
    parts.push(literal, definition);
    codes.push(definition.code);
    end = match.index + match[0].length;
  }
  const tail = input.slice(end);
  if (VARIABLE_BRACE.test(tail)) return null;
  parts.push(tail);
  return { parts, codes };
}

/** Reuse syntax within one publication check. Values and diagnostic paths belong to each use. */
export class VariableTextTemplates {
  private readonly compiled = new Map<string, CompiledVariableText>();

  resolve(input: string, context: VariableContext, path: string): VariableTextResolution {
    if (!input.includes('{') && !input.includes('}')) return { text: input, warnings: [], codes: NO_CODES };

    let template = this.compiled.get(input);
    if (!template) {
      const parsed = compileVariableText(input);
      if (!parsed) return resolveVariableText(input, context, { path, field: 'TEXT' });
      if (this.compiled.size < COMPILED_TEXT_LIMIT) this.compiled.set(input, parsed);
      template = parsed;
    }
    const warnings: VariableWarning[] = [];
    let text = '';
    for (const part of template.parts) {
      text += typeof part === 'string' ? part : resolveToken(part, context, path, warnings);
    }
    return { text, warnings, codes: template.codes };
  }
}

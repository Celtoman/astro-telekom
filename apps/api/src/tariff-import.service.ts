import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, PublishStatus, ServiceType, type Redirect, type Tariff } from '../generated';
import { readSheet, type SheetData } from 'read-excel-file/node';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';

export const CANONICAL_IMPORT_COLUMNS = [
  'subekt_rf', 'gorod_name', 'gorod_slug', 'tarif_type', 'post_title', 'tariff_slug',
  'nazvanie_tarifa', 'card_subtitle', 'skorost_interneta', 'tv_channels_total',
  'tv_channels_hd', 'price_standard', 'price_promo', 'connection_cost', 'opisanie_aktsii',
  'opisanie_tarifa', 'card_feature', 'online_cinemas', 'tvbox_installment_price',
  'tvbox_installment_months', 'tvbox_buyout_price', 'router_installment_price',
  'router_installment_months', 'router_buyout_price', 'srv_vkplaycloud_status',
  'srv_video_status', 'srv_video_price', 'cctv_buyout_price', 'cctv_connection_price',
  'srv_gaming_status', 'game_code', 'srv_litres_status', 'srv_ont_status',
  'ont_buyout_price', 'srv_staticip_status', 'badge_text', 'is_sticky',
] as const;

export const REQUIRED_IMPORT_COLUMNS = CANONICAL_IMPORT_COLUMNS;

export const TARIFF_ATTRIBUTE_FIELDS = [
  { key: 'card_subtitle', label: 'Подзаголовок карточки', group: 'Карточка', kind: 'text' },
  { key: 'badge_text', label: 'Бейдж', group: 'Карточка', kind: 'text' },
  { key: 'card_feature', label: 'Короткая особенность', group: 'Карточка', kind: 'text', maxLength: 164 },
  { key: 'opisanie_tarifa', label: 'Полное описание', group: 'Карточка', kind: 'text', multiline: true },
  { key: 'is_sticky', label: 'Закрепленный тариф', group: 'Карточка', kind: 'boolean' },
  { key: 'tv_channels_total', label: 'ТВ-каналов', group: 'Телевидение', kind: 'integer' },
  { key: 'tv_channels_hd', label: 'HD-каналов', group: 'Телевидение', kind: 'integer' },
  { key: 'online_cinemas', label: 'Онлайн-кинотеатры', group: 'Телевидение', kind: 'code-list' },
  { key: 'router_buyout_price', label: 'Выкуп роутера, ₽', group: 'Оборудование', kind: 'integer' },
  { key: 'router_installment_months', label: 'Рассрочка роутера, мес.', group: 'Оборудование', kind: 'integer' },
  { key: 'router_installment_price', label: 'Платеж за роутер, ₽', group: 'Оборудование', kind: 'integer' },
  { key: 'tvbox_buyout_price', label: 'Выкуп ТВ-приставки, ₽', group: 'Оборудование', kind: 'integer' },
  { key: 'tvbox_installment_months', label: 'Рассрочка ТВ-приставки, мес.', group: 'Оборудование', kind: 'integer' },
  { key: 'tvbox_installment_price', label: 'Платеж за ТВ-приставку, ₽', group: 'Оборудование', kind: 'integer' },
  { key: 'ont_buyout_price', label: 'Выкуп ONT, ₽', group: 'Оборудование', kind: 'integer' },
  { key: 'cctv_buyout_price', label: 'Выкуп видеонаблюдения, ₽', group: 'Оборудование', kind: 'integer' },
  { key: 'cctv_connection_price', label: 'Подключение видеонаблюдения, ₽', group: 'Оборудование', kind: 'integer' },
  { key: 'srv_video_status', label: 'Видеонаблюдение', group: 'Сервисы', kind: 'service-status' },
  { key: 'srv_video_price', label: 'Цена видеонаблюдения, ₽', group: 'Сервисы', kind: 'integer' },
  { key: 'srv_gaming_status', label: 'Игровой сервис', group: 'Сервисы', kind: 'service-status' },
  { key: 'game_code', label: 'Код игрового предложения', group: 'Сервисы', kind: 'game-code' },
  { key: 'srv_vkplaycloud_status', label: 'VK Play Cloud', group: 'Сервисы', kind: 'service-status' },
  { key: 'srv_litres_status', label: 'ЛитРес', group: 'Сервисы', kind: 'service-status' },
  { key: 'srv_ont_status', label: 'ONT', group: 'Сервисы', kind: 'service-status' },
  { key: 'srv_staticip_status', label: 'Статический IP', group: 'Сервисы', kind: 'service-status' },
] as const;

type TariffAttributeField = typeof TARIFF_ATTRIBUTE_FIELDS[number];
const ATTRIBUTE_FIELD_BY_KEY = new Map<string, TariffAttributeField>(TARIFF_ATTRIBUTE_FIELDS.map((field) => [field.key, field]));
const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;
const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_COLUMNS = 256;
const ONLINE_CINEMA_CODES = new Set(['ivi', 'kinopoisk', 'start', 'premier', 'amediateka']);
const GAME_CODES = new Set(['warface', 'lesta']);
const SERVICE_STATUS_BY_SOURCE = new Map<number, 'UNAVAILABLE' | 'OPTIONAL' | 'INCLUDED'>([
  [0, 'UNAVAILABLE'],
  [1, 'OPTIONAL'],
  [-1, 'INCLUDED'],
]);
const SERVICE_STATUSES = new Set(SERVICE_STATUS_BY_SOURCE.values());

export interface ImportIssue {
  row: number;
  level: 'error' | 'warning';
  message: string;
  key?: string;
}

export interface ImportCandidate {
  key: string;
  providerId: string;
  cityId: string;
  citySlug: string;
  name: string;
  slug: string;
  serviceType: ServiceType;
  standardPrice: number;
  promoPrice: number | null;
  speed: number;
  promoText: string | null;
  connectionFee: number | null;
  availability: boolean;
  identityKey: string;
  dataSource: string;
  attributes: Prisma.InputJsonObject;
  status: 'PUBLISHED';
}

export interface ImportDiff {
  created: number;
  updated: number;
  deleted: number;
  deletedTariffs: Array<{ id: string; cityId: string; name: string; slug: string }>;
}

export interface TariffImportSnapshot {
  id: string;
  updatedAt: string;
}

export interface ImportReport {
  reportVersion: 2;
  fileName: string;
  providerId: string;
  createdAt: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  issues: ImportIssue[];
  candidates: ImportCandidate[];
  existingSnapshot: TariffImportSnapshot[];
  diff: ImportDiff;
}

type StoredTariff = {
  id: string;
  providerId: string;
  cityId: string;
  name: string;
  slug: string;
  serviceType: string;
  standardPrice: string | null;
  promoPrice: string | null;
  speed: number | null;
  promoText: string | null;
  connectionFee: string | null;
  availability: boolean;
  externalId: string | null;
  identityKey: string | null;
  dataSource: string | null;
  attributes: Prisma.JsonValue | null;
  seo: Prisma.JsonValue | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type StoredRedirect = {
  id: string;
  siteId: string;
  cityId: string | null;
  sourcePath: string;
  targetPath: string;
  managedTariffId: string | null;
  status: string;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredLeadAssignment = {
  id: string;
  tariffId: string;
  updatedAt: string;
};

type TariffImportChangeSet = {
  version: 2;
  kind: 'TARIFF_IMPORT';
  providerId: string;
  runId: string;
  beforeTariffs: StoredTariff[];
  afterTariffs: StoredTariff[];
  redirectSnapshot: StoredRedirect[];
  leadAssignments: StoredLeadAssignment[];
  siteCityIds: Array<{ siteId: string; cityIds: string[] }>;
  workingRevisions: Array<{ siteId: string; workingRevision: number }>;
};

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const dateText = (value: Date | null) => value ? value.toISOString() : null;
const snapshotTariff = (tariff: Tariff): StoredTariff => ({
  id: tariff.id,
  providerId: tariff.providerId,
  cityId: tariff.cityId,
  name: tariff.name,
  slug: tariff.slug,
  serviceType: tariff.serviceType,
  standardPrice: tariff.standardPrice === null ? null : String(tariff.standardPrice),
  promoPrice: tariff.promoPrice === null ? null : String(tariff.promoPrice),
  speed: tariff.speed,
  promoText: tariff.promoText,
  connectionFee: tariff.connectionFee === null ? null : String(tariff.connectionFee),
  availability: tariff.availability,
  externalId: tariff.externalId,
  identityKey: tariff.identityKey,
  dataSource: tariff.dataSource,
  attributes: tariff.attributes === null ? null : jsonCopy(tariff.attributes),
  seo: tariff.seo === null ? null : jsonCopy(tariff.seo),
  status: tariff.status,
  createdAt: tariff.createdAt.toISOString(),
  updatedAt: tariff.updatedAt.toISOString(),
});
const snapshotRedirect = (redirect: Redirect): StoredRedirect => ({
  id: redirect.id,
  siteId: redirect.siteId,
  cityId: redirect.cityId,
  sourcePath: redirect.sourcePath,
  targetPath: redirect.targetPath,
  managedTariffId: redirect.managedTariffId,
  status: redirect.status,
  hitCount: redirect.hitCount,
  lastHitAt: dateText(redirect.lastHitAt),
  createdAt: redirect.createdAt.toISOString(),
  updatedAt: redirect.updatedAt.toISOString(),
});
const redirectContentSnapshot = (redirect: StoredRedirect) => ({
  id: redirect.id,
  siteId: redirect.siteId,
  cityId: redirect.cityId,
  sourcePath: redirect.sourcePath,
  targetPath: redirect.targetPath,
  managedTariffId: redirect.managedTariffId,
  status: redirect.status,
});
const restoreTariffData = (tariff: StoredTariff) => ({
  providerId: tariff.providerId,
  cityId: tariff.cityId,
  name: tariff.name,
  slug: tariff.slug,
  serviceType: tariff.serviceType as ServiceType,
  standardPrice: tariff.standardPrice,
  promoPrice: tariff.promoPrice,
  speed: tariff.speed,
  promoText: tariff.promoText,
  connectionFee: tariff.connectionFee,
  availability: tariff.availability,
  externalId: tariff.externalId,
  identityKey: tariff.identityKey,
  dataSource: tariff.dataSource,
  attributes: tariff.attributes === null ? Prisma.JsonNull : tariff.attributes as Prisma.InputJsonValue,
  seo: tariff.seo === null ? Prisma.JsonNull : tariff.seo as Prisma.InputJsonValue,
  status: tariff.status as PublishStatus,
});
const isTariffImportChangeSet = (value: unknown): value is TariffImportChangeSet => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const changeSet = value as Partial<TariffImportChangeSet>;
  return changeSet.version === 2
    && changeSet.kind === 'TARIFF_IMPORT'
    && typeof changeSet.providerId === 'string'
    && typeof changeSet.runId === 'string'
    && Array.isArray(changeSet.beforeTariffs)
    && Array.isArray(changeSet.afterTariffs)
    && Array.isArray(changeSet.redirectSnapshot)
    && Array.isArray(changeSet.leadAssignments)
    && Array.isArray(changeSet.siteCityIds)
    && Array.isArray(changeSet.workingRevisions);
};

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const empty = (value: unknown) => text(value) === '';
const integer = (value: unknown): number | null => {
  if (value === null || value === undefined || text(value) === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && Number.isInteger(value) ? value : Number.NaN;
  const normalized = text(value);
  return /^-?\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
};
const slug = (value: unknown) => text(value).toLowerCase();

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', hellip: '…', laquo: '«', lt: '<', mdash: '—', nbsp: ' ', ndash: '–', quot: '"', raquo: '»',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity;
    const codePoint = Number.parseInt(code.startsWith('#x') ? code.slice(2) : code.slice(1), code.startsWith('#x') ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity;
    return String.fromCodePoint(codePoint);
  });
}

export function htmlToPlainText(value: unknown, multiline = false) {
  let normalized = decodeHtmlEntities(text(value))
    .replace(/<\s*(script|style)(?:\s[^>]*)?>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n')
    .replace(/<\s*li(?:\s[^>]*)?>/gi, '- ')
    .replace(/<\s*\/\s*li\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  normalized = normalized.replace(/\r\n?/g, '\n').replace(/[\t\f\v ]+/g, ' ');
  if (!multiline) return normalized.replace(/\s+/g, ' ').trim();
  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .trim();
}

function normalizeAttributeValue(field: TariffAttributeField, value: unknown): Prisma.InputJsonValue | null {
  if (empty(value)) return null;
  if (field.kind === 'text') {
    const normalized = htmlToPlainText(value, 'multiline' in field && field.multiline === true);
    const maxLength = 'maxLength' in field ? field.maxLength : 50_000;
    if (normalized.length > maxLength) throw new BadRequestException(`${field.key} длиннее ${maxLength} символов`);
    return normalized;
  }
  if (field.kind === 'code-list') {
    const codes = [...new Set(text(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
    const unknown = codes.find((code) => !ONLINE_CINEMA_CODES.has(code));
    if (unknown) throw new BadRequestException(`${field.key} содержит неизвестный код «${unknown}»`);
    return codes.join(',');
  }
  if (field.kind === 'game-code') {
    const code = text(value).toLowerCase();
    if (!GAME_CODES.has(code)) throw new BadRequestException(`${field.key} содержит неизвестный код «${code}»`);
    return code;
  }
  if (field.kind === 'boolean') {
    if (typeof value === 'boolean') return value;
    const normalized = integer(value);
    if (normalized === null || ![0, 1].includes(normalized)) throw new BadRequestException(`${field.key} должен быть 0 или 1`);
    return normalized === 1;
  }
  if (field.kind === 'service-status') {
    const internalStatus = text(value).toUpperCase();
    if (SERVICE_STATUSES.has(internalStatus as 'UNAVAILABLE' | 'OPTIONAL' | 'INCLUDED')) {
      return internalStatus;
    }
    const sourceStatus = integer(value);
    const normalized = sourceStatus === null ? undefined : SERVICE_STATUS_BY_SOURCE.get(sourceStatus);
    if (!normalized) throw new BadRequestException(`${field.key} должен быть -1, 0 или 1`);
    return normalized;
  }
  const normalized = integer(value);
  if (normalized === null) return null;
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new BadRequestException(`${field.key} должен быть целым числом от 0`);
  }
  return normalized;
}

export function normalizeTariffAttributes(value: unknown): Prisma.InputJsonObject {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value) || typeof value !== 'object') throw new BadRequestException('attributes должен быть объектом');
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    const field = ATTRIBUTE_FIELD_BY_KEY.get(key);
    if (!field) throw new BadRequestException(`${key} не входит в текущий контракт полей тарифа`);
    const normalized = normalizeAttributeValue(field, raw);
    if (normalized !== null) result[key] = normalized;
  }
  const total = result.tv_channels_total;
  const hd = result.tv_channels_hd;
  if (typeof total === 'number' && total <= 0) throw new BadRequestException('tv_channels_total должен быть положительным целым числом');
  if (typeof hd === 'number' && hd <= 0) throw new BadRequestException('tv_channels_hd должен быть положительным целым числом');
  if (typeof total === 'number' && typeof hd === 'number' && hd > total) {
    throw new BadRequestException('tv_channels_hd не может быть больше tv_channels_total');
  }
  for (const [priceKey, monthsKey] of [
    ['router_installment_price', 'router_installment_months'],
    ['tvbox_installment_price', 'tvbox_installment_months'],
  ] as const) {
    const price = result[priceKey];
    const months = result[monthsKey];
    if ((price === undefined) !== (months === undefined)) throw new BadRequestException(`${priceKey} и ${monthsKey} должны быть заполнены вместе`);
    if ((typeof price === 'number' && price <= 0) || (typeof months === 'number' && months <= 0)) {
      throw new BadRequestException(`${priceKey} и ${monthsKey} должны быть положительными или пустыми`);
    }
  }
  const gamingStatus = result.srv_gaming_status;
  const gameCode = result.game_code;
  if (gamingStatus !== undefined && gamingStatus !== 'UNAVAILABLE' && gameCode === undefined) {
    throw new BadRequestException('game_code обязателен для доступного игрового предложения');
  }
  if (gamingStatus === 'UNAVAILABLE' && gameCode !== undefined) {
    throw new BadRequestException('Для srv_gaming_status=UNAVAILABLE поле game_code должно быть пустым');
  }
  for (const [statusKey, dependentKeys] of [
    ['srv_video_status', ['srv_video_price', 'cctv_buyout_price', 'cctv_connection_price']],
    ['srv_ont_status', ['ont_buyout_price']],
  ] as const) {
    if (result[statusKey] === 'UNAVAILABLE' && dependentKeys.some((key) => result[key] !== undefined)) {
      throw new BadRequestException(`Для ${statusKey}=UNAVAILABLE зависимые цены должны быть пустыми`);
    }
  }
  return result as Prisma.InputJsonObject;
}

export async function parseWorkbook(buffer: Buffer, fileName = 'import.xlsx'): Promise<Record<string, unknown>[]> {
  if (!/\.xlsx$/i.test(fileName.trim())) {
    throw new BadRequestException('Поддерживаются только файлы .xlsx');
  }
  if (buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new BadRequestException('Файл слишком большой; максимум 25 МБ');
  }

  let sheet: SheetData;
  try {
    sheet = await readSheet(buffer);
  } catch {
    throw new BadRequestException('Не удалось прочитать XLSX-файл');
  }

  const headerRow = sheet[0];
  if (!headerRow?.length) throw new BadRequestException('В файле нет заголовков');
  if (headerRow.length > MAX_IMPORT_COLUMNS) {
    throw new BadRequestException(`В файле больше ${MAX_IMPORT_COLUMNS} столбцов`);
  }
  if (sheet.length - 1 > MAX_IMPORT_ROWS) {
    throw new BadRequestException(`В файле больше ${MAX_IMPORT_ROWS} строк`);
  }

  const columns = headerRow.map((value, index) => ({ index, name: String(value ?? '').replace(/^\uFEFF/, '').trim() }));
  if (columns.some((column) => !column.name)) throw new BadRequestException('Заголовки XLSX не могут быть пустыми');
  const duplicate = columns.find((column, index) => columns.findIndex((candidate) => candidate.name === column.name) !== index);
  if (duplicate) throw new BadRequestException(`В файле повторяется колонка «${duplicate.name}»`);

  const rows = sheet.slice(1)
    .filter((row) => row.some((value) => value !== null && value !== undefined && value !== ''))
    .map((row) => Object.fromEntries(columns.map((column) => [column.name, row[column.index] ?? null])));
  if (!rows.length) throw new BadRequestException('В файле нет строк данных');
  return rows;
}

@Injectable()
export class TariffImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  async validateRows(providerId: string, fileName: string, sourceRows: Record<string, unknown>[]): Promise<ImportReport> {
    if (!providerId) throw new BadRequestException('providerId обязателен');
    if (!sourceRows.length) throw new BadRequestException('Файл не содержит строк');
    const normalizedRows = sourceRows.map((row) => Object.fromEntries(Object.entries(row).map(([column, value]) => [column.replace(/^\uFEFF/, '').trim(), value])));
    const columns = Object.keys(normalizedRows[0] || {});
    if (!isDeepStrictEqual(columns, [...CANONICAL_IMPORT_COLUMNS])) {
      throw new BadRequestException(`Структура XLSX не соответствует каноническому контракту. Ожидаются 37 колонок в точном порядке: ${CANONICAL_IMPORT_COLUMNS.join(', ')}`);
    }
    if (normalizedRows.some((row) => !isDeepStrictEqual(Object.keys(row), columns))) {
      throw new BadRequestException('Все строки XLSX должны соответствовать единому набору из 37 колонок');
    }

    const citySlugs = [...new Set(normalizedRows.map((row) => slug(row.gorod_slug)).filter(Boolean))];
    const cities = await this.prisma.city.findMany({
      where: { slug: { in: citySlugs }, site: { providerId } },
      select: {
        id: true,
        name: true,
        slug: true,
        region: { select: { name: true } },
        pages: { where: { status: 'PUBLISHED', type: { notIn: ['HOME', 'TARIFF'] } }, select: { slug: true } },
      },
    });
    const cityBySlug = new Map(cities.map((city) => [city.slug.toLowerCase(), city]));
    const publishedPagePaths = new Set(cities.flatMap((city) => (city.pages || []).map((page) => `${city.id}:${page.slug}`)));
    const issues: ImportIssue[] = [];
    const candidates: ImportCandidate[] = [];
    const keyCounts = new Map<string, number>();
    const citySlugCounts = new Map<string, number>();
    for (const row of normalizedRows) {
      const candidateKey = `${slug(row.gorod_slug)}-${slug(row.tariff_slug)}-${text(row.tarif_type)}`;
      if (candidateKey !== '--') keyCounts.set(candidateKey, (keyCounts.get(candidateKey) || 0) + 1);
      const citySlugKey = `${slug(row.gorod_slug)}|${slug(row.tariff_slug)}`;
      if (citySlugKey !== '|') citySlugCounts.set(citySlugKey, (citySlugCounts.get(citySlugKey) || 0) + 1);
    }

    normalizedRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const citySlug = slug(row.gorod_slug);
      const tariffSlug = slug(row.tariff_slug);
      const typeText = text(row.tarif_type);
      const serviceType = typeText === 'Интернет' ? ServiceType.INTERNET : typeText === 'Интернет+ТВ' ? ServiceType.INTERNET_TV : null;
      const canonicalName = htmlToPlainText(row.nazvanie_tarifa);
      const key = citySlug && tariffSlug && typeText ? `${citySlug}-${tariffSlug}-${typeText}` : undefined;
      const add = (level: ImportIssue['level'], message: string) => issues.push({ row: rowNumber, level, message, key });

      for (const field of ['subekt_rf', 'gorod_name', 'gorod_slug', 'tarif_type', 'post_title', 'tariff_slug', 'nazvanie_tarifa', 'skorost_interneta', 'price_standard']) {
        if (empty(row[field])) add('error', `Обязательное поле «${field}» пусто`);
      }
      for (const field of ['srv_vkplaycloud_status', 'srv_video_status', 'srv_gaming_status', 'srv_litres_status', 'srv_ont_status', 'srv_staticip_status']) {
        if (empty(row[field])) add('error', `Обязательный статус «${field}» пуст`);
        else {
          const sourceStatus = integer(row[field]);
          if (sourceStatus === null || !SERVICE_STATUS_BY_SOURCE.has(sourceStatus)) add('error', `${field} должен быть -1, 0 или 1`);
        }
      }
      if (citySlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(citySlug)) add('error', 'gorod_slug должен быть латинским slug');
      if (tariffSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tariffSlug)) add('error', 'tariff_slug должен быть латинским slug');
      if (citySlug && !cityBySlug.has(citySlug)) add('error', `Город «${citySlug}» не найден у выбранного провайдера`);
      const matchedCity = cityBySlug.get(citySlug);
      if (matchedCity?.name && htmlToPlainText(row.gorod_name).toLocaleLowerCase('ru-RU') !== htmlToPlainText(matchedCity.name).toLocaleLowerCase('ru-RU')) {
        add('error', `gorod_name не соответствует городу со slug «${citySlug}»`);
      }
      if (matchedCity?.region?.name && htmlToPlainText(row.subekt_rf).toLocaleLowerCase('ru-RU') !== htmlToPlainText(matchedCity.region.name).toLocaleLowerCase('ru-RU')) {
        add('error', `subekt_rf не соответствует региону города «${citySlug}»`);
      }
      if (matchedCity && tariffSlug && publishedPagePaths.has(`${matchedCity.id}:${tariffSlug}`)) {
        add('error', `URL /${citySlug}/${tariffSlug} уже занят опубликованной страницей`);
      }
      if (!serviceType && !empty(row.tarif_type)) add('error', 'tarif_type должен быть «Интернет» или «Интернет+ТВ»');
      if (key && (keyCounts.get(key) || 0) > 1) add('error', `Дубликат ключа ${key} в одном файле`);
      if (citySlug && tariffSlug && (citySlugCounts.get(`${citySlug}|${tariffSlug}`) || 0) > 1) {
        add('error', `tariff_slug «${tariffSlug}» повторяется в городе «${citySlug}»`);
      }
      const postTitle = htmlToPlainText(row.post_title);
      if (postTitle && canonicalName && postTitle !== canonicalName) add('error', 'post_title должен точно совпадать с nazvanie_tarifa');

      const speed = integer(row.skorost_interneta);
      const standardPrice = integer(row.price_standard);
      const promoPrice = integer(row.price_promo);
      const connectionFee = integer(row.connection_cost);
      const tvChannelsTotal = integer(row.tv_channels_total);
      const tvChannelsHd = integer(row.tv_channels_hd);
      if (speed === null || speed <= 0 || !Number.isInteger(speed)) add('error', 'skorost_interneta должен быть положительным целым числом');
      if (standardPrice === null || standardPrice <= 0 || !Number.isInteger(standardPrice)) add('error', 'price_standard должен быть положительным целым числом');
      if (promoPrice !== null && (!Number.isInteger(promoPrice) || promoPrice <= 0 || (standardPrice !== null && promoPrice >= standardPrice))) {
        add('error', 'price_promo должен быть положительным целым числом меньше price_standard');
      }
      if (connectionFee !== null && (!Number.isInteger(connectionFee) || connectionFee < 0)) add('error', 'connection_cost должен быть целым числом от 0 или пустым');
      if (serviceType === ServiceType.INTERNET && (!empty(row.tv_channels_total) || !empty(row.tv_channels_hd))) {
        add('error', 'Для тарифа «Интернет» поля телеканалов должны быть пустыми');
      }
      if (serviceType === ServiceType.INTERNET_TV && (tvChannelsTotal === null || tvChannelsTotal <= 0 || !Number.isInteger(tvChannelsTotal))) {
        add('error', 'Для тарифа «Интернет+ТВ» tv_channels_total должен быть положительным целым числом');
      }
      if (tvChannelsHd !== null && (tvChannelsHd <= 0 || !Number.isInteger(tvChannelsHd))) {
        add('error', 'tv_channels_hd должен быть положительным целым числом или пустым');
      }
      if (tvChannelsTotal !== null && tvChannelsHd !== null && tvChannelsHd > tvChannelsTotal) {
        add('error', 'tv_channels_hd не может быть больше tv_channels_total');
      }
      const attributeSource = Object.fromEntries(TARIFF_ATTRIBUTE_FIELDS.map((field) => [field.key, row[field.key]]));
      for (const [priceKey, monthsKey] of [
        ['router_installment_price', 'router_installment_months'],
        ['tvbox_installment_price', 'tvbox_installment_months'],
      ] as const) {
        const price = integer(attributeSource[priceKey]);
        const months = integer(attributeSource[monthsKey]);
        if ((price === null || price === 0) && (months === null || months === 0)) {
          attributeSource[priceKey] = null;
          attributeSource[monthsKey] = null;
        }
      }
      if (htmlToPlainText(row.card_feature).length > 164) {
        add('warning', 'card_feature длиннее 164 символов и будет очищен');
        attributeSource.card_feature = null;
      }
      let attributes: Prisma.InputJsonObject = {};
      try {
        attributes = normalizeTariffAttributes(attributeSource);
      } catch (error) {
        add('error', error instanceof Error ? error.message : 'Атрибуты тарифа содержат некорректное значение');
      }

      if (key && serviceType && matchedCity && speed !== null && speed > 0 && Number.isInteger(speed) && standardPrice !== null && standardPrice > 0 && !issues.some((issue) => issue.row === rowNumber && issue.level === 'error')) {
        const city = cityBySlug.get(citySlug)!;
        candidates.push({
          key, providerId, cityId: city.id, citySlug, name: canonicalName, slug: tariffSlug,
          serviceType, standardPrice, promoPrice, speed, promoText: htmlToPlainText(row.opisanie_aktsii) || null,
          connectionFee, availability: true,
          identityKey: `${city.id}:${tariffSlug}:${serviceType.toLowerCase()}`, dataSource: fileName, attributes: attributes as Prisma.InputJsonObject, status: 'PUBLISHED',
        });
      }
    });

    const existingTariffs = await this.prisma.tariff.findMany({
      where: { providerId },
      select: { id: true, cityId: true, name: true, slug: true, identityKey: true, updatedAt: true },
    });
    const matchedIds = new Set<string>();
    let created = 0;
    let updated = 0;
    for (const candidate of candidates) {
      const existing = existingTariffs.find((tariff) => tariff.cityId === candidate.cityId
        && (tariff.identityKey === candidate.identityKey || tariff.slug === candidate.slug));
      if (existing) {
        matchedIds.add(existing.id);
        updated += 1;
      } else {
        created += 1;
      }
    }
    const deletedTariffs = existingTariffs
      .filter((tariff) => !matchedIds.has(tariff.id))
      .map(({ id, cityId, name, slug: tariffSlug }) => ({ id, cityId, name, slug: tariffSlug }));
    const errorRows = new Set(issues.filter((issue) => issue.level === 'error').map((issue) => issue.row)).size;
    const warningRows = new Set(issues.filter((issue) => issue.level === 'warning').map((issue) => issue.row)).size;
    return {
      reportVersion: 2 as const, fileName, providerId, createdAt: new Date().toISOString(), totalRows: normalizedRows.length,
      validRows: candidates.length, errorRows, warningRows, issues, candidates,
      existingSnapshot: existingTariffs.map((tariff) => ({ id: tariff.id, updatedAt: tariff.updatedAt.toISOString() })),
      diff: { created, updated, deleted: deletedTariffs.length, deletedTariffs },
    };
  }

  async applyReport(report: ImportReport, options: { confirmWarnings?: boolean } = {}, runId?: string, actorId?: string) {
    if (report.reportVersion !== 2 || !Array.isArray(report.existingSnapshot)) {
      throw new BadRequestException('Отчет импорта создан в старом формате; проверьте файл заново');
    }
    if (report.errorRows > 0) throw new BadRequestException('Нельзя применить импорт с ошибками');
    if (report.warningRows > 0 && !options.confirmWarnings) {
      throw new BadRequestException('Перед применением необходимо явно подтвердить предупреждения импорта');
    }
    return this.prisma.$transaction(async (transaction) => {
      const existingTariffs = await transaction.tariff.findMany({ where: { providerId: report.providerId } });
      const beforeSnapshots = runId
        ? existingTariffs.map(snapshotTariff).sort((left, right) => left.id.localeCompare(right.id))
        : [];
      const expectedById = new Map(report.existingSnapshot.map((tariff) => [tariff.id, tariff.updatedAt]));
      const catalogChanged = existingTariffs.length !== report.existingSnapshot.length
        || existingTariffs.some((tariff) => expectedById.get(tariff.id) !== tariff.updatedAt.toISOString());
      if (catalogChanged) {
        throw new BadRequestException('Каталог тарифов изменился после проверки; проверьте файл заново');
      }
      if (report.candidates.length) {
        const pageCollisions = await transaction.page.findMany({
          where: {
            status: 'PUBLISHED',
            type: { notIn: ['HOME', 'TARIFF'] },
            cityId: { in: [...new Set(report.candidates.map((candidate) => candidate.cityId))] },
            slug: { in: [...new Set(report.candidates.map((candidate) => candidate.slug))] },
          },
          select: { cityId: true, slug: true },
        });
        const candidatePaths = new Set(report.candidates.map((candidate) => `${candidate.cityId}:${candidate.slug}`));
        const collision = pageCollisions.find((page) => candidatePaths.has(`${page.cityId}:${page.slug}`));
        if (collision) throw new BadRequestException('Публичный URL тарифа занят опубликованной страницей; проверьте файл заново');
      }
      const matchedIds = new Set<string>();
      let created = 0;
      let updated = 0;
      for (const candidate of report.candidates) {
        const data = {
          providerId: candidate.providerId, cityId: candidate.cityId, name: candidate.name, slug: candidate.slug,
          serviceType: candidate.serviceType, standardPrice: candidate.standardPrice, promoPrice: candidate.promoPrice,
          speed: candidate.speed, promoText: candidate.promoText, connectionFee: candidate.connectionFee,
          availability: candidate.availability, identityKey: candidate.identityKey, dataSource: candidate.dataSource,
          attributes: candidate.attributes, status: candidate.status,
        } satisfies Prisma.TariffUncheckedCreateInput;
        const existing = existingTariffs.find((tariff) => tariff.cityId === candidate.cityId
          && (tariff.identityKey === candidate.identityKey || tariff.slug === candidate.slug));
        if (existing) {
          matchedIds.add(existing.id);
          await transaction.tariff.update({ where: { id: existing.id }, data });
          updated += 1;
        }
        else { await transaction.tariff.create({ data }); created += 1; }
      }
      const staleIds = existingTariffs.filter((tariff) => !matchedIds.has(tariff.id)).map((tariff) => tariff.id);
      const leadAssignments = runId && staleIds.length
        ? await transaction.lead.findMany({
          where: { tariffId: { in: staleIds } },
          select: { id: true, tariffId: true, updatedAt: true },
          orderBy: { id: 'asc' },
        })
        : [];
      if (staleIds.length) await transaction.tariff.deleteMany({ where: { id: { in: staleIds } } });
      const afterTariffs = await transaction.tariff.findMany({ where: { providerId: report.providerId } });
      const workingRevisions: Array<{ siteId: string; workingRevision: number }> = [];
      if (runId) {
        const afterSnapshots = afterTariffs.map(snapshotTariff).sort((left, right) => left.id.localeCompare(right.id));
        const cityIds = [...new Set([...beforeSnapshots, ...afterSnapshots].map((tariff) => tariff.cityId))];
        const cities = cityIds.length
          ? await transaction.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, siteId: true } })
          : [];
        const siteByCity = new Map(cities.map((city) => [city.id, city.siteId]));
        if (siteByCity.size !== cityIds.length) throw new BadRequestException('Не удалось определить сайты всех тарифов импорта');
        const siteIds = [...new Set(cities.map((city) => city.siteId))].sort();
        const redirects = siteIds.length
          ? await transaction.redirect.findMany({ where: { siteId: { in: siteIds } }, orderBy: { id: 'asc' } })
          : [];
        const sites = siteIds.map((siteId) => ({
          siteId,
          cityIds: cities.filter((city) => city.siteId === siteId).map((city) => city.id).sort(),
          beforeTariffs: beforeSnapshots.filter((tariff) => siteByCity.get(tariff.cityId) === siteId),
          afterTariffs: afterSnapshots.filter((tariff) => siteByCity.get(tariff.cityId) === siteId),
        }));
        for (const site of sites) {
          const revision = await this.publications.recordWorkingRevision(transaction, {
            siteId: site.siteId,
            entityType: 'SITE',
            entityId: site.siteId,
            action: 'IMPORT',
            previousSnapshot: { tariffs: site.beforeTariffs },
            snapshot: { tariffs: site.afterTariffs },
            changedFields: ['tariffs'],
            actorId,
            source: `tariff-import:${runId}`,
          });
          workingRevisions.push({ siteId: site.siteId, workingRevision: revision.siteRevision });
        }
        const changeSet: TariffImportChangeSet = {
          version: 2,
          kind: 'TARIFF_IMPORT',
          providerId: report.providerId,
          runId,
          beforeTariffs: beforeSnapshots,
          afterTariffs: afterSnapshots,
          redirectSnapshot: redirects.map(snapshotRedirect),
          leadAssignments: leadAssignments.map((lead) => ({
            id: lead.id,
            tariffId: lead.tariffId!,
            updatedAt: lead.updatedAt.toISOString(),
          })),
          siteCityIds: sites.map(({ siteId, cityIds }) => ({ siteId, cityIds })),
          workingRevisions,
        };
        const claimedRun = await transaction.tariffImportRun.updateMany({
          where: { id: runId, status: 'VALIDATED' },
          data: {
            status: 'APPLIED',
            appliedAt: new Date(),
            appliedById: actorId || null,
            changeSet: changeSet as unknown as Prisma.InputJsonValue,
          },
        });
        if (claimedRun.count !== 1) throw new BadRequestException('Импорт уже применен или его статус изменился');
      }
      return {
        created,
        updated,
        deleted: staleIds.length,
        applied: report.candidates.length,
        ...(runId ? { workingRevisions } : {}),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: IMPORT_TRANSACTION_TIMEOUT_MS });
  }

  async undoImport(runId: string, actorId?: string) {
    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.tariffImportRun.findUnique({ where: { id: runId } });
      if (!run) throw new BadRequestException('Импорт тарифов не найден');
      if (run.status !== 'APPLIED') throw new BadRequestException('Отменить можно только примененный импорт');
      if (!isTariffImportChangeSet(run.changeSet) || run.changeSet.runId !== run.id || run.changeSet.providerId !== run.providerId) {
        throw new BadRequestException('Для этого импорта нет полного безопасного снимка отмены');
      }
      const changeSet = run.changeSet;
      const currentTariffs = (await transaction.tariff.findMany({ where: { providerId: run.providerId } }))
        .map(snapshotTariff)
        .sort((left, right) => left.id.localeCompare(right.id));
      if (!isDeepStrictEqual(currentTariffs, changeSet.afterTariffs)) {
        throw new ConflictException('Каталог тарифов изменен после импорта; безопасная отмена заблокирована');
      }

      const siteIds = changeSet.siteCityIds.map((site) => site.siteId);
      const importedRevisionBySite = new Map(
        changeSet.workingRevisions.map(({ siteId, workingRevision }) => [siteId, workingRevision]),
      );
      if (
        importedRevisionBySite.size !== changeSet.siteCityIds.length
        || changeSet.siteCityIds.some(({ siteId }) => !Number.isInteger(importedRevisionBySite.get(siteId)))
      ) {
        throw new BadRequestException('Для этого импорта нет полного безопасного снимка отмены');
      }
      for (const site of changeSet.siteCityIds) {
        const cityIds = new Set(site.cityIds);
        const tariffIds = [...new Set([...changeSet.beforeTariffs, ...changeSet.afterTariffs]
          .filter((tariff) => cityIds.has(tariff.cityId))
          .map((tariff) => tariff.id))];
        const revisionTargets: Prisma.ContentRevisionWhereInput[] = [
          { entityType: 'REDIRECT' },
          { entityType: 'SITE', source: { startsWith: 'tariff-import' } },
        ];
        if (tariffIds.length) revisionTargets.unshift({ entityType: 'TARIFF', entityId: { in: tariffIds } });
        const laterRevision = await transaction.contentRevision.findFirst({
          where: {
            siteId: site.siteId,
            siteRevision: { gt: importedRevisionBySite.get(site.siteId)! },
            OR: revisionTargets,
          },
          select: { id: true },
        });
        if (laterRevision) {
          throw new ConflictException('Затронутые данные изменялись после импорта; безопасная отмена заблокирована');
        }
      }
      const currentRedirects = siteIds.length
        ? (await transaction.redirect.findMany({ where: { siteId: { in: siteIds } }, orderBy: { id: 'asc' } })).map(snapshotRedirect)
        : [];
      if (!isDeepStrictEqual(
        currentRedirects.map(redirectContentSnapshot),
        changeSet.redirectSnapshot.map(redirectContentSnapshot),
      )) {
        throw new ConflictException('Редиректы затронутого сайта изменены после импорта; безопасная отмена заблокирована');
      }

      const beforeIds = new Set(changeSet.beforeTariffs.map((tariff) => tariff.id));
      const createdIds = changeSet.afterTariffs.filter((tariff) => !beforeIds.has(tariff.id)).map((tariff) => tariff.id);
      if (createdIds.length) {
        const newLeads = await transaction.lead.findMany({
          where: { tariffId: { in: createdIds } },
          select: { id: true },
          take: 1,
        });
        if (newLeads.length) throw new ConflictException('После импорта появились заявки на новые тарифы; безопасная отмена заблокирована');
      }

      if (changeSet.leadAssignments.length) {
        const currentLeads = await transaction.lead.findMany({
          where: { id: { in: changeSet.leadAssignments.map((lead) => lead.id) } },
          select: { id: true, tariffId: true, updatedAt: true },
        });
        const currentById = new Map(currentLeads.map((lead) => [lead.id, lead]));
        const leadChanged = changeSet.leadAssignments.some((saved) => {
          const current = currentById.get(saved.id);
          return !current || current.tariffId !== null || current.updatedAt.toISOString() !== saved.updatedAt;
        });
        if (leadChanged) throw new ConflictException('Связанная заявка изменена после импорта; безопасная отмена заблокирована');
      }

      if (createdIds.length) await transaction.tariff.deleteMany({ where: { id: { in: createdIds } } });
      for (const tariff of changeSet.beforeTariffs) {
        const data = restoreTariffData(tariff);
        await transaction.tariff.upsert({
          where: { id: tariff.id },
          create: { id: tariff.id, ...data, createdAt: new Date(tariff.createdAt) },
          update: data,
        });
      }
      for (const saved of changeSet.leadAssignments) {
        const restored = await transaction.lead.updateMany({
          where: { id: saved.id, tariffId: null, updatedAt: new Date(saved.updatedAt) },
          data: { tariffId: saved.tariffId },
        });
        if (restored.count !== 1) throw new ConflictException('Связанная заявка изменилась во время отмены; операция отменена');
      }

      const workingRevisions: Array<{ siteId: string; workingRevision: number }> = [];
      for (const site of changeSet.siteCityIds) {
        const cityIds = new Set(site.cityIds);
        const beforeTariffs = changeSet.beforeTariffs.filter((tariff) => cityIds.has(tariff.cityId));
        const afterTariffs = changeSet.afterTariffs.filter((tariff) => cityIds.has(tariff.cityId));
        const siteTariffIds = new Set([...beforeTariffs, ...afterTariffs].map((tariff) => tariff.id));
        const leadAssignments = changeSet.leadAssignments.filter((lead) => siteTariffIds.has(lead.tariffId));
        const revision = await this.publications.recordWorkingRevision(transaction, {
          siteId: site.siteId,
          entityType: 'SITE',
          entityId: site.siteId,
          action: 'UNDO',
          previousSnapshot: {
            tariffs: afterTariffs,
            leadAssignments: leadAssignments.map(({ id }) => ({ id, tariffId: null })),
          },
          snapshot: {
            tariffs: beforeTariffs,
            leadAssignments: leadAssignments.map(({ id, tariffId }) => ({ id, tariffId })),
          },
          changedFields: ['tariffs', 'leadAssignments'],
          actorId,
          source: `tariff-import-undo:${runId}`,
        });
        workingRevisions.push({ siteId: site.siteId, workingRevision: revision.siteRevision });
      }
      const claimed = await transaction.tariffImportRun.updateMany({
        where: { id: run.id, status: 'APPLIED' },
        data: {
          status: 'UNDONE',
          undoneAt: new Date(),
          undoneById: actorId || null,
          undoSiteRevisions: workingRevisions as unknown as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('Статус импорта изменился во время отмены; операция отменена');
      return { runId: run.id, restored: changeSet.beforeTariffs.length, removed: createdIds.length, workingRevisions };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: IMPORT_TRANSACTION_TIMEOUT_MS });
  }
}

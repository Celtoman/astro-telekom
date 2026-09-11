import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ServiceType } from '../generated';
import { readSheet, type SheetData } from 'read-excel-file/node';
import { PrismaService } from './prisma.service';

export const REQUIRED_IMPORT_COLUMNS = [
  'subekt_rf', 'gorod_name', 'gorod_slug', 'tarif_type', 'post_title', 'post_title_lat',
  'nazvanie_tarifa', 'skorost_interneta', 'stoimost_tarifa',
] as const;

export const TARIFF_ATTRIBUTE_FIELDS = [
  { key: 'nazvanie_tarifa', label: 'Название в карточке', group: 'Карточка', kind: 'text' },
  { key: 'card_subtitle', label: 'Подзаголовок карточки', group: 'Карточка', kind: 'text' },
  { key: 'badge_text', label: 'Бейдж', group: 'Карточка', kind: 'text' },
  { key: 'promo_feature', label: 'Короткая особенность', group: 'Карточка', kind: 'text', maxLength: 164 },
  { key: 'opisanie_tarifa', label: 'Полное описание', group: 'Карточка', kind: 'text', multiline: true },
  { key: 'show_on_site', label: 'Рекомендация «показывать на сайте»', group: 'Карточка', kind: 'boolean' },
  { key: 'is_sticky', label: 'Закрепленный тариф', group: 'Карточка', kind: 'boolean' },
  { key: 'is_gaming_tarif', label: 'Игровой тариф', group: 'Карточка', kind: 'boolean' },
  { key: 'tv_channels_total', label: 'ТВ-каналов', group: 'Телевидение', kind: 'integer' },
  { key: 'tv_channels_hd', label: 'HD-каналов', group: 'Телевидение', kind: 'integer' },
  { key: 'online_cinemas', label: 'Онлайн-кинотеатры', group: 'Телевидение', kind: 'text', multiline: true },
  { key: 'equip_router', label: 'Условия роутера', group: 'Оборудование', kind: 'text' },
  { key: 'router_buyout_price', label: 'Выкуп роутера, ₽', group: 'Оборудование', kind: 'number' },
  { key: 'router_installment_months', label: 'Рассрочка роутера, мес.', group: 'Оборудование', kind: 'integer' },
  { key: 'router_installment_price', label: 'Платеж за роутер, ₽', group: 'Оборудование', kind: 'number' },
  { key: 'equip_tv_box', label: 'Условия ТВ-приставки', group: 'Оборудование', kind: 'text' },
  { key: 'tvbox_buyout_price', label: 'Выкуп ТВ-приставки, ₽', group: 'Оборудование', kind: 'number' },
  { key: 'tvbox_installment_months', label: 'Рассрочка ТВ-приставки, мес.', group: 'Оборудование', kind: 'integer' },
  { key: 'tvbox_installment_price', label: 'Платеж за ТВ-приставку, ₽', group: 'Оборудование', kind: 'number' },
  { key: 'ont_buyout_price', label: 'Выкуп ONT, ₽', group: 'Оборудование', kind: 'number' },
  { key: 'cctv_buyout_price', label: 'Выкуп камеры, ₽', group: 'Оборудование', kind: 'number' },
  { key: 'cctv_connection_price', label: 'Подключение камеры, ₽', group: 'Оборудование', kind: 'number' },
  { key: 'srv_video_status', label: 'Видеосервис', group: 'Сервисы', kind: 'service-status' },
  { key: 'srv_video_price', label: 'Цена видеосервиса, ₽', group: 'Сервисы', kind: 'number' },
  { key: 'srv_gaming_status', label: 'Игровой сервис', group: 'Сервисы', kind: 'service-status' },
  { key: 'srv_gaming_name', label: 'Название игрового сервиса', group: 'Сервисы', kind: 'text' },
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
const IGNORED_ATTRIBUTE_COLUMNS = new Set([
  ...REQUIRED_IMPORT_COLUMNS,
  'staraia_stoimost', 'connection_cost', 'opisanie_aktsii',
]);
const KNOWN_IMPORT_COLUMNS = new Set([...IGNORED_ATTRIBUTE_COLUMNS, ...TARIFF_ATTRIBUTE_FIELDS.map((field) => field.key)]);

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

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const empty = (value: unknown) => text(value) === '';
const number = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = text(value).replace(/\s/g, '').replace(',', '.');
  if (!normalized || normalized === '-1') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
const signedNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = text(value).replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
const slug = (value: unknown) => text(value).toLowerCase();
function normalizeAttributeValue(field: TariffAttributeField, value: unknown): Prisma.InputJsonValue | null {
  if (empty(value)) return null;
  if (field.kind === 'text') {
    const normalized = text(value);
    const maxLength = 'maxLength' in field ? field.maxLength : 50_000;
    if (normalized.length > maxLength) throw new BadRequestException(`${field.key} длиннее ${maxLength} символов`);
    return normalized;
  }
  if (field.kind === 'boolean') {
    if (typeof value === 'boolean') return value;
    const normalized = number(value);
    if (normalized === null || ![0, 1].includes(normalized)) throw new BadRequestException(`${field.key} должен быть 0 или 1`);
    return normalized === 1;
  }
  const normalized = field.kind === 'service-status' ? signedNumber(value) : number(value);
  if (field.kind === 'service-status') {
    if (normalized === null || ![-1, 0, 1].includes(normalized)) throw new BadRequestException(`${field.key} должен быть -1, 0 или 1`);
    return normalized;
  }
  if (normalized === null) return null;
  if (normalized < 0 || (field.kind === 'integer' && !Number.isInteger(normalized))) {
    throw new BadRequestException(`${field.key} должен быть ${field.kind === 'integer' ? 'целым числом от 0' : 'числом от 0'}`);
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
  if (typeof total === 'number' && typeof hd === 'number' && hd > total) {
    throw new BadRequestException('tv_channels_hd не может быть больше tv_channels_total');
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

  const columns = headerRow
    .map((value, index) => ({ index, name: String(value ?? '').replace(/^\uFEFF/, '').trim() }))
    .filter((column) => column.name);
  if (!columns.length) throw new BadRequestException('В файле нет заголовков');
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
  constructor(private readonly prisma: PrismaService) {}

  async validateRows(providerId: string, fileName: string, sourceRows: Record<string, unknown>[]): Promise<ImportReport> {
    if (!providerId) throw new BadRequestException('providerId обязателен');
    if (!sourceRows.length) throw new BadRequestException('Файл не содержит строк');
    const normalizedRows = sourceRows.map((row) => Object.fromEntries(Object.entries(row).map(([column, value]) => [column.replace(/^\uFEFF/, '').trim(), value])));
    const columns = new Set(Object.keys(normalizedRows[0] || {}));
    const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length) throw new BadRequestException(`В файле отсутствуют обязательные колонки: ${missing.join(', ')}`);

    const citySlugs = [...new Set(normalizedRows.map((row) => slug(row.gorod_slug)).filter(Boolean))];
    const cities = await this.prisma.city.findMany({
      where: { slug: { in: citySlugs }, site: { providerId } },
      select: {
        id: true,
        slug: true,
        pages: { where: { status: 'PUBLISHED', type: { notIn: ['HOME', 'TARIFF'] } }, select: { slug: true } },
      },
    });
    const cityBySlug = new Map(cities.map((city) => [city.slug.toLowerCase(), city]));
    const publishedPagePaths = new Set(cities.flatMap((city) => (city.pages || []).map((page) => `${city.id}:${page.slug}`)));
    const issues: ImportIssue[] = [];
    const candidates: ImportCandidate[] = [];
    const seen = new Set<string>();
    const keyCounts = new Map<string, number>();
    const citySlugCounts = new Map<string, number>();
    for (const row of normalizedRows) {
      const candidateKey = `${slug(row.gorod_slug)}-${slug(row.post_title_lat)}-${text(row.tarif_type)}`;
      if (candidateKey !== '--') keyCounts.set(candidateKey, (keyCounts.get(candidateKey) || 0) + 1);
      const citySlugKey = `${slug(row.gorod_slug)}|${slug(row.post_title_lat)}`;
      if (citySlugKey !== '|') citySlugCounts.set(citySlugKey, (citySlugCounts.get(citySlugKey) || 0) + 1);
    }

    normalizedRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const citySlug = slug(row.gorod_slug);
      const tariffSlug = slug(row.post_title_lat);
      const typeText = text(row.tarif_type);
      const serviceType = typeText === 'Интернет' ? ServiceType.INTERNET : typeText === 'Интернет+ТВ' ? ServiceType.INTERNET_TV : null;
      const key = citySlug && tariffSlug && typeText ? `${citySlug}-${tariffSlug}-${typeText}` : undefined;
      const add = (level: ImportIssue['level'], message: string) => issues.push({ row: rowNumber, level, message, key });

      for (const field of REQUIRED_IMPORT_COLUMNS) if (empty(row[field])) add('error', `Обязательное поле «${field}» пусто`);
      if (citySlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(citySlug)) add('error', 'gorod_slug должен быть латинским slug');
      if (tariffSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tariffSlug)) add('error', 'post_title_lat должен быть латинским slug');
      if (citySlug && !cityBySlug.has(citySlug)) add('error', `Город «${citySlug}» не найден у выбранного провайдера`);
      const matchedCity = cityBySlug.get(citySlug);
      if (matchedCity && tariffSlug && publishedPagePaths.has(`${matchedCity.id}:${tariffSlug}`)) {
        add('error', `URL /${citySlug}/${tariffSlug} уже занят опубликованной страницей`);
      }
      if (!serviceType && !empty(row.tarif_type)) add('error', 'tarif_type должен быть «Интернет» или «Интернет+ТВ»');
      if (key && (keyCounts.get(key) || 0) > 1) add('error', `Дубликат ключа ${key} в одном файле`);
      if (citySlug && tariffSlug && (citySlugCounts.get(`${citySlug}|${tariffSlug}`) || 0) > 1) {
        add('error', `post_title_lat «${tariffSlug}» повторяется в городе «${citySlug}»`);
      }
      if (key && seen.has(key)) add('error', `Дубликат ключа ${key} в одном файле`);
      if (key) seen.add(key);

      const speed = number(row.skorost_interneta);
      const currentPrice = number(row.stoimost_tarifa);
      const tvChannelsTotal = number(row.tv_channels_total);
      const tvChannelsHd = number(row.tv_channels_hd);
      if (speed === null || speed <= 0 || !Number.isInteger(speed)) add('error', 'skorost_interneta должен быть положительным целым числом');
      if (currentPrice === null || currentPrice <= 0) add('error', 'stoimost_tarifa должен быть больше нуля');
      if (!empty(row.tv_channels_total) && (tvChannelsTotal === null || tvChannelsTotal < 0 || !Number.isInteger(tvChannelsTotal))) {
        add('error', 'tv_channels_total должен быть целым числом от 0');
      }
      if (!empty(row.tv_channels_hd) && (tvChannelsHd === null || tvChannelsHd < 0 || !Number.isInteger(tvChannelsHd))) {
        add('error', 'tv_channels_hd должен быть целым числом от 0');
      }
      if (tvChannelsTotal !== null && tvChannelsHd !== null && tvChannelsHd > tvChannelsTotal) {
        add('error', 'tv_channels_hd не может быть больше tv_channels_total');
      }
      for (const [column, value] of Object.entries(row)) {
        if (!KNOWN_IMPORT_COLUMNS.has(column) && !empty(value)) add('error', `${column} не входит в текущий контракт полей тарифа`);
      }
      const oldPrice = number(row.staraia_stoimost);
      if (oldPrice !== null && currentPrice !== null && oldPrice <= currentPrice) add('warning', 'staraia_stoimost не выше текущей цены, акция не будет выделена');
      if (text(row.promo_feature).length >= 165) add('warning', 'promo_feature длиннее 164 символов и будет очищен');
      const attributes: Record<string, Prisma.InputJsonValue> = {};
      for (const field of TARIFF_ATTRIBUTE_FIELDS) {
        try {
          if (field.key === 'promo_feature' && text(row[field.key]).length >= 165) continue;
          const converted = normalizeAttributeValue(field, row[field.key]);
          if (converted !== null) attributes[field.key] = converted;
        } catch (error) {
          add('error', error instanceof Error ? error.message : `${field.key} содержит некорректное значение`);
        }
      }

      if (key && serviceType && cityBySlug.has(citySlug) && speed !== null && speed > 0 && Number.isInteger(speed) && currentPrice !== null && currentPrice > 0 && !issues.some((issue) => issue.row === rowNumber && issue.level === 'error')) {
        const city = cityBySlug.get(citySlug)!;
        const hasPromo = oldPrice !== null && oldPrice > currentPrice;
        candidates.push({
          key, providerId, cityId: city.id, citySlug, name: text(row.post_title), slug: tariffSlug,
          serviceType, standardPrice: hasPromo ? oldPrice! : currentPrice, promoPrice: hasPromo ? currentPrice : null,
          speed, promoText: text(row.opisanie_aktsii) || null, connectionFee: number(row.connection_cost), availability: true,
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

  async applyReport(report: ImportReport, options: { confirmWarnings?: boolean } = {}, runId?: string) {
    if (report.reportVersion !== 2 || !Array.isArray(report.existingSnapshot)) {
      throw new BadRequestException('Отчет импорта создан в старом формате; проверьте файл заново');
    }
    if (report.errorRows > 0) throw new BadRequestException('Нельзя применить импорт с ошибками');
    if (report.warningRows > 0 && !options.confirmWarnings) {
      throw new BadRequestException('Перед применением необходимо явно подтвердить предупреждения импорта');
    }
    return this.prisma.$transaction(async (transaction) => {
      const existingTariffs = await transaction.tariff.findMany({ where: { providerId: report.providerId } });
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
      if (staleIds.length) await transaction.tariff.deleteMany({ where: { id: { in: staleIds } } });
      if (runId) {
        const claimedRun = await transaction.tariffImportRun.updateMany({
          where: { id: runId, status: 'VALIDATED' },
          data: { status: 'APPLIED', appliedAt: new Date() },
        });
        if (claimedRun.count !== 1) throw new BadRequestException('Импорт уже применен или его статус изменился');
      }
      return { created, updated, deleted: staleIds.length, applied: report.candidates.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: IMPORT_TRANSACTION_TIMEOUT_MS });
  }
}

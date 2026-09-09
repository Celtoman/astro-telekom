import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ServiceType } from '../generated';
import { readSheet, type SheetData } from 'read-excel-file/node';
import { PrismaService } from './prisma.service';

export const REQUIRED_IMPORT_COLUMNS = [
  'subekt_rf', 'gorod_name', 'gorod_slug', 'tarif_type', 'post_title', 'post_title_lat',
  'nazvanie_tarifa', 'skorost_interneta', 'stoimost_tarifa',
] as const;

const SERVICE_STATUS_COLUMNS = [
  'srv_vkplaycloud_status', 'srv_video_status', 'srv_gaming_status', 'srv_litres_status',
  'srv_ont_status', 'srv_staticip_status',
];
const BOOLEAN_COLUMNS = ['is_sticky', 'is_gaming_tarif'];
const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;
const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_COLUMNS = 256;
const IGNORED_ATTRIBUTE_COLUMNS = new Set([
  ...REQUIRED_IMPORT_COLUMNS,
  'staraia_stoimost', 'connection_cost', 'opisanie_aktsii', 'opisanie_tarifa', 'promo_feature',
  'card_subtitle', 'tv_channels_total', 'tv_channels_hd', 'show_on_site',
]);

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

export interface ImportReport {
  fileName: string;
  providerId: string;
  createdAt: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  issues: ImportIssue[];
  candidates: ImportCandidate[];
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
const slug = (value: unknown) => text(value).toLowerCase();
const jsonValue = (value: unknown): Prisma.InputJsonValue | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item)).filter((item): item is Prisma.InputJsonValue => item !== null);
  if (typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const converted = jsonValue(item);
      if (converted !== null) result[key] = converted;
    }
    return result as Prisma.InputJsonObject;
  }
  return String(value);
};

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
      select: { id: true, slug: true },
    });
    const cityBySlug = new Map(cities.map((city) => [city.slug.toLowerCase(), city]));
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
      for (const field of SERVICE_STATUS_COLUMNS) {
        if (empty(row[field])) continue;
        const value = number(row[field]);
        if (value === null || ![-1, 0, 1].includes(value)) add('error', `${field} должен быть -1, 0 или 1`);
      }
      for (const field of BOOLEAN_COLUMNS) {
        if (empty(row[field])) continue;
        const value = number(row[field]);
        if (value === null || ![0, 1].includes(value)) add('error', `${field} должен быть 0 или 1`);
      }
      const oldPrice = number(row.staraia_stoimost);
      if (oldPrice !== null && currentPrice !== null && oldPrice <= currentPrice) add('warning', 'staraia_stoimost не выше текущей цены, акция не будет выделена');
      if (text(row.promo_feature).length >= 165) add('warning', 'promo_feature длиннее 164 символов и будет очищен');

      if (key && serviceType && cityBySlug.has(citySlug) && speed !== null && speed > 0 && Number.isInteger(speed) && currentPrice !== null && currentPrice > 0 && !issues.some((issue) => issue.row === rowNumber && issue.level === 'error')) {
        const city = cityBySlug.get(citySlug)!;
        const hasPromo = oldPrice !== null && oldPrice > currentPrice;
        const attributes: Record<string, Prisma.InputJsonValue> = {};
        for (const [column, value] of Object.entries(row)) {
          if (IGNORED_ATTRIBUTE_COLUMNS.has(column)) continue;
          const converted = jsonValue(value);
          if (converted !== null) attributes[column] = converted;
        }
        const promoFeature = text(row.promo_feature);
        if (promoFeature && promoFeature.length < 165) attributes.promo_feature = promoFeature;
        const tariffDescription = text(row.opisanie_tarifa);
        if (tariffDescription) attributes.opisanie_tarifa = tariffDescription;
        if (tvChannelsTotal !== null) attributes.tv_channels_total = tvChannelsTotal;
        if (tvChannelsHd !== null) attributes.tv_channels_hd = tvChannelsHd;
        candidates.push({
          key, providerId, cityId: city.id, citySlug, name: text(row.post_title) || text(row.nazvanie_tarifa), slug: tariffSlug,
          serviceType, standardPrice: hasPromo ? oldPrice! : currentPrice, promoPrice: hasPromo ? currentPrice : null,
          speed, promoText: text(row.opisanie_aktsii) || null, connectionFee: number(row.connection_cost), availability: true,
          identityKey: `${city.id}:${tariffSlug}:${serviceType.toLowerCase()}`, dataSource: fileName, attributes: attributes as Prisma.InputJsonObject, status: 'PUBLISHED',
        });
      }
    });

    const existingTariffs = await this.prisma.tariff.findMany({
      where: { providerId },
      select: { id: true, cityId: true, name: true, slug: true, identityKey: true },
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
      fileName, providerId, createdAt: new Date().toISOString(), totalRows: normalizedRows.length,
      validRows: candidates.length, errorRows, warningRows, issues, candidates,
      diff: { created, updated, deleted: deletedTariffs.length, deletedTariffs },
    };
  }

  async applyReport(report: ImportReport, options: { confirmWarnings?: boolean } = {}, runId?: string) {
    if (report.errorRows > 0) throw new BadRequestException('Нельзя применить импорт с ошибками');
    if (report.warningRows > 0 && !options.confirmWarnings) {
      throw new BadRequestException('Перед применением необходимо явно подтвердить предупреждения импорта');
    }
    return this.prisma.$transaction(async (transaction) => {
      const existingTariffs = await transaction.tariff.findMany({ where: { providerId: report.providerId } });
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
        await transaction.tariffImportRun.update({
          where: { id: runId },
          data: { status: 'APPLIED', appliedAt: new Date() },
        });
      }
      return { created, updated, deleted: staleIds.length, applied: report.candidates.length };
    }, { timeout: IMPORT_TRANSACTION_TIMEOUT_MS });
  }
}

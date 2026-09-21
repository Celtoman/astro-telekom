import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, PublishStatus } from '../generated';
import { cityHomeTemplateBlocks } from './city-home-template';
import { defaultDomruProfileCatalog } from './domru-profile-catalog';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { parseWorkbook } from './tariff-import.service';

export interface CityImportIssue { row: number; level: 'error' | 'warning'; message: string; key?: string }
export type CityImportAction = 'create' | 'update' | 'skip';
export interface CityImportSnapshot {
  id: string;
  regionId: string;
  subject: string;
  name: string;
  namePrepositional: string | null;
  nameGenitive: string | null;
  legacyUrl: string | null;
  officeAddress: string | null;
  officeHours: string | null;
}
export interface CityImportCandidate {
  key: string;
  row: number;
  siteId: string;
  subject: string;
  name: string;
  namePrepositional: string | null;
  nameGenitive: string | null;
  slug: string;
  legacyUrl: string | null;
  officeAddress: string | null;
  officeHours: string | null;
  existingId?: string;
  existingSnapshot?: CityImportSnapshot;
  changes?: Record<string, { from: unknown; to: unknown }>;
}
export interface CityImportReport {
  reportVersion: 2;
  fileName: string;
  siteId: string;
  createdAt: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  issues: CityImportIssue[];
  candidates: CityImportCandidate[];
}

type StoredCity = {
  id: string;
  siteId: string;
  regionId: string;
  name: string;
  slug: string;
  namePrepositional: string | null;
  nameGenitive: string | null;
  legacyUrl: string | null;
  officeAddress: string | null;
  officeHours: string | null;
  officeState: 'HAS_OFFICE' | 'NO_OFFICE';
  subscriberProfileKey: string | null;
  status: string;
};

type StoredRegion = {
  id: string;
  siteId: string;
  name: string;
  slug: string;
};

type StoredPageBlock = {
  id: string;
  pageId: string;
  blockType: string;
  position: number;
  visible: boolean;
  data: unknown;
  source: string | null;
};

type StoredPage = {
  id: string;
  siteId: string;
  cityId: string | null;
  type: string;
  title: string;
  slug: string;
  status: string;
  seo: unknown;
  content: unknown;
  createdAt: string;
  updatedAt: string;
  blocks: StoredPageBlock[];
};

type CityImportChangeSet = {
  version: 1;
  kind: 'CITY_IMPORT';
  siteId: string;
  runId: string;
  actions: Record<string, CityImportAction>;
  createdCityIds: string[];
  beforeCities: StoredCity[];
  afterCities: StoredCity[];
  createdRegions: StoredRegion[];
  createdPages: StoredPage[];
  workingRevision: number | null;
};

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const storedCity = (city: {
  id: string; siteId: string; regionId: string; name: string; slug: string;
  namePrepositional: string | null; nameGenitive: string | null;
  legacyUrl: string | null; officeAddress: string | null; officeHours: string | null; status: string;
  officeState?: 'HAS_OFFICE' | 'NO_OFFICE'; subscriberProfileKey?: string | null;
}): StoredCity => ({
  id: city.id,
  siteId: city.siteId,
  regionId: city.regionId,
  name: city.name,
  slug: city.slug,
  namePrepositional: city.namePrepositional,
  nameGenitive: city.nameGenitive,
  legacyUrl: city.legacyUrl,
  officeAddress: city.officeAddress,
  officeHours: city.officeHours,
  officeState: city.officeState || (city.officeAddress && city.officeHours ? 'HAS_OFFICE' : 'NO_OFFICE'),
  subscriberProfileKey: city.subscriberProfileKey || null,
  status: city.status,
});
const storedRegion = (region: {
  id: string; siteId: string; name: string; slug: string;
}): StoredRegion => ({
  id: region.id,
  siteId: region.siteId,
  name: region.name,
  slug: region.slug,
});
const storedPage = (page: {
  id: string; siteId: string; cityId: string | null; type: string; title: string; slug: string; status: string;
  seo: unknown; content: unknown; createdAt: Date; updatedAt: Date; blocks: Array<{
    id: string; pageId: string; blockType: string; position: number; visible: boolean; data: unknown; source: string | null;
  }>;
}): StoredPage => ({
  id: page.id,
  siteId: page.siteId,
  cityId: page.cityId,
  type: page.type,
  title: page.title,
  slug: page.slug,
  status: page.status,
  seo: page.seo === null ? null : jsonCopy(page.seo),
  content: page.content === null ? null : jsonCopy(page.content),
  createdAt: page.createdAt.toISOString(),
  updatedAt: page.updatedAt.toISOString(),
  blocks: page.blocks.map((block) => ({
    id: block.id,
    pageId: block.pageId,
    blockType: block.blockType,
    position: block.position,
    visible: block.visible,
    data: jsonCopy(block.data),
    source: block.source,
  })),
});

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const isStoredCity = (value: unknown): value is StoredCity => {
  if (!isRecord(value)) return false;
  return ['id', 'siteId', 'regionId', 'name', 'slug', 'status'].every((key) => typeof value[key] === 'string')
    && ['namePrepositional', 'nameGenitive', 'legacyUrl', 'officeAddress', 'officeHours']
      .every((key) => nullableString(value[key]))
    && (!hasOwn(value, 'subscriberProfileKey') || nullableString(value.subscriberProfileKey))
    && (!hasOwn(value, 'officeState') || value.officeState === 'HAS_OFFICE' || value.officeState === 'NO_OFFICE');
};
const isStoredRegion = (value: unknown): value is StoredRegion => {
  if (!isRecord(value)) return false;
  return ['id', 'siteId', 'name', 'slug'].every((key) => typeof value[key] === 'string');
};
const isStoredPageBlock = (value: unknown): value is StoredPageBlock => {
  if (!isRecord(value)) return false;
  return ['id', 'pageId', 'blockType'].every((key) => typeof value[key] === 'string')
    && Number.isInteger(value.position)
    && typeof value.visible === 'boolean'
    && nullableString(value.source)
    && hasOwn(value, 'data');
};
const isStoredPage = (value: unknown): value is StoredPage => {
  if (!isRecord(value)) return false;
  return ['id', 'siteId', 'type', 'title', 'slug', 'status', 'createdAt', 'updatedAt'].every((key) => typeof value[key] === 'string')
    && nullableString(value.cityId)
    && hasOwn(value, 'seo')
    && hasOwn(value, 'content')
    && Array.isArray(value.blocks)
    && value.blocks.every(isStoredPageBlock);
};
export const isCityImportChangeSet = (value: unknown): value is CityImportChangeSet => {
  if (!isRecord(value) || !isRecord(value.actions)) return false;
  return value.version === 1
    && value.kind === 'CITY_IMPORT'
    && typeof value.siteId === 'string'
    && typeof value.runId === 'string'
    && Object.values(value.actions).every((action) => importActions.has(action as CityImportAction))
    && Array.isArray(value.createdCityIds)
    && value.createdCityIds.every((id) => typeof id === 'string')
    && Array.isArray(value.beforeCities)
    && value.beforeCities.every(isStoredCity)
    && Array.isArray(value.afterCities)
    && value.afterCities.every(isStoredCity)
    && Array.isArray(value.createdRegions)
    && value.createdRegions.every(isStoredRegion)
    && Array.isArray(value.createdPages)
    && value.createdPages.every(isStoredPage)
    && (value.workingRevision === null || (Number.isInteger(value.workingRevision) && Number(value.workingRevision) > 0));
};

const restoreCityData = (city: StoredCity) => ({
  regionId: city.regionId,
  name: city.name,
  slug: city.slug,
  namePrepositional: city.namePrepositional,
  nameGenitive: city.nameGenitive,
  legacyUrl: city.legacyUrl,
  officeAddress: city.officeAddress,
  officeHours: city.officeHours,
  officeState: city.officeState,
  subscriberProfileKey: city.subscriberProfileKey,
  status: city.status as PublishStatus,
});

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const transliteration: Record<string, string> = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
const slugify = (value: string) => value.toLocaleLowerCase('ru-RU').split('').map((char) => transliteration[char] ?? char).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalizeColumn = (value: string) => value.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('ru-RU').replace(/[\s./-]+/g, '_');
const importActions = new Set<CityImportAction>(['create', 'update', 'skip']);

const FIELD_ALIASES = {
  subject: ['subekt_rf', 'subject', 'region', 'subekt_rossiyskoy_federatsii', 'субъект_рф'],
  name: ['gorod_name', 'city_name', 'city', 'город', 'город_имен', 'город_имен_падеж', 'город_именительный_падеж'],
  prepositional: ['dom_ru_v', 'gorod_v_predlozhnom_padezhe', 'gorod_predlozh_padezh', 'gorod_v_predlozhnom', 'город_предлож_падеж_dom_ru_v', 'город_предложный_падеж'],
  genitive: ['gorod_v_roditelnom_padezhe', 'gorod_rodit_padezh', 'gorod_v_roditelnom', 'город_родит_падеж', 'город_родительный_падеж', 'город_родит_падеж_gorod_v_rodit_padezhe'],
  slug: ['gorod_slug', 'slug', 'city_slug'],
  legacyUrl: ['url_goroda', 'url_goroda_legacy', 'url', 'gorod_url', 'legacy_url', 'url_города', 'ссылка_города'],
  officeAddress: ['adres_ofisa', 'office_address', 'address_of_office'],
  officeHours: ['rezhim_raboty_ofisa', 'office_hours', 'working_hours'],
} as const;

function valueByAlias(row: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(row, alias) && text(row[alias])) return text(row[alias]);
  return '';
}

function snapshot(city: {
  id: string;
  regionId: string;
  name: string;
  namePrepositional: string | null;
  nameGenitive: string | null;
  legacyUrl: string | null;
  officeAddress: string | null;
  officeHours: string | null;
  region: { name: string };
}): CityImportSnapshot {
  return {
    id: city.id,
    regionId: city.regionId,
    subject: city.region.name,
    name: city.name,
    namePrepositional: city.namePrepositional,
    nameGenitive: city.nameGenitive,
    legacyUrl: city.legacyUrl,
    officeAddress: city.officeAddress,
    officeHours: city.officeHours,
  };
}

const snapshotFields = [
  'id', 'regionId', 'subject', 'name', 'namePrepositional', 'nameGenitive',
  'legacyUrl', 'officeAddress', 'officeHours',
] as const satisfies readonly (keyof CityImportSnapshot)[];

function snapshotsEqual(current: CityImportSnapshot, expected: CityImportSnapshot) {
  return snapshotFields.every((field) => current[field] === expected[field]);
}

function validatedActions(report: CityImportReport, value: unknown): Record<string, CityImportAction> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Для каждой строки импорта нужно выбрать действие');
  }
  const actions = value as Record<string, unknown>;
  const candidates = new Map(report.candidates.map((candidate) => [candidate.key, candidate]));
  for (const key of Object.keys(actions)) {
    if (!candidates.has(key)) throw new BadRequestException(`Действие для «${key}» не относится к этому отчету`);
  }
  const result: Record<string, CityImportAction> = {};
  for (const candidate of report.candidates) {
    const action = actions[candidate.key];
    if (action === undefined || action === '') throw new BadRequestException(`Не выбрано действие для «${candidate.key}»`);
    if (typeof action !== 'string' || !importActions.has(action as CityImportAction)) {
      throw new BadRequestException(`Недопустимое действие для «${candidate.key}»`);
    }
    if (candidate.existingId && action === 'create') throw new BadRequestException(`Город «${candidate.slug}» уже существует`);
    if (!candidate.existingId && action === 'update') throw new BadRequestException(`Город «${candidate.slug}» не найден для обновления`);
    result[candidate.key] = action as CityImportAction;
  }
  return result;
}

@Injectable()
export class CityImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  async validateRows(siteId: string, fileName: string, sourceRows: Record<string, unknown>[]): Promise<CityImportReport> {
    if (!siteId) throw new BadRequestException('siteId обязателен');
    if (!sourceRows.length) throw new BadRequestException('Файл не содержит строк');
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) throw new BadRequestException('Сайт не найден');
    const rows = sourceRows.map((row) => Object.fromEntries(Object.entries(row).map(([column, value]) => [normalizeColumn(column), value])));
    const issues: CityImportIssue[] = [];
    const candidates: CityImportCandidate[] = [];
    const seen = new Set<string>();
    const normalized = rows.map((row) => ({
      subject: valueByAlias(row, FIELD_ALIASES.subject), name: valueByAlias(row, FIELD_ALIASES.name),
      namePrepositional: valueByAlias(row, FIELD_ALIASES.prepositional),
      nameGenitive: valueByAlias(row, FIELD_ALIASES.genitive), slug: valueByAlias(row, FIELD_ALIASES.slug),
      legacyUrl: valueByAlias(row, FIELD_ALIASES.legacyUrl), officeAddress: valueByAlias(row, FIELD_ALIASES.officeAddress), officeHours: valueByAlias(row, FIELD_ALIASES.officeHours),
    }));
    const slugCounts = new Map<string, number>();
    for (const row of normalized) if (row.slug) slugCounts.set(row.slug.toLocaleLowerCase('ru-RU'), (slugCounts.get(row.slug.toLocaleLowerCase('ru-RU')) || 0) + 1);
    const slugs = [...new Set(normalized.map((row) => row.slug.toLocaleLowerCase('ru-RU')).filter(Boolean))];
    const existing = await this.prisma.city.findMany({
      where: { siteId, slug: { in: slugs } },
      select: {
        id: true, regionId: true, slug: true, name: true, namePrepositional: true,
        nameGenitive: true, legacyUrl: true, officeAddress: true, officeHours: true,
        region: { select: { name: true } },
      },
    });
    const bySlug = new Map(existing.map((city) => [city.slug.toLocaleLowerCase('ru-RU'), city]));
    normalized.forEach((row, index) => {
      const rowNumber = index + 2;
      const slug = row.slug.toLocaleLowerCase('ru-RU');
      const add = (level: CityImportIssue['level'], message: string) => issues.push({ row: rowNumber, level, message, key: slug || undefined });
      if (!row.subject) add('error', 'Не указан субъект РФ');
      if (!row.name) add('error', 'Не указано название города');
      if (!slug) add('error', 'Не указан slug города');
      if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) add('error', 'Slug должен быть латинским');
      if (slug && (seen.has(slug) || (slugCounts.get(slug) || 0) > 1)) add('error', `Дубликат slug «${slug}» в файле`);
      if (slug) seen.add(slug);
      if (row.name && !row.namePrepositional) add('warning', 'Не заполнено название в предложном падеже');
      if (row.name && !row.nameGenitive) add('warning', 'Не заполнено название в родительном падеже');
      if (Boolean(row.officeAddress) !== Boolean(row.officeHours)) add('error', 'Адрес и режим работы офиса должны быть заполнены вместе');
      if (row.legacyUrl && !/^https?:\/\//i.test(row.legacyUrl)) add('warning', 'Legacy URL не начинается с http:// или https://');
      const current = bySlug.get(slug);
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (current) {
        if (current.region.name !== row.subject) changes.subject = { from: current.region.name, to: row.subject };
        for (const field of ['name', 'namePrepositional', 'nameGenitive', 'legacyUrl', 'officeAddress', 'officeHours'] as const) {
          const next = row[field] || null;
          if ((current[field] ?? null) !== next) changes[field] = { from: current[field] ?? null, to: next };
        }
      }
      if (slug && row.subject && row.name && !issues.some((issue) => issue.row === rowNumber && issue.level === 'error')) {
        candidates.push({
          key: slug, row: rowNumber, siteId, subject: row.subject, name: row.name,
          namePrepositional: row.namePrepositional || null,
          nameGenitive: row.nameGenitive || null, slug, legacyUrl: row.legacyUrl || null,
          officeAddress: row.officeAddress || null, officeHours: row.officeHours || null,
          existingId: current?.id, existingSnapshot: current ? snapshot(current) : undefined,
          changes: Object.keys(changes).length ? changes : undefined,
        });
      }
    });
    const errorRows = new Set(issues.filter((issue) => issue.level === 'error').map((issue) => issue.row)).size;
    const warningRows = new Set(issues.filter((issue) => issue.level === 'warning').map((issue) => issue.row)).size;
    return { reportVersion: 2, fileName, siteId, createdAt: new Date().toISOString(), totalRows: rows.length, validRows: candidates.length, errorRows, warningRows, issues, candidates };
  }

  async applyReport(report: CityImportReport, actionsValue: unknown, confirmWarnings = false, runId?: string, actorId?: string) {
    if (report.reportVersion !== 2) throw new BadRequestException('Отчет импорта создан в старом формате; проверьте файл заново');
    if (report.errorRows > 0) throw new BadRequestException('Нельзя применить импорт с ошибками');
    if (report.warningRows > 0 && !confirmWarnings) throw new BadRequestException('Нужно явно подтвердить предупреждения импорта');
    const actions = validatedActions(report, actionsValue);
    return this.prisma.$transaction(async (tx) => {
      const regions = await tx.region.findMany({ where: { siteId: report.siteId } });
      const regionsByName = new Map(regions.map((region) => [region.name, region]));
      const regionsBySlug = new Map(regions.map((region) => [region.slug, region]));
      const existingCities = await tx.city.findMany({
        where: { siteId: report.siteId, slug: { in: report.candidates.map((candidate) => candidate.slug) } },
        include: { region: { select: { name: true } } },
      });
      const citiesBySlug = new Map(existingCities.map((city) => [city.slug, city]));
      const beforeCities: StoredCity[] = [];
      const affectedCityIds: string[] = [];
      const createdCityIds: string[] = [];
      const createdRegions: StoredRegion[] = [];
      const createdPageIds: string[] = [];
      let created = 0; let updated = 0; let skipped = 0; let pagesCreated = 0;
      for (const candidate of report.candidates) {
        const action = actions[candidate.key];
        if (action === 'skip') { skipped += 1; continue; }
        const current = citiesBySlug.get(candidate.slug);
        if (candidate.existingId) {
          if (!current || current.id !== candidate.existingId) throw new BadRequestException(`Город «${candidate.slug}» изменился после проверки; проверьте файл заново`);
          if (!candidate.existingSnapshot || !snapshotsEqual(snapshot(current), candidate.existingSnapshot)) {
            throw new BadRequestException(`Город «${candidate.slug}» изменился после проверки; проверьте файл заново`);
          }
        } else if (current) {
          throw new BadRequestException(`Город «${candidate.slug}» уже существует; проверьте файл заново`);
        }
        const regionSlug = slugify(candidate.subject);
        let region = regionsByName.get(candidate.subject) || regionsBySlug.get(regionSlug);
        if (!region) {
          region = await tx.region.create({ data: { siteId: candidate.siteId, name: candidate.subject, slug: regionSlug } });
          if (runId) createdRegions.push(storedRegion(region));
          regionsByName.set(region.name, region);
          regionsBySlug.set(region.slug, region);
        }
        const profile = defaultDomruProfileCatalog.resolve({ city: candidate.name, region: candidate.subject });
        const data = {
          regionId: region.id,
          name: candidate.name,
          slug: candidate.slug,
          namePrepositional: candidate.namePrepositional,
          nameGenitive: candidate.nameGenitive,
          legacyUrl: candidate.legacyUrl,
          officeState: candidate.officeAddress && candidate.officeHours ? 'HAS_OFFICE' as const : 'NO_OFFICE' as const,
          officeAddress: candidate.officeAddress,
          officeHours: candidate.officeHours,
          subscriberProfileKey: profile?.key || null,
        };
        if (current) {
          if (runId) beforeCities.push(storedCity(current));
          const city = await tx.city.update({ where: { id: current.id }, data });
          affectedCityIds.push(city.id);
          citiesBySlug.set(city.slug, { ...city, region: { name: region.name } });
          updated += 1;
        } else {
          const city = await tx.city.create({ data: { siteId: candidate.siteId, ...data, status: 'DRAFT' } });
          const page = await tx.page.create({
            data: {
              siteId: candidate.siteId,
              cityId: city.id,
              type: 'HOME',
              slug: '',
              title: `Домашний интернет в ${candidate.namePrepositional}`,
              status: 'PUBLISHED',
              seo: {},
              content: {},
              blocks: { create: cityHomeTemplateBlocks(candidate) },
            },
          });
          affectedCityIds.push(city.id);
          createdCityIds.push(city.id);
          createdPageIds.push(page.id);
          citiesBySlug.set(city.slug, { ...city, region: { name: region.name } });
          pagesCreated += 1;
          created += 1;
        }
      }
      let workingRevision: number | null = null;
      if (runId) {
        const afterCities = affectedCityIds.length
          ? (await tx.city.findMany({ where: { id: { in: affectedCityIds } }, orderBy: { id: 'asc' } })).map(storedCity)
          : [];
        const createdPages = createdPageIds.length
          ? (await tx.page.findMany({
            where: { id: { in: createdPageIds } },
            include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
            orderBy: { id: 'asc' },
          })).map(storedPage)
          : [];
        const orderedBeforeCities = beforeCities.sort((left, right) => left.id.localeCompare(right.id));
        const orderedRegions = createdRegions.sort((left, right) => left.id.localeCompare(right.id));
        const changedFields = [
          ...(affectedCityIds.length ? ['cities'] : []),
          ...(orderedRegions.length ? ['regions'] : []),
          ...(createdPages.length ? ['pages'] : []),
        ];
        if (changedFields.length) {
          const revision = await this.publications.recordWorkingRevision(tx, {
            siteId: report.siteId,
            entityType: 'SITE',
            entityId: report.siteId,
            action: 'IMPORT',
            previousSnapshot: { cities: orderedBeforeCities, regions: [], pages: [] },
            snapshot: { cities: afterCities, regions: orderedRegions, pages: createdPages },
            changedFields,
            actorId,
            source: `city-import:${runId}`,
          });
          workingRevision = revision.siteRevision;
        }
        const changeSet: CityImportChangeSet = {
          version: 1,
          kind: 'CITY_IMPORT',
          siteId: report.siteId,
          runId,
          actions,
          createdCityIds: createdCityIds.sort(),
          beforeCities: orderedBeforeCities,
          afterCities,
          createdRegions: orderedRegions,
          createdPages,
          workingRevision,
        };
        const claimed = await tx.cityImportRun.updateMany({
          where: { id: runId, status: 'VALIDATED' },
          data: {
            status: 'APPLIED',
            appliedAt: new Date(),
            appliedById: actorId || null,
            changeSet: changeSet as unknown as Prisma.InputJsonValue,
          },
        });
        if (claimed.count !== 1) throw new BadRequestException('Этот импорт уже применен');
      }
      return { created, updated, skipped, pagesCreated, ...(workingRevision === null ? {} : { workingRevision }) };
    }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async undoImport(runId: string, actorId?: string) {
    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.cityImportRun.findUnique({ where: { id: runId } });
      if (!run) throw new BadRequestException('Импорт городов не найден');
      if (run.status !== 'APPLIED') throw new BadRequestException('Отменить можно только примененный импорт');
      if (
        !isCityImportChangeSet(run.changeSet)
        || run.changeSet.runId !== run.id
        || run.changeSet.siteId !== run.siteId
        || !Number.isInteger(run.changeSet.workingRevision)
      ) {
        throw new BadRequestException('Для этого импорта нет полного безопасного снимка отмены');
      }
      const changeSet = run.changeSet;
      const createdCityIds = [...changeSet.createdCityIds].sort();
      const beforeCities = changeSet.beforeCities.map(storedCity).sort((left, right) => left.id.localeCompare(right.id));
      const afterCities = changeSet.afterCities.map(storedCity).sort((left, right) => left.id.localeCompare(right.id));
      const createdRegions = changeSet.createdRegions.map(storedRegion).sort((left, right) => left.id.localeCompare(right.id));
      const createdPages = [...changeSet.createdPages].sort((left, right) => left.id.localeCompare(right.id));
      const beforeIds = new Set(beforeCities.map((city) => city.id));
      const afterIds = new Set(afterCities.map((city) => city.id));
      const createdIds = new Set(createdCityIds);
      const expectedAfterIds = new Set([...beforeIds, ...createdIds]);
      const createdRegionIds = createdRegions.map((region) => region.id);
      const createdPageIds = createdPages.map((page) => page.id);
      const createdPageCityIds = new Set(createdPages.map((page) => page.cityId));
      const referencedRegionIds = new Set(afterCities.map((city) => city.regionId));
      const snapshotIsComplete = beforeIds.size === beforeCities.length
        && afterIds.size === afterCities.length
        && createdIds.size === createdCityIds.length
        && createdRegionIds.length === new Set(createdRegionIds).size
        && createdPageIds.length === new Set(createdPageIds).size
        && afterIds.size === expectedAfterIds.size
        && [...expectedAfterIds].every((id) => afterIds.has(id))
        && createdCityIds.every((id) => !beforeIds.has(id))
        && createdPages.length === createdCityIds.length
        && createdPageCityIds.size === createdIds.size
        && createdCityIds.every((id) => createdPageCityIds.has(id))
        && createdRegionIds.every((id) => referencedRegionIds.has(id))
        && [...beforeCities, ...afterCities].every((city) => city.siteId === run.siteId)
        && createdRegions.every((region) => region.siteId === run.siteId)
        && createdPages.every((page) => page.siteId === run.siteId
          && typeof page.cityId === 'string'
          && createdIds.has(page.cityId)
          && page.type === 'HOME'
          && page.slug === ''
          && page.blocks.length === 7
          && page.blocks.every((block) => block.pageId === page.id));
      if (!snapshotIsComplete) throw new BadRequestException('Для этого импорта нет полного безопасного снимка отмены');

      const currentCities = (await transaction.city.findMany({
        where: { id: { in: [...afterIds] } },
        orderBy: { id: 'asc' },
      })).map(storedCity);
      if (!isDeepStrictEqual(currentCities, afterCities)) {
        throw new ConflictException('Города изменены после импорта; безопасная отмена заблокирована');
      }
      const currentPages = createdPageIds.length
        ? (await transaction.page.findMany({
          where: { id: { in: createdPageIds } },
          include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
          orderBy: { id: 'asc' },
        })).map(storedPage)
        : [];
      if (!isDeepStrictEqual(currentPages, createdPages)) {
        throw new ConflictException('Созданные страницы изменены после импорта; безопасная отмена заблокирована');
      }
      const currentRegions = createdRegionIds.length
        ? (await transaction.region.findMany({ where: { id: { in: createdRegionIds } }, orderBy: { id: 'asc' } })).map(storedRegion)
        : [];
      if (!isDeepStrictEqual(currentRegions, createdRegions)) {
        throw new ConflictException('Созданные регионы изменены после импорта; безопасная отмена заблокирована');
      }

      const revisionTargets: Prisma.ContentRevisionWhereInput[] = [
        { entityType: 'SITE', source: { startsWith: 'city-import' } },
        { entityType: 'CITY', entityId: { in: [...afterIds] } },
      ];
      if (createdPageIds.length) revisionTargets.push({ entityType: 'PAGE', entityId: { in: createdPageIds } });
      if (createdRegionIds.length) revisionTargets.push({ entityType: 'REGION', entityId: { in: createdRegionIds } });
      const laterRevision = await transaction.contentRevision.findFirst({
        where: {
          siteId: run.siteId,
          siteRevision: { gt: changeSet.workingRevision! },
          OR: revisionTargets,
        },
        select: { id: true },
      });
      if (laterRevision) {
        throw new ConflictException('Затронутые данные изменялись после импорта; безопасная отмена заблокирована');
      }

      if (createdCityIds.length) {
        const [extraPage, tariff, lead, addressCheck, redirect] = await Promise.all([
          transaction.page.findFirst({
            where: { cityId: { in: createdCityIds }, id: { notIn: createdPageIds } },
            select: { id: true },
          }),
          transaction.tariff.findFirst({ where: { cityId: { in: createdCityIds } }, select: { id: true } }),
          transaction.lead.findFirst({ where: { cityId: { in: createdCityIds } }, select: { id: true } }),
          transaction.addressCheck.findFirst({ where: { cityId: { in: createdCityIds } }, select: { id: true } }),
          transaction.redirect.findFirst({ where: { cityId: { in: createdCityIds } }, select: { id: true } }),
        ]);
        if (extraPage || tariff || lead || addressCheck || redirect) {
          throw new ConflictException('У созданного города появились зависимые данные; безопасная отмена заблокирована');
        }
      }
      if (createdRegionIds.length) {
        const extraRegionCity = await transaction.city.findFirst({
          where: { regionId: { in: createdRegionIds }, id: { notIn: [...afterIds] } },
          select: { id: true },
        });
        if (extraRegionCity) {
          throw new ConflictException('В созданном регионе появились другие города; безопасная отмена заблокирована');
        }
      }

      const deletedPages = createdPageIds.length
        ? await transaction.page.deleteMany({ where: { id: { in: createdPageIds } } })
        : { count: 0 };
      if (deletedPages.count !== createdPageIds.length) {
        throw new ConflictException('Созданные страницы изменились во время отмены; операция отменена');
      }
      const deletedCities = createdCityIds.length
        ? await transaction.city.deleteMany({ where: { id: { in: createdCityIds } } })
        : { count: 0 };
      if (deletedCities.count !== createdCityIds.length) {
        throw new ConflictException('Созданные города изменились во время отмены; операция отменена');
      }
      for (const city of beforeCities) {
        await transaction.city.update({ where: { id: city.id }, data: restoreCityData(city) });
      }
      const deletedRegions = createdRegionIds.length
        ? await transaction.region.deleteMany({ where: { id: { in: createdRegionIds } } })
        : { count: 0 };
      if (deletedRegions.count !== createdRegionIds.length) {
        throw new ConflictException('Созданные регионы изменились во время отмены; операция отменена');
      }

      const changedFields = [
        ...([...afterIds].length ? ['cities'] : []),
        ...(createdRegionIds.length ? ['regions'] : []),
        ...(createdPageIds.length ? ['pages'] : []),
      ];
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: run.siteId,
        entityType: 'SITE',
        entityId: run.siteId,
        action: 'UNDO',
        previousSnapshot: { cities: afterCities, regions: createdRegions, pages: createdPages },
        snapshot: { cities: beforeCities, regions: [], pages: [] },
        changedFields,
        actorId,
        source: `city-import-undo:${runId}`,
      });
      const undoSiteRevisions = [{ siteId: run.siteId, workingRevision: revision.siteRevision }];
      const claimed = await transaction.cityImportRun.updateMany({
        where: { id: run.id, status: 'APPLIED' },
        data: {
          status: 'UNDONE',
          undoneAt: new Date(),
          undoneById: actorId || null,
          undoSiteRevisions: undoSiteRevisions as unknown as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('Статус импорта изменился во время отмены; операция отменена');
      return {
        runId: run.id,
        restored: beforeCities.length,
        removedCities: deletedCities.count,
        removedPages: deletedPages.count,
        removedRegions: deletedRegions.count,
        workingRevision: revision.siteRevision,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { parseWorkbook } from './tariff-import.service';

export interface CityImportIssue { row: number; level: 'error' | 'warning'; message: string; key?: string }
export interface CityImportCandidate {
  key: string;
  siteId: string;
  subject: string;
  name: string;
  nameInstrumental: string | null;
  namePrepositional: string | null;
  nameGenitive: string | null;
  slug: string;
  legacyUrl: string | null;
  officeAddress: string | null;
  officeHours: string | null;
  existingId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}
export interface CityImportReport {
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

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const transliteration: Record<string, string> = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
const slugify = (value: string) => value.toLocaleLowerCase('ru-RU').split('').map((char) => transliteration[char] ?? char).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalizeColumn = (value: string) => value.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('ru-RU').replace(/[\s./-]+/g, '_');

const FIELD_ALIASES = {
  subject: ['subekt_rf', 'subject', 'region', 'subekt_rossiyskoy_federatsii', 'субъект_рф'],
  name: ['gorod_name', 'city_name', 'city', 'город', 'город_имен', 'город_имен_падеж', 'город_именительный_падеж'],
  instrumental: ['gorod_v_imenitelnom_padezhe', 'gorod_v_imenitelnom', 'gorod_imenit_padezh', 'gorod_v_imenit_padezhe', 'город_имен_падеж'],
  prepositional: ['dom_ru_v', 'gorod_v_predlozhnom_padezhe', 'gorod_predlozh_padezh', 'gorod_v_predlozhnom', 'город_предлож_падеж_dom_ru_v', 'город_предложный_падеж'],
  genitive: ['gorod_v_roditelnom_padezhe', 'gorod_rodit_padezh', 'gorod_v_roditelnom', 'город_родит_падеж', 'город_родительный_падеж'],
  slug: ['gorod_slug', 'slug', 'city_slug'],
  legacyUrl: ['url_goroda', 'url_goroda_legacy', 'url', 'gorod_url', 'legacy_url', 'url_города', 'ссылка_города'],
  officeAddress: ['adres_ofisa', 'office_address', 'address_of_office'],
  officeHours: ['rezhim_raboty_ofisa', 'office_hours', 'working_hours'],
} as const;

function valueByAlias(row: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(row, alias) && text(row[alias])) return text(row[alias]);
  return '';
}

@Injectable()
export class CityImportService {
  constructor(private readonly prisma: PrismaService) {}

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
      nameInstrumental: valueByAlias(row, FIELD_ALIASES.instrumental), namePrepositional: valueByAlias(row, FIELD_ALIASES.prepositional),
      nameGenitive: valueByAlias(row, FIELD_ALIASES.genitive), slug: valueByAlias(row, FIELD_ALIASES.slug),
      legacyUrl: valueByAlias(row, FIELD_ALIASES.legacyUrl), officeAddress: valueByAlias(row, FIELD_ALIASES.officeAddress), officeHours: valueByAlias(row, FIELD_ALIASES.officeHours),
    }));
    const slugCounts = new Map<string, number>();
    for (const row of normalized) if (row.slug) slugCounts.set(row.slug.toLocaleLowerCase('ru-RU'), (slugCounts.get(row.slug.toLocaleLowerCase('ru-RU')) || 0) + 1);
    const slugs = [...new Set(normalized.map((row) => row.slug.toLocaleLowerCase('ru-RU')).filter(Boolean))];
    const existing = await this.prisma.city.findMany({ where: { siteId, slug: { in: slugs } }, select: { id: true, slug: true, name: true, nameInstrumental: true, namePrepositional: true, nameGenitive: true, legacyUrl: true, officeAddress: true, officeHours: true } });
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
      if (row.legacyUrl && !/^https?:\/\//i.test(row.legacyUrl)) add('warning', 'Legacy URL не начинается с http:// или https://');
      const current = bySlug.get(slug);
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (current) {
        for (const field of ['name', 'nameInstrumental', 'namePrepositional', 'nameGenitive', 'legacyUrl', 'officeAddress', 'officeHours'] as const) {
          const next = row[field] || null;
          if ((current[field] ?? null) !== next) changes[field] = { from: current[field] ?? null, to: next };
        }
      }
      if (slug && row.subject && row.name && !issues.some((issue) => issue.row === rowNumber && issue.level === 'error')) {
        candidates.push({ key: slug, siteId, subject: row.subject, name: row.name, nameInstrumental: row.nameInstrumental || null, namePrepositional: row.namePrepositional || null, nameGenitive: row.nameGenitive || null, slug, legacyUrl: row.legacyUrl || null, officeAddress: row.officeAddress || null, officeHours: row.officeHours || null, existingId: current?.id, changes: Object.keys(changes).length ? changes : undefined });
      }
    });
    const errorRows = new Set(issues.filter((issue) => issue.level === 'error').map((issue) => issue.row)).size;
    const warningRows = new Set(issues.filter((issue) => issue.level === 'warning').map((issue) => issue.row)).size;
    return { fileName, siteId, createdAt: new Date().toISOString(), totalRows: rows.length, validRows: candidates.length, errorRows, warningRows, issues, candidates };
  }

  async applyReport(report: CityImportReport, actions?: Record<string, 'create' | 'update' | 'skip'>) {
    if (report.errorRows > 0) throw new BadRequestException('Нельзя применить импорт с ошибками');
    return this.prisma.$transaction(async (tx) => {
      let created = 0; let updated = 0; let skipped = 0; let pagesCreated = 0;
      for (const candidate of report.candidates) {
        const action = actions?.[candidate.key] || (candidate.existingId ? 'update' : 'create');
        if (action === 'skip') { skipped += 1; continue; }
        let region = await tx.region.findFirst({ where: { siteId: candidate.siteId, name: candidate.subject } });
        if (!region) region = await tx.region.create({ data: { siteId: candidate.siteId, name: candidate.subject, slug: slugify(candidate.subject) } });
        const data = { regionId: region.id, name: candidate.name, slug: candidate.slug, nameInstrumental: candidate.nameInstrumental, namePrepositional: candidate.namePrepositional, nameGenitive: candidate.nameGenitive, legacyUrl: candidate.legacyUrl, officeAddress: candidate.officeAddress, officeHours: candidate.officeHours };
        const current = await tx.city.findFirst({ where: { siteId: candidate.siteId, slug: candidate.slug } });
        if (current) {
          if (action === 'create') throw new BadRequestException(`Город «${candidate.slug}» уже существует`);
          await tx.city.update({ where: { id: current.id }, data }); updated += 1;
        } else {
          if (action === 'update') throw new BadRequestException(`Город «${candidate.slug}» не найден для обновления`);
          const city = await tx.city.create({ data: { siteId: candidate.siteId, ...data, status: 'DRAFT', seo: {} as Prisma.InputJsonObject, content: {} as Prisma.InputJsonObject } });
          const pages = [
            ['HOME', 'home', 'Главная города'], ['INTERNET', 'internet', 'Домашний интернет'], ['INTERNET_TV', 'internet-tv', 'Интернет + ТВ'],
            ['TV', 'tv', 'Телевидение'], ['ADDRESS_CHECK', 'proverka-adresa', 'Проверка адреса'], ['FAQ', 'faq', 'Вопросы и ответы'],
          ] as const;
          for (const [type, slug, title] of pages) { await tx.page.create({ data: { siteId: candidate.siteId, cityId: city.id, type, slug, title, status: 'DRAFT', seo: {}, content: {} } }); pagesCreated += 1; }
          created += 1;
        }
      }
      return { created, updated, skipped, pagesCreated };
    });
  }
}

import { ensureCityAddressPage } from './address-page-storage';
import { ensureCitySupportPage } from './support-page-storage';
import { BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { pageSize, searchQuery } from './admin-pagination';
import { AdminTokenGuard } from './admin-token.guard';
import { CityReadinessService, cityHomeTemplateReady, evaluateCityReadiness } from './city-readiness.service';
import { ensureCityHomeTemplate } from './page-template';
import { PrismaService } from './prisma.service';
import { defaultDomruProfileCatalog } from './domru-profile-catalog';
import { CityImportReport, CityImportService, isCityImportChangeSet } from './city-import.service';
import { parseWorkbook } from './tariff-import.service';
import { PublicationWorkflowService } from './publication-workflow.service';

type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface CityBody {
  siteId: string;
  regionId: string;
  name: string;
  slug: string;
  namePrepositional?: string | null;
  nameGenitive?: string | null;
  legacyUrl?: string | null;
  officeState?: 'HAS_OFFICE' | 'NO_OFFICE';
  officeAddress?: string | null;
  officeHours?: string | null;
  subscriberProfileKey?: string | null;
  status?: PublishStatus;
  expectedWorkingRevision?: number;
  confirmMissingSubscriberProfile?: boolean;
}

interface CityListQuery {
  q?: string; cursor?: string; limit?: number; regionId?: string; status?: PublishStatus;
  readiness?: 'READY' | 'NOT_READY'; profile?: 'CONFIGURED' | 'MISSING'; tariffs?: 'WITH' | 'WITHOUT';
  unpublished?: 'true' | 'false'; sort?: 'city' | 'region' | 'status' | 'tariffs' | 'lastPublication'; direction?: 'asc' | 'desc';
}

interface CitySlugBody {
  slug?: string;
  confirm?: boolean;
  expectedWorkingRevision?: number;
}

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin/cities')
@UseGuards(AdminTokenGuard)
export class AdminCitiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: CityImportService,
    private readonly publications: PublicationWorkflowService,
    private readonly readiness: CityReadinessService = new CityReadinessService(),
  ) {}

  @Get()
  async list(@Query() query: CityListQuery = {}) {
    const limit = pageSize(Number(query.limit));
    const q = searchQuery(query.q)?.toLocaleLowerCase('ru-RU');
    const offset = this.decodeListCursor(query.cursor);
    // The compact selection and page details must refer to the same database snapshot.
    return this.prisma.$transaction(
      transaction => this.listCities(transaction, query, { limit, q, offset }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async listCities(
    transaction: Prisma.TransactionClient,
    query: CityListQuery,
    { limit, q, offset }: { limit: number; q: string | undefined; offset: number },
  ) {
    const rows = await transaction.city.findMany({
      where: {
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        region: { select: { id: true, name: true, slug: true } },
        site: {
          select: {
            id: true, name: true, slug: true, domain: true, workingRevision: true, publishedRevision: true,
            publications: { where: { status: 'SUCCEEDED' }, orderBy: { publishedAt: 'desc' }, take: 1, select: { publishedAt: true } },
          },
        },
        _count: { select: { tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE' } } } },
      },
    });
    let candidates = rows
      .filter(city => !q || `${city.name} ${city.slug} ${city.legacyUrl || ''}`.toLocaleLowerCase('ru-RU').includes(q))
      .map(city => ({
        city,
        profile: city.subscriberProfileKey ? defaultDomruProfileCatalog.resolveByKey(city.subscriberProfileKey) : null,
        publishedTariffCount: city._count.tariffs,
        lastSuccessfulPublicationAt: city.site.publications[0]?.publishedAt || null,
      }))
      .filter(({ profile, publishedTariffCount }) =>
        (!query.profile || Boolean(profile) === (query.profile === 'CONFIGURED')) &&
        (!query.tariffs || (publishedTariffCount > 0) === (query.tariffs === 'WITH')));

    const hasUnpublishedChanges = (city: (typeof rows)[number], revisions: Map<string, number>) =>
      (revisions.get(city.id) ?? 0) > city.site.publishedRevision;
    let revisions = new Map<string, number>();
    if (query.unpublished) {
      revisions = await this.latestCityRevisions(transaction, candidates.map(({ city }) => city.id));
      candidates = candidates.filter(({ city }) => hasUnpublishedChanges(city, revisions) === (query.unpublished === 'true'));
    }

    let readiness = new Map<string, ReturnType<typeof evaluateCityReadiness>>();
    const readReadiness = async (items: typeof candidates) => {
      const homes = await this.cityHomeReadiness(transaction, items.map(({ city }) => city.id));
      return new Map(items.map(({ city, publishedTariffCount }) => [
        city.id, evaluateCityReadiness({ ...city, publishedTariffCount, homeTemplateReady: homes.has(city.id) }),
      ]));
    };
    if (query.readiness) {
      readiness = await readReadiness(candidates);
      candidates = candidates.filter(({ city }) => readiness.get(city.id)?.ready === (query.readiness === 'READY'));
    }

    const direction = query.direction === 'desc' ? -1 : 1;
    // Keep the original Russian ordering and ID tie-breaker for existing cursors.
    const sortValue = ({ city, publishedTariffCount, lastSuccessfulPublicationAt }: (typeof candidates)[number]) => {
      switch (query.sort) {
        case 'region': return city.region.name;
        case 'status': return city.status;
        case 'tariffs': return publishedTariffCount;
        case 'lastPublication': return lastSuccessfulPublicationAt?.getTime() || 0;
        default: return city.name;
      }
    };
    candidates.sort((left, right) => {
      const leftValue = sortValue(left), rightValue = sortValue(right);
      const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ru');
      return direction * (compared || left.city.id.localeCompare(right.city.id));
    });

    const total = candidates.length;
    const page = candidates.slice(offset, offset + limit);
    if (!query.unpublished) revisions = await this.latestCityRevisions(transaction, page.map(({ city }) => city.id));
    if (!query.readiness) readiness = await readReadiness(page);
    return {
      items: page.map(({ city, profile, publishedTariffCount, lastSuccessfulPublicationAt }) => ({
        id: city.id,
        siteId: city.siteId,
        workingRevision: city.site.workingRevision,
        regionId: city.regionId,
        name: city.name,
        slug: city.slug,
        namePrepositional: city.namePrepositional,
        nameGenitive: city.nameGenitive,
        legacyUrl: city.legacyUrl,
        officeState: city.officeState,
        officeAddress: city.officeAddress,
        officeHours: city.officeHours,
        subscriberProfileKey: city.subscriberProfileKey,
        status: city.status,
        createdAt: city.createdAt,
        updatedAt: city.updatedAt,
        region: city.region,
        site: { id: city.site.id, name: city.site.name, slug: city.site.slug },
        publicUrl: city.site.domain ? `https://${city.site.domain}/${city.slug}` : `/${city.slug}`,
        readiness: readiness.get(city.id)!,
        publishedTariffCount,
        subscriberProfileReady: Boolean(profile),
        subscriberProfile: profile ? { key: profile.key, city: profile.city, region: profile.region } : null,
        hasUnpublishedChanges: hasUnpublishedChanges(city, revisions),
        lastSuccessfulPublicationAt,
      })),
      pageInfo: { limit, total, hasNextPage: offset + limit < total, nextCursor: offset + limit < total ? this.encodeListCursor(offset + limit) : null },
    };
  }

  private async latestCityRevisions(transaction: Prisma.TransactionClient, ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const revisions = await transaction.contentRevision.groupBy({
      by: ['entityId'],
      where: { entityType: 'CITY', entityId: { in: ids } },
      _max: { siteRevision: true },
    });
    return new Map(revisions.map(({ entityId, _max }) => [entityId, Math.max(0, _max.siteRevision ?? 0)]));
  }

  private async cityHomeReadiness(transaction: Prisma.TransactionClient, ids: string[]) {
    const ready = new Set<string>();
    if (!ids.length) return ready;
    // The (cityId, slug) key permits one canonical HOME for each city.
    const pages = await transaction.page.findMany({
      where: { cityId: { in: ids }, type: 'HOME', status: 'PUBLISHED', slug: '' },
      select: { id: true, cityId: true, templateId: true },
    });
    const templateIds = [...new Set(pages.flatMap(page => page.templateId ? [page.templateId] : []))];
    const legacyPageIds = pages.filter(page => !page.templateId).map(page => page.id);
    const orderBy = [{ position: 'asc' }, { id: 'asc' }] as const;
    const select = { blockType: true, position: true, visible: true, data: true } as const;
    const templates = templateIds.length ? await transaction.pageTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, status: true, blocks: { orderBy: [...orderBy], select } },
    }) : [];
    const legacyPages = legacyPageIds.length ? await transaction.page.findMany({
      where: { id: { in: legacyPageIds } },
      select: { id: true, blocks: { where: { archivedAt: null }, orderBy: [...orderBy], select } },
    }) : [];
    const canonicalHome = { type: 'HOME', slug: '', status: 'PUBLISHED' };
    // The city name only affects validation messages, which this boolean check does not expose.
    const templateReady = new Map(templates.map(({ id, status, blocks }) =>
      [id, cityHomeTemplateReady('', [{ ...canonicalHome, template: { status, blocks } }])]));
    const legacyReady = new Map(legacyPages.map(({ id, blocks }) =>
      [id, cityHomeTemplateReady('', [{ ...canonicalHome, blocks }])]));
    for (const page of pages) {
      if (page.cityId && (page.templateId ? templateReady.get(page.templateId) : legacyReady.get(page.id))) ready.add(page.cityId);
    }
    return ready;
  }

  @Get('profiles')
  profiles() { return defaultDomruProfileCatalog.options(); }

  @Post()
  async create(@Body() body: CityBody, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const data = await this.cityData(transaction, body, null);
      if (body.status === 'PUBLISHED') throw new BadRequestException('Новый город сначала сохраняется как черновик');
      const city = await transaction.city.create({ data: { ...data, siteId: body.siteId, status: 'DRAFT' } });
      const template = await ensureCityHomeTemplate(transaction, city.siteId, this.publications, request?.user?.id);
      await transaction.page.create({ data: { siteId: city.siteId, cityId: city.id, type: 'HOME', title: `Домашний интернет в ${city.namePrepositional}`, slug: '', status: 'PUBLISHED', templateId: template.id } });
      await ensureCityAddressPage(transaction, city);
      await ensureCitySupportPage(transaction, city);
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: city.siteId,
        entityType: 'CITY',
        entityId: city.id,
        action: 'CREATE',
        snapshot: city as unknown as Record<string, unknown>,
        changedFields: Object.keys(data),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...city, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<CityBody>, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.city.findUnique({ where: { id } });
      if (!current) throw new BadRequestException('Город не найден');
      if (body.expectedWorkingRevision !== undefined) {
        const site = await transaction.site.findUniqueOrThrow({ where: { id: current.siteId }, select: { workingRevision: true } });
        if (body.expectedWorkingRevision !== site.workingRevision) throw new ConflictException('Рабочая версия изменилась; обновите город');
      }
      if (body.siteId !== undefined && body.siteId !== current.siteId) throw new BadRequestException('Город нельзя переносить между сайтами');
      if (body.slug !== undefined && body.slug !== current.slug && current.status === 'PUBLISHED') throw new BadRequestException('Slug опубликованного города изменяется отдельным опасным действием');
      const data = await this.cityData(transaction, { ...current, ...body, siteId: current.siteId }, current);
      let nextStatus = body.status ?? current.status;
      if (current.status === 'ARCHIVED' && nextStatus !== 'ARCHIVED') nextStatus = 'DRAFT';
      if (nextStatus === 'PUBLISHED') {
        const [tariffCount, pages] = await Promise.all([
          transaction.tariff.count({ where: { cityId: id, status: 'PUBLISHED' } }),
          transaction.page.findMany({ where: { cityId: id, type: 'HOME' }, include: { blocks: { where: { archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }, template: { include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } } } }),
        ]);
        this.readiness.assertPublishable(evaluateCityReadiness({ ...data, publishedTariffCount: tariffCount, homeTemplateReady: cityHomeTemplateReady(data.name, pages) }), body.confirmMissingSubscriberProfile === true);
      }
      const updated = await transaction.city.update({ where: { id }, data: { ...data, status: nextStatus } });
      if (body.status !== undefined && body.status !== current.status) {
        const tariffs = await transaction.tariff.findMany({ where: { cityId: id }, select: { id: true, status: true, availability: true } });
        const publishedTariffIds = updated.status === 'PUBLISHED'
          ? tariffs.filter((tariff) => tariff.status === 'PUBLISHED' && tariff.availability === 'ACTIVE').map((tariff) => tariff.id)
          : [];
        const draftTariffIds = tariffs.filter((tariff) => !publishedTariffIds.includes(tariff.id)).map((tariff) => tariff.id);
        if (publishedTariffIds.length) {
          await transaction.redirect.updateMany({
            where: { siteId: updated.siteId, managedTariffId: { in: publishedTariffIds } },
            data: { status: 'PUBLISHED' },
          });
        }
        if (draftTariffIds.length) {
          await transaction.redirect.updateMany({
            where: { siteId: updated.siteId, managedTariffId: { in: draftTariffIds } },
            data: { status: 'DRAFT' },
          });
        }
      }
      const action = body.status === 'ARCHIVED' && current.status !== 'ARCHIVED'
        ? 'ARCHIVE'
        : current.status === 'ARCHIVED' && body.status && body.status !== 'ARCHIVED'
          ? 'RESTORE'
          : 'UPDATE';
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: updated.siteId,
        entityType: 'CITY',
        entityId: updated.id,
        action,
        previousSnapshot: current as unknown as Record<string, unknown>,
        snapshot: updated as unknown as Record<string, unknown>,
        changedFields: [...Object.keys(data), ...(nextStatus !== current.status ? ['status'] : [])],
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...updated, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Post(':id/change-slug')
  async changeSlug(@Param('id') id: string, @Body() body: CitySlugBody, @Req() request?: AdminRequest) {
    if (body.confirm !== true) throw new BadRequestException('Необходимо отдельно подтвердить изменение публичных URL');
    const slug = body.slug?.trim().toLocaleLowerCase('ru-RU');
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BadRequestException('Slug должен содержать латинские буквы, цифры и дефисы');
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const city = await transaction.city.findUnique({
        where: { id },
        include: { tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE' }, select: { id: true, slug: true } } },
      });
      if (!city) throw new BadRequestException('Город не найден');
      if (city.status !== 'PUBLISHED') throw new BadRequestException('Отдельное опасное действие используется только для опубликованного города');
      if (slug === city.slug) throw new BadRequestException('Новый slug совпадает с текущим');
      const site = await transaction.site.findUniqueOrThrow({ where: { id: city.siteId }, select: { workingRevision: true } });
      if (body.expectedWorkingRevision !== undefined && body.expectedWorkingRevision !== site.workingRevision) throw new ConflictException('Рабочая версия изменилась; обновите город');
      const [cityConflict, globalPageConflict, sourceRedirectConflict] = await Promise.all([
        transaction.city.findFirst({ where: { siteId: city.siteId, slug, id: { not: city.id } }, select: { id: true } }),
        transaction.page.findFirst({ where: { siteId: city.siteId, cityId: null, slug, status: 'PUBLISHED' }, select: { id: true } }),
        transaction.redirect.findUnique({ where: { siteId_sourcePath: { siteId: city.siteId, sourcePath: `/${slug}` } }, select: { id: true } }),
      ]);
      if (cityConflict || globalPageConflict || sourceRedirectConflict) throw new ConflictException(`Целевой URL /${slug} уже занят`);

      const redirects = [
        { sourcePath: `/${city.slug}`, targetPath: `/${slug}`, managedTariffId: null as string | null },
        ...city.tariffs.map((tariff) => ({ sourcePath: `/${city.slug}/${tariff.slug}`, targetPath: `/${slug}/${tariff.slug}`, managedTariffId: tariff.id })),
      ];
      for (const redirect of redirects) {
        const [existing, targetSource] = await Promise.all([
          transaction.redirect.findUnique({ where: { siteId_sourcePath: { siteId: city.siteId, sourcePath: redirect.sourcePath } } }),
          transaction.redirect.findUnique({ where: { siteId_sourcePath: { siteId: city.siteId, sourcePath: redirect.targetPath } } }),
        ]);
        if (targetSource) throw new ConflictException(`Целевой URL ${redirect.targetPath} уже используется как источник редиректа`);
        if (existing && (existing.targetPath !== redirect.targetPath || existing.managedTariffId !== redirect.managedTariffId)) {
          throw new ConflictException(`Для URL ${redirect.sourcePath} уже существует несовместимый редирект`);
        }
      }
      for (const redirect of redirects) {
        await transaction.redirect.updateMany({ where: { siteId: city.siteId, targetPath: redirect.sourcePath }, data: { targetPath: redirect.targetPath } });
        const existing = await transaction.redirect.findUnique({ where: { siteId_sourcePath: { siteId: city.siteId, sourcePath: redirect.sourcePath } } });
        if (!existing) await transaction.redirect.create({ data: { siteId: city.siteId, cityId: city.id, ...redirect, status: 'PUBLISHED' } });
      }
      const updated = await transaction.city.update({ where: { id }, data: { slug } });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: city.siteId,
        entityType: 'CITY',
        entityId: city.id,
        action: 'UPDATE',
        previousSnapshot: city as unknown as Record<string, unknown>,
        snapshot: updated as unknown as Record<string, unknown>,
        changedFields: ['slug', 'redirects'],
        actorId: request?.user?.id,
        source: 'admin:city-slug',
      });
      return { city: updated, affectedUrls: redirects.length, redirects: redirects.map(({ sourcePath, targetPath }) => ({ sourcePath, targetPath })), workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private encodeListCursor(offset: number) { return Buffer.from(JSON.stringify({ offset })).toString('base64url'); }

  private decodeListCursor(cursor?: string) {
    if (!cursor) return 0;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };
      if (!Number.isSafeInteger(value.offset) || Number(value.offset) < 0) throw new Error('invalid offset');
      return Number(value.offset);
    } catch { throw new BadRequestException('Некорректный cursor пагинации'); }
  }

  private async cityData(transaction: Prisma.TransactionClient, body: Partial<CityBody> & Pick<CityBody, 'siteId' | 'regionId' | 'name' | 'slug'>, current: { id: string } | null) {
    const name = body.name?.trim();
    const slug = body.slug?.trim().toLocaleLowerCase('ru-RU');
    const namePrepositional = body.namePrepositional?.trim() || null;
    const nameGenitive = body.nameGenitive?.trim() || null;
    if (!name || !slug || !body.regionId) throw new BadRequestException('Регион, название и slug обязательны');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BadRequestException('Slug должен содержать латинские буквы, цифры и дефисы');
    const conflict = await transaction.city.findFirst({ where: { siteId: body.siteId, slug, ...(current ? { id: { not: current.id } } : {}) }, select: { id: true } });
    if (conflict) throw new ConflictException('Этот slug уже используется другим городом');
    const region = await transaction.region.findFirst({ where: { id: body.regionId, siteId: body.siteId }, select: { id: true } });
    if (!region) throw new BadRequestException('Регион города не найден');
    const officeState = body.officeState || 'NO_OFFICE';
    const officeAddress = officeState === 'HAS_OFFICE' ? body.officeAddress?.trim() || null : null;
    const officeHours = officeState === 'HAS_OFFICE' ? body.officeHours?.trim() || null : null;
    if (officeState === 'HAS_OFFICE' && (!officeAddress || !officeHours)) throw new BadRequestException('Для города с офисом обязательны адрес и режим работы');
    const subscriberProfileKey = body.subscriberProfileKey?.trim() || null;
    if (subscriberProfileKey && !defaultDomruProfileCatalog.resolveByKey(subscriberProfileKey)) throw new BadRequestException('Выбран неизвестный профиль проверки абонента');
    return { regionId: body.regionId, name, slug, namePrepositional, nameGenitive, legacyUrl: body.legacyUrl?.trim() || null, officeState, officeAddress, officeHours, subscriberProfileKey };
  }

  @Post('import/validate')
  async validateImport(@Body() body: { siteId?: string; fileName?: string; fileBase64?: string; rows?: Record<string, unknown>[] }) {
    if (!body.siteId) throw new BadRequestException('siteId обязателен');
    const fileName = body.fileName?.trim() || 'cities-import.xlsx';
    let rows = body.rows;
    if (!rows && body.fileBase64) {
      const encoded = body.fileBase64!.includes(',') ? body.fileBase64!.split(',', 2)[1] : body.fileBase64!;
      const buffer = Buffer.from(encoded, 'base64');
      if (buffer.length > 25 * 1024 * 1024) throw new BadRequestException('Файл слишком большой');
      rows = await parseWorkbook(buffer, fileName);
    }
    if (!rows) throw new BadRequestException('Передайте rows или fileBase64');
    const report = await this.imports.validateRows(body.siteId, fileName, rows);
    const run = await this.prisma.cityImportRun.create({ data: { siteId: body.siteId, fileName: report.fileName, totalRows: report.totalRows, validRows: report.validRows, errorRows: report.errorRows, warningRows: report.warningRows, report: report as any } });
    return { runId: run.id, report };
  }

  @Post('import/apply')
  async applyImport(
    @Body() body: { runId?: string; actions?: unknown; confirmWarnings?: boolean },
    @Req() request?: AdminRequest,
  ) {
    if (!body.runId) throw new BadRequestException('runId обязателен');
    const run = await this.prisma.cityImportRun.findUnique({ where: { id: body.runId } });
    if (!run) throw new BadRequestException('Отчет импорта не найден');
    if (run.status !== 'VALIDATED') throw new BadRequestException('Применить можно только проверенный импорт');
    const report = run.report as unknown as CityImportReport;
    let result;
    try {
      result = await this.imports.applyReport(report, body.actions, body.confirmWarnings === true, run.id, request?.user?.id);
    } catch (error) {
      await this.prisma.cityImportRun.updateMany({
        where: { id: run.id, status: 'VALIDATED' },
        data: { status: 'FAILED' },
      });
      throw error;
    }
    return { runId: run.id, ...result };
  }

  @Get('imports')
  async importsList() {
    const rows = await this.prisma.cityImportRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        siteId: true,
        fileName: true,
        status: true,
        totalRows: true,
        validRows: true,
        errorRows: true,
        warningRows: true,
        createdAt: true,
        appliedAt: true,
        undoneAt: true,
      },
    });
    const appliedIds = rows.filter((row) => row.status === 'APPLIED').map((row) => row.id);
    const candidates = appliedIds.length
      ? await this.prisma.cityImportRun.findMany({
        where: {
          id: { in: appliedIds },
          status: 'APPLIED',
          AND: [
            { changeSet: { path: ['version'], equals: 1 } },
            { changeSet: { path: ['kind'], equals: 'CITY_IMPORT' } },
          ],
        },
        select: { id: true, siteId: true, changeSet: true },
      })
      : [];
    const undoableIds = new Set(candidates
      .filter((run) => isCityImportChangeSet(run.changeSet)
        && run.changeSet.runId === run.id
        && run.changeSet.siteId === run.siteId
        && Number.isInteger(run.changeSet.workingRevision))
      .map((run) => run.id));
    return rows.map((row) => ({
      ...row,
      canUndo: row.status === 'APPLIED' && undoableIds.has(row.id),
    }));
  }

  @Get('imports/:id')
  importDetail(@Param('id') id: string) { return this.prisma.cityImportRun.findUniqueOrThrow({ where: { id } }); }

  @Post('imports/:id/undo')
  undoImport(
    @Param('id') id: string,
    @Body() body: { confirm?: boolean },
    @Req() request?: AdminRequest,
  ) {
    if (body.confirm !== true) throw new BadRequestException('Необходимо явно подтвердить отмену импорта');
    return this.imports.undoImport(id, request?.user?.id);
  }
}

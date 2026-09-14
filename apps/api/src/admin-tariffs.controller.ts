import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '../generated';
import { CursorPageQueryDto, decodeCursor, encodeCursor, pageSize, searchQuery } from './admin-pagination';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { ImportReport, normalizeTariffAttributes, parseWorkbook, TARIFF_ATTRIBUTE_FIELDS, TariffImportService } from './tariff-import.service';
import { UpdateTariffDto } from './tariff.dto';
import { PublicationWorkflowService } from './publication-workflow.service';

type ServiceType = 'INTERNET' | 'INTERNET_TV' | 'TV' | 'OTHER';
type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface TariffBody {
  providerId: string;
  cityId: string;
  name: string;
  slug: string;
  serviceType: ServiceType;
  standardPrice?: number;
  promoPrice?: number;
  speed?: number;
  promoText?: string;
  connectionFee?: number;
  availability?: boolean;
  externalId?: string;
  dataSource?: string;
  attributes?: object;
  seo?: object;
  status?: PublishStatus;
}

interface ImportBody {
  providerId: string;
  cityId: string;
  items: Array<Omit<TariffBody, 'providerId' | 'cityId'>>;
}

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin/tariffs')
@UseGuards(AdminTokenGuard)
export class AdminTariffsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rebuild: RebuildQueueService,
    private readonly imports: TariffImportService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  private identityKey(cityId: string, slug: string, serviceType: ServiceType) {
    return `${cityId}:${slug}:${serviceType.toLowerCase()}`;
  }

  private async siteIdForCity(cityId: string) {
    return (await this.prisma.city.findUnique({ where: { id: cityId }, select: { siteId: true } }))?.siteId;
  }

  @Get()
  async list(@Query() query: CursorPageQueryDto = {}) {
    const limit = pageSize(query.limit);
    const q = searchQuery(query.q);
    const cursor = decodeCursor(query.cursor);
    const searchWhere: Prisma.TariffWhereInput | undefined = q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { city: { name: { contains: q, mode: 'insensitive' } } },
      ],
    } : undefined;
    const cursorWhere: Prisma.TariffWhereInput | undefined = cursor ? {
      OR: [
        { updatedAt: { lt: cursor.sortValue } },
        { updatedAt: cursor.sortValue, id: { lt: cursor.id } },
      ],
    } : undefined;
    const where: Prisma.TariffWhereInput = searchWhere && cursorWhere
      ? { AND: [searchWhere, cursorWhere] }
      : searchWhere || cursorWhere || {};
    const filterWhere: Prisma.TariffWhereInput = searchWhere || {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tariff.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          name: true,
          slug: true,
          serviceType: true,
          standardPrice: true,
          promoPrice: true,
          speed: true,
          status: true,
          availability: true,
          updatedAt: true,
          city: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.tariff.count({ where: filterWhere }),
    ]);
    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      pageInfo: {
        limit,
        total,
        hasNextPage,
        nextCursor: hasNextPage && last ? encodeCursor(last.updatedAt, last.id) : null,
      },
    };
  }

  @Post()
  async create(@Body() body: TariffBody, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const city = await transaction.city.findUnique({ where: { id: body.cityId }, select: { siteId: true } });
      if (!city) throw new BadRequestException('Город тарифа не найден');
      const data = { ...body, identityKey: this.identityKey(body.cityId, body.slug, body.serviceType) };
      const tariff = await transaction.tariff.create({ data });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: city.siteId,
        entityType: 'TARIFF',
        entityId: tariff.id,
        action: 'CREATE',
        snapshot: tariff as unknown as Record<string, unknown>,
        changedFields: Object.keys(data),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...tariff, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Post('import')
  async import(@Body() body: ImportBody) {
    const tariffs = await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const imported = [];
      for (const item of body.items) {
        const identityKey = this.identityKey(body.cityId, item.slug, item.serviceType);
        // `slug` is a one-time compatibility lookup for records created before identityKey existed.
        const existing = await transaction.tariff.findFirst({
          where: { cityId: body.cityId, OR: [{ identityKey }, { slug: item.slug }] },
        });
        const data = { ...item, identityKey, dataSource: item.dataSource || 'import' };
        imported.push(existing
          ? await transaction.tariff.update({ where: { id: existing.id }, data })
          : await transaction.tariff.create({ data: { ...data, providerId: body.providerId, cityId: body.cityId } }));
      }
      return imported;
    });
    const siteId = await this.siteIdForCity(body.cityId);
    await this.rebuild.enqueue({ entity: 'tariff-import', id: body.cityId, siteId });
    return { imported: tariffs.length, tariffs };
  }

  @Post('import/validate')
  async validateImport(@Body() body: { providerId?: string; fileName?: string; fileBase64?: string; rows?: Record<string, unknown>[] }) {
    if (!body.providerId) throw new BadRequestException('providerId обязателен');
    const fileName = body.fileName?.trim() || 'tariffs-import.xlsx';
    let rows = body.rows;
    if (!rows && body.fileBase64) {
      const encoded = body.fileBase64.replace(/^data:.*?;base64,/, '');
      if (encoded.length > 35_000_000) throw new BadRequestException('Файл слишком большой; максимум 25 МБ');
      rows = await parseWorkbook(Buffer.from(encoded, 'base64'), fileName);
    }
    if (!rows) throw new BadRequestException('Передайте rows или fileBase64');
    const report = await this.imports.validateRows(body.providerId, fileName, rows);
    const run = await this.prisma.tariffImportRun.create({
      data: {
        providerId: body.providerId, fileName, status: 'VALIDATED', totalRows: report.totalRows,
        validRows: report.validRows, errorRows: report.errorRows, warningRows: report.warningRows,
        report: report as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, status: true, createdAt: true, totalRows: true, validRows: true, errorRows: true, warningRows: true },
    });
    return { run, report };
  }

  @Post('import/apply')
  async applyImport(
    @Body() body: { runId?: string; confirmWarnings?: boolean; acceptedKeys?: unknown },
    @Req() request?: AdminRequest,
  ) {
    if (!body.runId) throw new BadRequestException('runId обязателен');
    if (body.acceptedKeys !== undefined) throw new BadRequestException('Частичное применение acceptedKeys больше не поддерживается: импорт применяется целиком');
    const run = await this.prisma.tariffImportRun.findUnique({ where: { id: body.runId } });
    if (!run) throw new BadRequestException('Отчет импорта не найден');
    if (run.status === 'APPLIED' || run.status === 'UNDONE') throw new BadRequestException('Этот импорт уже применен');
    const report = run.report as unknown as ImportReport;
    let result;
    try {
      result = await this.imports.applyReport(
        report,
        { confirmWarnings: body.confirmWarnings === true },
        run.id,
        request?.user?.id,
      );
    } catch (error) {
      await this.prisma.tariffImportRun.updateMany({
        where: { id: run.id, status: 'VALIDATED' },
        data: { status: 'FAILED' },
      });
      throw error;
    }
    return { runId: run.id, ...result };
  }

  @Get('imports')
  listImports() {
    return this.prisma.tariffImportRun.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, fileName: true, status: true, totalRows: true, validRows: true, errorRows: true, warningRows: true, createdAt: true, appliedAt: true } });
  }

  @Get('imports/:id')
  async getImport(@Param('id') id: string) {
    const run = await this.prisma.tariffImportRun.findUnique({ where: { id } });
    if (!run) throw new BadRequestException('Отчет импорта не найден');
    return run;
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const tariff = await this.prisma.tariff.findUnique({
      where: { id },
      include: {
        provider: { select: { id: true, name: true } },
        city: { select: { id: true, name: true, slug: true, siteId: true } },
      },
    });
    if (!tariff) throw new NotFoundException('Тариф не найден');
    return { ...tariff, publicPath: `/${tariff.city.slug}/${tariff.slug}`, attributeSchema: TARIFF_ATTRIBUTE_FIELDS };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateTariffDto, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const existing = await transaction.tariff.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Тариф не найден');
      if (!body.expectedUpdatedAt || existing.updatedAt.toISOString() !== body.expectedUpdatedAt) {
        throw new ConflictException('Тариф изменился после открытия формы; обновите данные');
      }

      for (const [field, value] of [['attributes', body.attributes], ['seo', body.seo]] as const) {
        if (value !== undefined && JSON.stringify(value).length > 262_144) {
          throw new BadRequestException(`${field} превышает допустимый размер`);
        }
      }
      const normalizedAttributes = body.attributes === undefined || body.attributes === null
        ? body.attributes
        : normalizeTariffAttributes(body.attributes);
      const sensitive = new Set<string>();
      if (body.cityId !== undefined && body.cityId !== existing.cityId) sensitive.add('URL');
      if (body.slug !== undefined && body.slug !== existing.slug) sensitive.add('URL');
      if (body.status !== undefined && body.status !== existing.status) sensitive.add('статус публикации');
      if (body.seo !== undefined && !isDeepStrictEqual(body.seo, existing.seo)) sensitive.add('SEO');
      if (normalizedAttributes !== undefined && normalizedAttributes !== null) {
        const currentAttributes = existing.attributes && typeof existing.attributes === 'object' && !Array.isArray(existing.attributes)
          ? existing.attributes as Record<string, unknown>
          : {};
        for (const field of TARIFF_ATTRIBUTE_FIELDS) {
          if (field.kind === 'number' && field.key.includes('price') && String(normalizedAttributes[field.key]) !== String(currentAttributes[field.key])) {
            sensitive.add('цена');
          }
        }
      }
      for (const field of ['standardPrice', 'promoPrice', 'connectionFee'] as const) {
        if (body[field] !== undefined && String(body[field]) !== String(existing[field])) sensitive.add('цена');
      }
      if (sensitive.size && body.confirmSensitiveChanges !== true) {
        throw new BadRequestException(`Требуется подтверждение изменений: ${[...sensitive].join(', ')}`);
      }

      const nextCityId = body.cityId ?? existing.cityId;
      const nextSlug = body.slug ?? existing.slug;
      const nextServiceType = body.serviceType ?? existing.serviceType as ServiceType;
      const nextStatus = body.status ?? existing.status;
      const oldCity = await transaction.city.findUnique({
        where: { id: existing.cityId },
        select: { id: true, slug: true, siteId: true, status: true, site: { select: { providerId: true } } },
      });
      const newCity = nextCityId === existing.cityId ? oldCity : await transaction.city.findUnique({
        where: { id: nextCityId },
        select: { id: true, slug: true, siteId: true, status: true, site: { select: { providerId: true } } },
      });
      if (!oldCity || !newCity) throw new BadRequestException('Город тарифа не найден');
      if (newCity.site.providerId !== existing.providerId) throw new BadRequestException('Город относится к другому провайдеру');
      if (oldCity.siteId !== newCity.siteId) throw new BadRequestException('Нельзя перенести тариф между сайтами через изменение URL');

      const sourcePath = `/${oldCity.slug}/${existing.slug}`;
      const targetPath = `/${newCity.slug}/${nextSlug}`;
      const urlChanged = sourcePath !== targetPath;
      if (urlChanged || nextStatus === 'PUBLISHED') {
        const pagePaths = urlChanged
          ? [{ cityId: oldCity.id, slug: existing.slug }, { cityId: newCity.id, slug: nextSlug }]
          : [{ cityId: newCity.id, slug: nextSlug }];
        const occupiedPage = await transaction.page.findFirst({
          where: { status: 'PUBLISHED', OR: pagePaths },
          select: { id: true },
        });
        if (occupiedPage) throw new ConflictException('Целевой URL занят опубликованной страницей');
        const occupiedTariff = await transaction.tariff.findFirst({
          where: { id: { not: id }, cityId: newCity.id, slug: nextSlug },
          select: { id: true },
        });
        if (occupiedTariff) throw new ConflictException(`Целевой URL ${targetPath} занят опубликованным тарифом`);
      }

      let redirectOutcome: 'unchanged' | 'created' | 'updated' = 'unchanged';
      const redirectStatus = nextStatus === 'PUBLISHED' && newCity.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
      if (urlChanged) {
        const redirect = await transaction.redirect.findUnique({ where: { siteId_sourcePath: { siteId: oldCity.siteId, sourcePath } } });
        if (redirect && redirect.targetPath !== targetPath) throw new ConflictException(`Для URL ${sourcePath} уже существует несовместимый редирект`);
        if (redirect?.managedTariffId && redirect.managedTariffId !== id) throw new ConflictException(`Для URL ${sourcePath} уже существует редирект другого тарифа`);
        const targetRedirect = await transaction.redirect.findUnique({ where: { siteId_sourcePath: { siteId: oldCity.siteId, sourcePath: targetPath } } });
        if (targetRedirect) throw new ConflictException(`Целевой URL ${targetPath} уже используется как источник редиректа`);
        await transaction.redirect.updateMany({ where: { siteId: oldCity.siteId, targetPath: sourcePath }, data: { targetPath } });
        if (redirect?.managedTariffId === id) {
          await transaction.redirect.update({ where: { id: redirect.id }, data: { targetPath, status: redirectStatus } });
          redirectOutcome = 'updated';
        } else if (!redirect) {
          await transaction.redirect.create({ data: { siteId: oldCity.siteId, cityId: oldCity.id, sourcePath, targetPath, status: redirectStatus, managedTariffId: id } });
          redirectOutcome = 'created';
        }
      } else if (body.status !== undefined && body.status !== existing.status) {
        await transaction.redirect.updateMany({
          where: { siteId: oldCity.siteId, managedTariffId: id },
          data: { status: redirectStatus },
        });
      }

      const { confirmSensitiveChanges: _confirmed, expectedUpdatedAt: _expected, ...editable } = body;
      if (!Object.keys(editable).length) throw new BadRequestException('Нет изменений для сохранения');
      const identityKey = this.identityKey(nextCityId, nextSlug, nextServiceType);
      const data: Prisma.TariffUncheckedUpdateInput = { identityKey };
      for (const field of ['cityId', 'name', 'slug', 'serviceType', 'standardPrice', 'promoPrice', 'speed', 'promoText', 'connectionFee', 'availability', 'status'] as const) {
        if (body[field] !== undefined) Object.assign(data, { [field]: body[field] });
      }
      if (normalizedAttributes !== undefined) data.attributes = normalizedAttributes === null ? Prisma.JsonNull : normalizedAttributes;
      if (body.seo !== undefined) data.seo = body.seo === null ? Prisma.JsonNull : body.seo as Prisma.InputJsonValue;
      const tariff = await transaction.tariff.update({
        where: { id },
        data,
        include: {
          provider: { select: { id: true, name: true } },
          city: { select: { id: true, name: true, slug: true, siteId: true } },
        },
      });
      const { provider: _provider, city: _city, attributeSchema: _schema, publicPath: _path, ...tariffSnapshot } = tariff as typeof tariff & { attributeSchema?: unknown; publicPath?: string };
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: newCity.siteId,
        entityType: 'TARIFF',
        entityId: tariff.id,
        action: 'UPDATE',
        previousSnapshot: existing as unknown as Record<string, unknown>,
        snapshot: tariffSnapshot,
        changedFields: Object.keys(editable),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return {
        tariff: { ...tariff, publicPath: `/${tariff.city.slug}/${tariff.slug}`, attributeSchema: TARIFF_ATTRIBUTE_FIELDS },
        redirectOutcome,
        workingRevision: revision.siteRevision,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { CityImportReport, CityImportService, isCityImportChangeSet } from './city-import.service';
import { parseWorkbook } from './tariff-import.service';
import { PublicationWorkflowService } from './publication-workflow.service';

type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface CityBody {
  siteId: string;
  regionId: string;
  name: string;
  slug: string;
  status?: PublishStatus;
  seo?: object;
  content?: object;
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
  ) {}

  @Get()
  list() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' }, include: { region: true, site: { select: { id: true, name: true, slug: true } } } });
  }

  @Post()
  async create(@Body() body: CityBody, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const city = await transaction.city.create({ data: body });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: city.siteId,
        entityType: 'CITY',
        entityId: city.id,
        action: 'CREATE',
        snapshot: city as unknown as Record<string, unknown>,
        changedFields: Object.keys(body),
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
      const updated = await transaction.city.update({ where: { id }, data: body });
      if (body.status !== undefined && body.status !== current.status) {
        const tariffs = await transaction.tariff.findMany({ where: { cityId: id }, select: { id: true, status: true } });
        const publishedTariffIds = updated.status === 'PUBLISHED'
          ? tariffs.filter((tariff) => tariff.status === 'PUBLISHED').map((tariff) => tariff.id)
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
        changedFields: Object.keys(body),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...updated, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

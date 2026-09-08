import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { CityImportReport, CityImportService } from './city-import.service';
import { parseWorkbook } from './tariff-import.service';

type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface CityBody {
  siteId: string;
  regionId: string;
  name: string;
  slug: string;
  phone?: string;
  status?: PublishStatus;
  seo?: object;
  content?: object;
}

@Controller('admin/cities')
@UseGuards(AdminTokenGuard)
export class AdminCitiesController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService, private readonly imports: CityImportService) {}

  @Get()
  list() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' }, include: { region: true, site: { select: { id: true, name: true, slug: true } } } });
  }

  @Post()
  async create(@Body() body: CityBody) {
    const city = await this.prisma.city.create({ data: body });
    await this.rebuild.enqueue({ entity: 'city', id: city.id, siteId: city.siteId });
    return city;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<CityBody>) {
    const city = await this.prisma.city.update({ where: { id }, data: body });
    await this.rebuild.enqueue({ entity: 'city', id: city.id, siteId: city.siteId });
    return city;
  }

  @Post('import/validate')
  async validateImport(@Body() body: { siteId?: string; fileName?: string; fileBase64?: string; rows?: Record<string, unknown>[] }) {
    if (!body.siteId) throw new BadRequestException('siteId обязателен');
    const rows = body.rows || (body.fileBase64 ? (() => {
      const encoded = body.fileBase64!.includes(',') ? body.fileBase64!.split(',', 2)[1] : body.fileBase64!;
      const buffer = Buffer.from(encoded, 'base64');
      if (buffer.length > 25 * 1024 * 1024) throw new BadRequestException('Файл слишком большой');
      return parseWorkbook(buffer);
    })() : null);
    if (!rows) throw new BadRequestException('Передайте rows или fileBase64');
    const report = await this.imports.validateRows(body.siteId, body.fileName || 'cities-import.xlsx', rows);
    const run = await this.prisma.cityImportRun.create({ data: { siteId: body.siteId, fileName: report.fileName, totalRows: report.totalRows, validRows: report.validRows, errorRows: report.errorRows, warningRows: report.warningRows, report: report as any } });
    return { runId: run.id, report };
  }

  @Post('import/apply')
  async applyImport(@Body() body: { runId?: string; actions?: Record<string, 'create' | 'update' | 'skip'>; confirmWarnings?: boolean }) {
    if (!body.runId) throw new BadRequestException('runId обязателен');
    const run = await this.prisma.cityImportRun.findUnique({ where: { id: body.runId } });
    if (!run) throw new BadRequestException('Отчет импорта не найден');
    if (run.status === 'APPLIED') throw new BadRequestException('Импорт уже применен');
    const report = run.report as unknown as CityImportReport;
    try {
      const result = await this.imports.applyReport(report, body.actions, body.confirmWarnings === true);
      await this.prisma.cityImportRun.update({ where: { id: run.id }, data: { status: 'APPLIED', appliedAt: new Date() } });
      await this.rebuild.enqueue({ entity: 'city-import', id: run.id, siteId: run.siteId });
      return { runId: run.id, ...result };
    } catch (error) {
      await this.prisma.cityImportRun.update({ where: { id: run.id }, data: { status: 'FAILED' } });
      throw error;
    }
  }

  @Get('imports')
  importsList() { return this.prisma.cityImportRun.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }

  @Get('imports/:id')
  importDetail(@Param('id') id: string) { return this.prisma.cityImportRun.findUniqueOrThrow({ where: { id } }); }
}

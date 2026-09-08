import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { ImportReport, parseWorkbook, TariffImportService } from './tariff-import.service';

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
  identityKey?: string;
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

@Controller('admin/tariffs')
@UseGuards(AdminTokenGuard)
export class AdminTariffsController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService, private readonly imports: TariffImportService) {}

  private identityKey(cityId: string, name: string, serviceType: ServiceType) {
    const normalizedName = name.trim().toLocaleLowerCase('ru-RU').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return `${cityId}:${normalizedName}:${serviceType.toLowerCase()}`;
  }

  private async siteIdForCity(cityId: string) {
    return (await this.prisma.city.findUnique({ where: { id: cityId }, select: { siteId: true } }))?.siteId;
  }

  @Get()
  list() {
    return this.prisma.tariff.findMany({ orderBy: { updatedAt: 'desc' }, include: { city: true, provider: { select: { id: true, name: true, slug: true } } } });
  }

  @Post()
  async create(@Body() body: TariffBody) {
    const data = { ...body, identityKey: body.identityKey || this.identityKey(body.cityId, body.name, body.serviceType) };
    const tariff = await this.prisma.tariff.create({ data });
    await this.rebuild.enqueue({ entity: 'tariff', id: tariff.id, siteId: await this.siteIdForCity(tariff.cityId) });
    return tariff;
  }

  @Post('import')
  async import(@Body() body: ImportBody) {
    const tariffs = await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const imported = [];
      for (const item of body.items) {
        const identityKey = item.identityKey || this.identityKey(body.cityId, item.name, item.serviceType);
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
    let rows = body.rows;
    if (!rows && body.fileBase64) {
      const encoded = body.fileBase64.replace(/^data:.*?;base64,/, '');
      if (encoded.length > 35_000_000) throw new BadRequestException('Файл слишком большой; максимум 25 МБ');
      rows = parseWorkbook(Buffer.from(encoded, 'base64'));
    }
    if (!rows) throw new BadRequestException('Передайте rows или fileBase64');
    const fileName = body.fileName?.trim() || 'tariffs-import.xlsx';
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
  async applyImport(@Body() body: { runId?: string; acceptedKeys?: string[] }) {
    if (!body.runId) throw new BadRequestException('runId обязателен');
    const run = await this.prisma.tariffImportRun.findUnique({ where: { id: body.runId } });
    if (!run) throw new BadRequestException('Отчет импорта не найден');
    if (run.status === 'APPLIED') throw new BadRequestException('Этот импорт уже применен');
    const report = run.report as unknown as ImportReport;
    try {
      const result = await this.imports.applyReport(report, body.acceptedKeys);
      await this.prisma.tariffImportRun.update({ where: { id: run.id }, data: { status: 'APPLIED', appliedAt: new Date() } });
      const cities = await this.prisma.city.findMany({
        where: { id: { in: [...new Set(report.candidates.map((candidate) => candidate.cityId))] } },
        select: { id: true, siteId: true },
      });
      for (const siteId of new Set(cities.map((city) => city.siteId))) {
        await this.rebuild.enqueue({ entity: 'tariff-import', id: run.id, siteId });
      }
      return { runId: run.id, ...result };
    } catch (error) {
      await this.prisma.tariffImportRun.update({ where: { id: run.id }, data: { status: 'FAILED' } });
      throw error;
    }
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

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<TariffBody>) {
    const existing = await this.prisma.tariff.findUnique({ where: { id } });
    if (!existing) return this.prisma.tariff.update({ where: { id }, data: body });
    const identityKey = body.identityKey || this.identityKey(
      body.cityId || existing.cityId,
      body.name || existing.name,
      body.serviceType || existing.serviceType as ServiceType,
    );
    const tariff = await this.prisma.tariff.update({ where: { id }, data: { ...body, identityKey } });
    await this.rebuild.enqueue({ entity: 'tariff', id: tariff.id, siteId: await this.siteIdForCity(tariff.cityId) });
    return tariff;
  }
}

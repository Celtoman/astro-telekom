import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { listVariableDefinitions } from './variable-registry';
import { applyVariableMigration, planVariableMigration, type VariableMigrationInput } from './variable-migration';

@Controller('admin/sites/:siteId/variable-migration')
@UseGuards(AdminTokenGuard)
export class AdminVariableMigrationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get('preview')
  async preview(
    @Param('siteId') siteId: string,
    @Query('sourceCode') sourceCode: string,
    @Query('targetCode') targetCode: string,
    @Query('expectedWorkingRevision') rawRevision: string,
  ) {
    const definitions = listVariableDefinitions();
    planVariableMigration(definitions, sourceCode, targetCode, { pages: [], tariffs: [], seoTemplates: [] });
    const expectedWorkingRevision = Number(rawRevision);
    if (!/^(0|[1-9]\d*)$/.test(rawRevision) || !Number.isSafeInteger(expectedWorkingRevision)) {
      throw new BadRequestException('Передайте актуальную рабочую ревизию сайта');
    }
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.findUnique({ where: { id: siteId }, select: { id: true, workingRevision: true, publishedRevision: true } });
      if (!site) throw new NotFoundException('Сайт не найден');
      if (site.workingRevision !== expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась; обновите просмотр миграции');
      const [pages, pageTemplates, tariffs, seoTemplates] = await Promise.all([
        transaction.page.findMany({ where: { siteId }, include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }, orderBy: { id: 'asc' } }),
        transaction.pageTemplate.findMany({ where: { siteId }, include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }, orderBy: { id: 'asc' } }),
        transaction.tariff.findMany({ where: { city: { siteId } }, orderBy: { id: 'asc' } }),
        transaction.seoTemplate.findMany({ where: { siteId }, orderBy: { id: 'asc' } }),
      ]);
      const plan = planVariableMigration(definitions, sourceCode, targetCode, { pages, pageTemplates, tariffs, seoTemplates });
      return {
        sourceCode, targetCode, workingRevision: site.workingRevision, publishedRevision: site.publishedRevision,
        replacementCount: plan.replacementCount,
        changes: plan.changes.map(({ entityType, entityId, changedFields, replacementCount, before, next }) =>
          ({ entityType, entityId, changedFields, replacementCount, before, next })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000, maxWait: 10_000 });
  }

  @Post('apply')
  async apply(
    @Param('siteId') siteId: string,
    @Body() body: Omit<VariableMigrationInput, 'siteId' | 'actorId'>,
    @Req() request?: { user?: { id: string } },
  ) {
    if (!body || typeof body !== 'object') throw new BadRequestException('Передайте параметры миграции');
    const definitions = listVariableDefinitions();
    planVariableMigration(definitions, body.sourceCode, body.targetCode, { pages: [], tariffs: [], seoTemplates: [] });
    try {
      return await this.prisma.$transaction((transaction: Prisma.TransactionClient) => applyVariableMigration(
        transaction, this.publications, definitions, { ...body, siteId, actorId: request?.user?.id },
      ), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000, maxWait: 10_000 });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
        throw new ConflictException('Данные изменились параллельно; обновите просмотр миграции');
      }
      throw error;
    }
  }
}

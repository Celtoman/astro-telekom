import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { ACCOUNT_PAGE_SLUG } from './account-page-model';
import { validateAccountPage } from './account-page';
import { servingPublication } from './serving-publication-context';

@Controller('admin/sites/:siteId/account')
@UseGuards(AdminTokenGuard)
export class AdminAccountController {
  constructor(private readonly prisma: PrismaService, private readonly publications: PublicationWorkflowService) {}

  @Get()
  async get(@Param('siteId') siteId: string) {
    const working = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const site = await tx.site.findUnique({ where: { id: siteId }, select: { slug: true, workingRevision: true, publishedRevision: true, connectionPhone: true, supportPhone: true } });
      if (!site) throw new NotFoundException('Сайт не найден');
      const page = await tx.page.findFirst({ where: { siteId, cityId: null, type: 'ACCOUNT', slug: ACCOUNT_PAGE_SLUG } });
      if (!page) throw new NotFoundException('Рабочая страница личного кабинета ещё не подготовлена');
      return { site, page, missingFields: validateAccountPage(page.content, true) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let serving: Awaited<ReturnType<typeof servingPublication>> = null;
    let publishedAvailable = true;
    if (process.env.REBUILD_PROVIDER === 'static') {
      try { serving = await servingPublication(this.prisma, working.site.slug); }
      catch { publishedAvailable = false; }
    }
    const rows = publishedAvailable ? await this.prisma.$queryRaw<Array<{ content: unknown; revision: number }>>(Prisma.sql`
      SELECT p."sourceSnapshot" -> 'globalPages' AS content, s."siteRevision" AS revision FROM "SitePublication" s
      LEFT JOIN "SitePublicationValidation" p ON s."validationId"=p.id WHERE s."siteId"=${siteId}
        AND ${serving ? Prisma.sql`s.id=${serving.id}` : Prisma.sql`s.status='SUCCEEDED'`}
      ORDER BY s."siteRevision" DESC LIMIT 1`) : [];
    const pages = rows[0]?.content;
    const published = Array.isArray(pages) ? pages.find(p => p.type === 'ACCOUNT')?.content ?? null : null;
    return { content: working.page.content, pageId: working.page.id, status: working.page.status,
      workingRevision: working.site.workingRevision,
      publishedRevision: publishedAvailable ? serving?.siteRevision ?? rows[0]?.revision ?? working.site.publishedRevision : null,
      published, publishedAvailable, missingFields: working.missingFields,
      system: { connectionPhone: working.site.connectionPhone, supportPhone: working.site.supportPhone } };
  }

  @Patch()
  async save(@Param('siteId') siteId: string, @Body() body: { expectedWorkingRevision: number; content: unknown }, @Req() request?: { user?: { id: string } }) {
    if (!body || Object.keys(body).some(k => !['expectedWorkingRevision', 'content'].includes(k)) || !Number.isSafeInteger(body.expectedWorkingRevision) || body.expectedWorkingRevision < 0) throw new BadRequestException('Передайте content и актуальную рабочую ревизию');
    const missingFields = validateAccountPage(body.content, true);
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const site = await tx.site.findUnique({ where: { id: siteId }, select: { workingRevision: true } });
        if (!site) throw new NotFoundException('Сайт не найден');
        if (site.workingRevision !== body.expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась. Обновите данные перед сохранением. Введённое сохранено в форме.');
        const before = await tx.page.findFirst({ where: { siteId, type: 'ACCOUNT', cityId: null, slug: ACCOUNT_PAGE_SLUG } });
        if (!before) throw new NotFoundException('Страница личного кабинета не найдена');
        const after = await tx.page.update({ where: { id: before.id }, data: { content: body.content as Prisma.InputJsonObject } });
        const revision = await this.publications.recordWorkingRevision(tx, { siteId, entityType: 'PAGE', entityId: before.id, action: 'UPDATE',
          previousSnapshot: before as unknown as Record<string, unknown>, snapshot: after as unknown as Record<string, unknown>, changedFields: ['content'], actorId: request?.user?.id, source: 'admin:account' });
        return { content: after.content, missingFields, workingRevision: revision.siteRevision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') throw new ConflictException('Страница была изменена параллельно; обновите данные.');
      throw error;
    }
  }
}

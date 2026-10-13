import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { validateCityHomeBlocks } from './block-validation';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { validateTariffCollection } from './tariff-collection';
import { TARIFF_COLLECTION_VERSION, TARIFF_COLLECTION_IMPLEMENTATION } from './tariff-collection-model';
import { firstScreenFromTemplate, validateFirstScreen, type FirstScreenKind } from './first-screen';
import { publishedPageTemplateView } from './published-page-template-view';

type TemplateBlockInput = {
  blockType: string;
  position: number;
  visible: boolean;
  data: Prisma.InputJsonObject;
  source?: string | null;
};

type TemplateBody = {
  expectedWorkingRevision: number;
  titleTemplate: string;
  blocks: TemplateBlockInput[];
};

@Controller('admin/sites/:siteId/page-templates')
@UseGuards(AdminTokenGuard)
export class AdminPageTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get()
  list(@Param('siteId') siteId: string) {
    return this.prisma.pageTemplate.findMany({
      where: { siteId }, orderBy: { kind: 'asc' },
      include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
  }

  @Get('first-screens')
  async firstScreens(@Param('siteId') siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { workingRevision: true, publishedRevision: true } });
    if (!site) throw new NotFoundException('Сайт не найден');
    const [templates, publication] = await Promise.all([
      this.prisma.pageTemplate.findMany({ where: { siteId, kind: { in: ['HOME', 'CITY_HOME'] } }, include: { blocks: { orderBy: { position: 'asc' } } } }),
      publishedPageTemplateView(this.prisma, siteId),
    ]);
    return { ...site, screens: templates.map(template => {
      const screen = firstScreenFromTemplate(template);
      const publishedTemplate = publication?.pageTemplates?.find((item: any) => item.kind === template.kind);
      const published = publishedTemplate?.content?.firstScreenPassportVersion ? firstScreenFromTemplate(publishedTemplate).data : template.kind === 'HOME' ? publication?.homeHero : null;
      return { ...screen, missingFields: screen.data ? validateFirstScreen(screen.kind, screen.data, true, screen.passportVersion) : ['title'], published: published ?? null };
    }) };
  }

  @Patch('first-screens/:kind')
  async updateFirstScreen(@Param('siteId') siteId: string, @Param('kind') rawKind: string,
    @Body() body: { expectedWorkingRevision: number; data: Record<string, unknown> }, @Req() request?: { user?: { id: string } }) {
    if (rawKind !== 'HOME' && rawKind !== 'CITY_HOME') throw new BadRequestException('Неизвестный первый экран');
    const kind: FirstScreenKind = rawKind;
    if (!body || Object.keys(body).some(key => !['expectedWorkingRevision', 'data'].includes(key)) || !Number.isSafeInteger(body.expectedWorkingRevision) || body.expectedWorkingRevision < 0) throw new BadRequestException('Передайте контент и актуальную рабочую ревизию');
    // Resolve the contract from the locked working template, never from a client version.
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const site = await tx.site.findUnique({ where: { id: siteId }, select: { workingRevision: true } });
        if (!site) throw new NotFoundException('Сайт не найден');
        if (site.workingRevision !== body.expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась. Обновите данные перед сохранением.');
        const before = await tx.pageTemplate.findUnique({ where: { siteId_kind: { siteId, kind } }, include: { blocks: true } });
        if (!before) throw new NotFoundException('Шаблон первого экрана не найден; требуется миграция данных');
        const metadata = firstScreenFromTemplate(before);
        const missingFields = validateFirstScreen(kind, body.data, true, metadata.passportVersion);
        const block = before.blocks.find(item => item.blockType === (kind === 'HOME' ? 'home.hero' : 'hero'));
        if (!block) throw new NotFoundException('Первый экран шаблона не найден');
        await tx.pageTemplateBlock.update({ where: { id: block.id }, data: { data: body.data as Prisma.InputJsonObject, source: 'admin:first-screen' } });
        await tx.pageTemplate.update({ where: { id: before.id }, data: { content: { ...(before.content as object ?? {}), firstScreenPassportVersion: metadata.passportVersion, firstScreenImplementationVersion: metadata.implementationVersion } } });
        const after = await tx.pageTemplate.findUniqueOrThrow({ where: { id: before.id }, include: { blocks: true } });
        const revision = await this.publications.recordWorkingRevision(tx, {
          siteId, entityType: 'PAGE_TEMPLATE', entityId: before.id, action: 'UPDATE',
          previousSnapshot: before as unknown as Record<string, unknown>, snapshot: after as unknown as Record<string, unknown>,
          changedFields: ['blocks.data', 'content.firstScreenPassportVersion', 'content.firstScreenImplementationVersion'], actorId: request?.user?.id, source: 'admin:first-screen',
        });
        return { ...firstScreenFromTemplate(after), missingFields, workingRevision: revision.siteRevision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') throw new ConflictException('Шаблон изменился параллельно; обновите данные');
      throw error;
    }
  }

  @Get('tariff-collection')
  async tariffCollection(@Param('siteId') siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { workingRevision: true, publishedRevision: true } });
    if (!site) throw new NotFoundException('Сайт не найден');
    const template = await this.prisma.pageTemplate.findUnique({ where: { siteId_kind: { siteId, kind: 'CITY_HOME' } }, include: { blocks: true } });
    const block = template?.blocks.find(item => item.blockType === 'tariff_grid' && item.visible);
    if (!block) throw new NotFoundException('Тарифный блок не найден; требуется миграция данных');
    const publication = await publishedPageTemplateView(this.prisma, siteId);
    const publishedTemplate = publication?.pageTemplates?.find((item: any) => item.kind === 'CITY_HOME');
    const published = publishedTemplate?.content?.tariffCollectionPassportVersion === TARIFF_COLLECTION_VERSION
      ? publishedTemplate.blocks.find((item: any) => item.blockType === 'tariff_grid' && item.visible)?.data : null;
    return { ...site, data: block.data, missingFields: validateTariffCollection(block.data, true), published: published ?? null };
  }

  @Patch('tariff-collection')
  async updateTariffCollection(@Param('siteId') siteId: string,
    @Body() body: { expectedWorkingRevision: number; data: Record<string, unknown> }, @Req() request?: { user?: { id: string } }) {
    if (!body || Object.keys(body).some(key => !['expectedWorkingRevision', 'data'].includes(key)) || !Number.isSafeInteger(body.expectedWorkingRevision) || body.expectedWorkingRevision < 0) throw new BadRequestException('Передайте контент и актуальную рабочую ревизию');
    const missingFields = validateTariffCollection(body.data, true);
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const site = await tx.site.findUnique({ where: { id: siteId }, select: { workingRevision: true } });
        if (!site) throw new NotFoundException('Сайт не найден');
        if (site.workingRevision !== body.expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась. Обновите данные перед сохранением.');
        const before = await tx.pageTemplate.findUnique({ where: { siteId_kind: { siteId, kind: 'CITY_HOME' } }, include: { blocks: true } });
        const block = before?.blocks.find(item => item.blockType === 'tariff_grid' && item.visible);
        if (!before || !block) throw new NotFoundException('Тарифный блок не найден; требуется миграция данных');
        await tx.pageTemplateBlock.update({ where: { id: block.id }, data: { data: body.data as Prisma.InputJsonObject, source: 'admin:tariff-collection' } });
        await tx.pageTemplate.update({ where: { id: before.id }, data: { content: { ...(before.content as object ?? {}), tariffCollectionPassportVersion: TARIFF_COLLECTION_VERSION, tariffCollectionImplementationVersion: TARIFF_COLLECTION_IMPLEMENTATION } } });
        const after = await tx.pageTemplate.findUniqueOrThrow({ where: { id: before.id }, include: { blocks: true } });
        const revision = await this.publications.recordWorkingRevision(tx, {
          siteId, entityType: 'PAGE_TEMPLATE', entityId: before.id, action: 'UPDATE',
          previousSnapshot: before as unknown as Record<string, unknown>, snapshot: after as unknown as Record<string, unknown>,
          changedFields: ['blocks.data', 'content.tariffCollectionPassportVersion', 'content.tariffCollectionImplementationVersion'], actorId: request?.user?.id, source: 'admin:tariff-collection',
        });
        return { data: body.data, missingFields, workingRevision: revision.siteRevision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') throw new ConflictException('Шаблон изменился параллельно; обновите данные');
      throw error;
    }
  }

  @Patch('city-home')
  async updateCityHome(
    @Param('siteId') siteId: string,
    @Body() body: TemplateBody,
    @Req() request?: { user?: { id: string } },
  ) {
    if (!Number.isSafeInteger(body?.expectedWorkingRevision) || body.expectedWorkingRevision < 0) {
      throw new BadRequestException('Передайте актуальную рабочую ревизию сайта');
    }
    if (typeof body.titleTemplate !== 'string' || !body.titleTemplate.trim() || body.titleTemplate.length > 200 || /[<>\r\n]/.test(body.titleTemplate)) {
      throw new BadRequestException('Некорректный заголовок шаблона');
    }
    if (!Array.isArray(body.blocks)) throw new BadRequestException('Передайте полную композицию блоков');
    const blocks = [...body.blocks].sort((left, right) => left.position - right.position);
    if (blocks.some((block) => block.visible !== true)) throw new BadRequestException('Оба блока городской HOME должны быть видимыми');
    validateCityHomeBlocks(blocks, 'шаблон');
    if (new Set(blocks.map((block) => block.position)).size !== blocks.length) {
      throw new BadRequestException('Позиции блоков шаблона должны быть уникальными');
    }
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const site = await tx.site.findUnique({ where: { id: siteId }, select: { workingRevision: true } });
        if (!site) throw new NotFoundException('Сайт не найден');
        if (site.workingRevision !== body.expectedWorkingRevision) throw new ConflictException('Рабочая ревизия сайта изменилась');
        const before = await tx.pageTemplate.findUnique({
          where: { siteId_kind: { siteId, kind: 'CITY_HOME' } },
          include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
        });
        if (!before) throw new NotFoundException('Шаблон городской HOME не найден');
        await tx.pageTemplateBlock.deleteMany({ where: { templateId: before.id } });
        await tx.pageTemplateBlock.createMany({ data: blocks.map((block) => ({
          templateId: before.id, blockType: block.blockType, position: block.position,
          visible: block.visible, data: block.data, source: block.source ?? 'admin:page-template',
        })) });
        await tx.pageTemplate.update({ where: { id: before.id }, data: { titleTemplate: body.titleTemplate.trim() } });
        const after = await tx.pageTemplate.findUniqueOrThrow({
          where: { id: before.id }, include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
        });
        const revision = await this.publications.recordWorkingRevision(tx, {
          siteId, entityType: 'PAGE_TEMPLATE', entityId: before.id, action: 'UPDATE',
          previousSnapshot: before as unknown as Record<string, unknown>,
          snapshot: after as unknown as Record<string, unknown>,
          changedFields: ['titleTemplate', 'blocks'], actorId: request?.user?.id,
          source: 'admin:page-template',
        });
        return { ...after, workingRevision: revision.siteRevision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
        throw new ConflictException('Шаблон изменился параллельно; обновите данные');
      }
      throw error;
    }
  }
}

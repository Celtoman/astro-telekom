import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { validateCityHomeBlocks } from './block-validation';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';

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
    if (blocks.some((block) => block.visible !== true)) throw new BadRequestException('Все семь блоков городской HOME должны быть видимыми');
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

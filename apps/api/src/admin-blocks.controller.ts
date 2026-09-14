import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { validateBlock } from './block-validation';
import { PublicationWorkflowService } from './publication-workflow.service';

interface BlockBody {
  blockType: string;
  position: number;
  visible?: boolean;
  data: Prisma.InputJsonObject;
  source?: string | null;
}

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminBlocksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get('pages/:pageId/blocks')
  list(@Param('pageId') pageId: string) {
    return this.prisma.pageBlock.findMany({ where: { pageId, archivedAt: null }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  }

  @Post('pages/:pageId/blocks')
  async create(@Param('pageId') pageId: string, @Body() body: BlockBody, @Req() request?: AdminRequest) {
    validateBlock(body);
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const pageBefore = await transaction.page.findUnique({
        where: { id: pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!pageBefore) throw new NotFoundException('Страница не найдена');
      const block = await transaction.pageBlock.create({ data: { ...body, pageId } });
      const page = await transaction.page.findUnique({
        where: { id: pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!page) throw new NotFoundException('Страница не найдена');
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: page.siteId,
        entityType: 'PAGE',
        entityId: pageId,
        action: 'UPDATE',
        previousSnapshot: pageBefore as unknown as Record<string, unknown>,
        snapshot: page as unknown as Record<string, unknown>,
        changedFields: ['blocks'],
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...block, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Patch('blocks/:id')
  async update(@Param('id') id: string, @Body() body: Partial<BlockBody>, @Req() request?: AdminRequest) {
    validateBlock(body, true);
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const initialBlock = await transaction.pageBlock.findUnique({ where: { id } });
      if (!initialBlock) throw new NotFoundException('Блок не найден');
      if (initialBlock.archivedAt) throw new ConflictException('Блок находится в корзине. Сначала восстановите его');
      const pageBefore = await transaction.page.findUnique({
        where: { id: initialBlock.pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!pageBefore) throw new NotFoundException('Страница не найдена');
      let block;
      if ('blockType' in body || 'data' in body) {
        const stored = await transaction.pageBlock.findUnique({
        where: { id },
        select: { blockType: true, position: true, visible: true, data: true, source: true },
        });
        if (!stored) throw new NotFoundException('Блок не найден');
        if (body.blockType && body.blockType !== stored.blockType && !('data' in body)) {
          throw new BadRequestException('При смене типа блока нужно передать полные data нового типа');
        }
        validateBlock({
          blockType: body.blockType ?? stored.blockType,
          position: body.position ?? stored.position,
          visible: body.visible ?? stored.visible,
          data: body.data ?? stored.data,
          source: 'source' in body ? body.source : stored.source,
        });
        const result = await transaction.pageBlock.updateMany({
          where: { id, blockType: stored.blockType },
          data: body,
        });
        if (result.count !== 1) throw new ConflictException('Блок уже был изменен. Обновите данные и повторите действие');
        block = await transaction.pageBlock.findUnique({ where: { id } });
        if (!block) throw new NotFoundException('Блок не найден');
      } else {
        block = await transaction.pageBlock.update({ where: { id }, data: body });
      }
      const page = await transaction.page.findUnique({
        where: { id: block.pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!page) throw new NotFoundException('Страница не найдена');
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: page.siteId,
        entityType: 'PAGE',
        entityId: block.pageId,
        action: 'UPDATE',
        previousSnapshot: pageBefore as unknown as Record<string, unknown>,
        snapshot: page as unknown as Record<string, unknown>,
        changedFields: ['blocks'],
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...block, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Delete('blocks/:id')
  async remove(@Param('id') id: string, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const initialBlock = await transaction.pageBlock.findUnique({ where: { id } });
      if (!initialBlock) throw new NotFoundException('Блок не найден');
      if (initialBlock.archivedAt) throw new ConflictException('Блок уже находится в корзине');
      const pageBefore = await transaction.page.findUnique({
        where: { id: initialBlock.pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!pageBefore) throw new NotFoundException('Страница не найдена');
      const archivedAt = new Date();
      const result = await transaction.pageBlock.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt },
      });
      if (result.count !== 1) throw new ConflictException('Блок уже был перемещен в корзину');
      const block = await transaction.pageBlock.findUnique({ where: { id } });
      if (!block) throw new NotFoundException('Блок не найден');
      const page = await transaction.page.findUnique({
        where: { id: block.pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!page) throw new NotFoundException('Страница не найдена');
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: page.siteId,
        entityType: 'PAGE',
        entityId: block.pageId,
        action: 'ARCHIVE',
        previousSnapshot: pageBefore as unknown as Record<string, unknown>,
        snapshot: page as unknown as Record<string, unknown>,
        changedFields: ['blocks'],
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...block, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Post('blocks/:id/restore')
  async restore(@Param('id') id: string, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const initialBlock = await transaction.pageBlock.findUnique({ where: { id } });
      if (!initialBlock) throw new NotFoundException('Блок не найден');
      if (!initialBlock.archivedAt) throw new ConflictException('Блок не находится в корзине');
      const pageBefore = await transaction.page.findUnique({
        where: { id: initialBlock.pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!pageBefore) throw new NotFoundException('Страница не найдена');
      const result = await transaction.pageBlock.updateMany({
        where: { id, archivedAt: { not: null } },
        data: { archivedAt: null },
      });
      if (result.count !== 1) throw new ConflictException('Блок уже был восстановлен');
      const block = await transaction.pageBlock.findUnique({ where: { id } });
      if (!block) throw new NotFoundException('Блок не найден');
      const page = await transaction.page.findUnique({
        where: { id: block.pageId },
        include: { blocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      if (!page) throw new NotFoundException('Страница не найдена');
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: page.siteId,
        entityType: 'PAGE',
        entityId: block.pageId,
        action: 'RESTORE',
        previousSnapshot: pageBefore as unknown as Record<string, unknown>,
        snapshot: page as unknown as Record<string, unknown>,
        changedFields: ['blocks'],
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...block, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { validateBlock } from './block-validation';

interface BlockBody {
  blockType: string;
  position: number;
  visible?: boolean;
  data: Prisma.InputJsonObject;
  source?: string | null;
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminBlocksController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

  @Get('pages/:pageId/blocks')
  list(@Param('pageId') pageId: string) {
    return this.prisma.pageBlock.findMany({ where: { pageId }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  }

  @Post('pages/:pageId/blocks')
  async create(@Param('pageId') pageId: string, @Body() body: BlockBody) {
    validateBlock(body);
    const block = await this.prisma.pageBlock.create({ data: { ...body, pageId } });
    const page = await this.prisma.page.findUnique({ where: { id: pageId }, select: { siteId: true } });
    await this.rebuild.enqueue({ entity: 'page-block', id: block.id, siteId: page?.siteId });
    return block;
  }

  @Patch('blocks/:id')
  async update(@Param('id') id: string, @Body() body: Partial<BlockBody>) {
    validateBlock(body, true);
    let block;
    if ('blockType' in body || 'data' in body) {
      const stored = await this.prisma.pageBlock.findUnique({
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
      const result = await this.prisma.pageBlock.updateMany({
        where: { id, blockType: stored.blockType },
        data: body,
      });
      if (result.count !== 1) throw new ConflictException('Блок уже был изменен. Обновите данные и повторите действие');
      block = await this.prisma.pageBlock.findUnique({ where: { id } });
      if (!block) throw new NotFoundException('Блок не найден');
    } else {
      block = await this.prisma.pageBlock.update({ where: { id }, data: body });
    }
    const page = await this.prisma.page.findUnique({ where: { id: block.pageId }, select: { siteId: true } });
    await this.rebuild.enqueue({ entity: 'page-block', id: block.id, siteId: page?.siteId });
    return block;
  }

  @Delete('blocks/:id')
  async remove(@Param('id') id: string) {
    const block = await this.prisma.pageBlock.delete({ where: { id } });
    const page = await this.prisma.page.findUnique({ where: { id: block.pageId }, select: { siteId: true } });
    await this.rebuild.enqueue({ entity: 'page-block', id: block.id, siteId: page?.siteId });
    return block;
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
  source?: string;
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminBlocksController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

  @Get('pages/:pageId/blocks')
  list(@Param('pageId') pageId: string) {
    return this.prisma.pageBlock.findMany({ where: { pageId }, orderBy: { position: 'asc' } });
  }

  @Post('pages/:pageId/blocks')
  async create(@Param('pageId') pageId: string, @Body() body: BlockBody) {
    validateBlock(body);
    const block = await this.prisma.pageBlock.create({ data: { ...body, pageId } });
    const page = await this.prisma.page.findUnique({ where: { id: pageId }, select: { siteId: true } });
    void this.rebuild.enqueue({ entity: 'page-block', id: block.id, siteId: page?.siteId });
    return block;
  }

  @Patch('blocks/:id')
  async update(@Param('id') id: string, @Body() body: Partial<BlockBody>) {
    validateBlock(body, true);
    const block = await this.prisma.pageBlock.update({ where: { id }, data: body });
    const page = await this.prisma.page.findUnique({ where: { id: block.pageId }, select: { siteId: true } });
    void this.rebuild.enqueue({ entity: 'page-block', id: block.id, siteId: page?.siteId });
    return block;
  }

  @Delete('blocks/:id')
  async remove(@Param('id') id: string) {
    const block = await this.prisma.pageBlock.delete({ where: { id } });
    const page = await this.prisma.page.findUnique({ where: { id: block.pageId }, select: { siteId: true } });
    void this.rebuild.enqueue({ entity: 'page-block', id: block.id, siteId: page?.siteId });
    return block;
  }
}

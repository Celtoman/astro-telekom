import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';

type PageType = 'HOME' | 'INTERNET' | 'INTERNET_TV' | 'TV' | 'TARIFF' | 'ADDRESS_CHECK' | 'FAQ';
type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface PageBody {
  siteId: string;
  cityId: string;
  type: PageType;
  title: string;
  slug: string;
  status?: PublishStatus;
  seo?: object;
  content?: object;
}

@Controller('admin/pages')
@UseGuards(AdminTokenGuard)
export class AdminPagesController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

  @Get()
  list() {
    return this.prisma.page.findMany({ orderBy: { updatedAt: 'desc' }, include: { city: true } });
  }

  @Post()
  create(@Body() body: PageBody) {
    return this.prisma.page.create({ data: body }).then((page: any) => { void this.rebuild.enqueue({ entity: 'page', id: page.id, siteId: page.siteId }); return page; });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<PageBody>) {
    return this.prisma.page.update({ where: { id }, data: body }).then((page: any) => { void this.rebuild.enqueue({ entity: 'page', id: page.id, siteId: page.siteId }); return page; });
  }
}

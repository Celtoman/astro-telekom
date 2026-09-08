import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';

type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface SiteBody {
  providerId: string;
  name: string;
  slug: string;
  domain?: string;
  settings?: object;
  status?: PublishStatus;
}

@Controller('admin/sites')
@UseGuards(AdminTokenGuard)
export class AdminSitesController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

  @Get()
  list() {
    return this.prisma.site.findMany({ orderBy: { name: 'asc' }, include: { provider: true, regions: true, cities: { select: { id: true, name: true, slug: true, status: true } } } });
  }

  @Post()
  async create(@Body() body: SiteBody) {
    const site = await this.prisma.site.create({ data: body });
    await this.rebuild.enqueue({ entity: 'site', id: site.id, siteId: site.id });
    return site;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<SiteBody>) {
    const site = await this.prisma.site.update({ where: { id }, data: body });
    await this.rebuild.enqueue({ entity: 'site', id: site.id, siteId: site.id });
    return site;
  }
}

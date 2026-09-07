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
  create(@Body() body: SiteBody) {
    return this.prisma.site.create({ data: body }).then((site: any) => { void this.rebuild.enqueue({ entity: 'site', id: site.id, siteId: site.id }); return site; });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<SiteBody>) {
    return this.prisma.site.update({ where: { id }, data: body }).then((site: any) => { void this.rebuild.enqueue({ entity: 'site', id: site.id, siteId: site.id }); return site; });
  }
}

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';

interface RegionBody {
  siteId: string;
  name: string;
  slug: string;
  phone?: string;
  content?: object;
}

@Controller('admin/regions')
@UseGuards(AdminTokenGuard)
export class AdminRegionsController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

  @Get()
  list() {
    return this.prisma.region.findMany({ orderBy: { name: 'asc' }, include: { site: { select: { id: true, name: true, slug: true } }, cities: { select: { id: true, name: true, slug: true } } } });
  }

  @Post()
  create(@Body() body: RegionBody) {
    return this.prisma.region.create({ data: body }).then((region: any) => { void this.rebuild.enqueue({ entity: 'region', id: region.id, siteId: region.siteId }); return region; });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<RegionBody>) {
    return this.prisma.region.update({ where: { id }, data: body }).then((region: any) => { void this.rebuild.enqueue({ entity: 'region', id: region.id, siteId: region.siteId }); return region; });
  }
}

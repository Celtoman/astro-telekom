import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';

interface ProviderBody {
  name: string;
  slug: string;
  legalData?: object;
  settings?: object;
}

@Controller('admin/providers')
@UseGuards(AdminTokenGuard)
export class AdminProvidersController {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

  @Get()
  list() {
    return this.prisma.provider.findMany({ orderBy: { name: 'asc' }, include: { sites: { select: { id: true, name: true, slug: true, status: true } } } });
  }

  @Post()
  create(@Body() body: ProviderBody) {
    return this.prisma.provider.create({ data: body });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<ProviderBody>) {
    const provider = await this.prisma.provider.update({ where: { id }, data: body });
    const sites = await this.prisma.site.findMany({ where: { providerId: id }, select: { id: true } });
    for (const site of sites) await this.rebuild.enqueue({ entity: 'provider', id: provider.id, siteId: site.id });
    return provider;
  }
}

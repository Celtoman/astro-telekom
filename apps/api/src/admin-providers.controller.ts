import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';

interface ProviderBody {
  name: string;
  slug: string;
  legalData?: object;
  settings?: object;
}

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin/providers')
@UseGuards(AdminTokenGuard)
export class AdminProvidersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get()
  list() {
    return this.prisma.provider.findMany({ orderBy: { name: 'asc' }, include: { sites: { select: { id: true, name: true, slug: true, status: true } } } });
  }

  @Post()
  create(@Body() body: ProviderBody) {
    return this.prisma.provider.create({ data: body });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<ProviderBody>, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.provider.findUnique({ where: { id } });
      if (!current) throw new BadRequestException('Провайдер не найден');
      const provider = await transaction.provider.update({ where: { id }, data: body });
      const sites = await transaction.site.findMany({ where: { providerId: id }, select: { id: true }, orderBy: { id: 'asc' } });
      const workingRevisions: Array<{ siteId: string; workingRevision: number }> = [];
      for (const site of sites) {
        const revision = await this.publications.recordWorkingRevision(transaction, {
          siteId: site.id,
          entityType: 'PROVIDER',
          entityId: provider.id,
          action: 'UPDATE',
          previousSnapshot: current as unknown as Record<string, unknown>,
          snapshot: provider as unknown as Record<string, unknown>,
          changedFields: Object.keys(body),
          actorId: request?.user?.id,
          source: 'admin',
        });
        workingRevisions.push({ siteId: site.id, workingRevision: revision.siteRevision });
      }
      return { ...provider, workingRevisions };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

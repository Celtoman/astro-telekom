import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';

type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface SiteBody {
  providerId: string;
  name: string;
  slug: string;
  domain?: string;
  settings?: object;
  status?: PublishStatus;
}

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin/sites')
@UseGuards(AdminTokenGuard)
export class AdminSitesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get()
  list() {
    return this.prisma.site.findMany({ orderBy: { name: 'asc' }, include: { provider: true, regions: true, cities: { select: { id: true, name: true, slug: true, status: true } } } });
  }

  @Post()
  create(@Body() body: SiteBody, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.create({ data: body });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: site.id,
        entityType: 'SITE',
        entityId: site.id,
        action: 'CREATE',
        snapshot: site as unknown as Record<string, unknown>,
        changedFields: Object.keys(body),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...site, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<SiteBody>, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.site.findUnique({ where: { id } });
      if (!current) throw new BadRequestException('Сайт не найден');
      const site = await transaction.site.update({ where: { id }, data: body });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: site.id,
        entityType: 'SITE',
        entityId: site.id,
        action: 'UPDATE',
        previousSnapshot: current as unknown as Record<string, unknown>,
        snapshot: site as unknown as Record<string, unknown>,
        changedFields: Object.keys(body),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...site, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

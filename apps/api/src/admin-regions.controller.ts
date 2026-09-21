import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';

interface RegionBody {
  siteId: string;
  name: string;
  slug: string;
}

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin/regions')
@UseGuards(AdminTokenGuard)
export class AdminRegionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get()
  list() {
    return this.prisma.region.findMany({ orderBy: { name: 'asc' }, include: { site: { select: { id: true, name: true, slug: true } }, cities: { select: { id: true, name: true, slug: true } } } });
  }

  @Post()
  create(@Body() body: RegionBody, @Req() request?: AdminRequest) {
    this.assertCanonicalBody(body);
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const data = { siteId: body.siteId, name: body.name, slug: body.slug };
      const region = await transaction.region.create({ data });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: region.siteId,
        entityType: 'REGION',
        entityId: region.id,
        action: 'CREATE',
        snapshot: region as unknown as Record<string, unknown>,
        changedFields: Object.keys(data),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...region, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<RegionBody>, @Req() request?: AdminRequest) {
    this.assertCanonicalBody(body);
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.region.findUnique({ where: { id } });
      if (!current) throw new BadRequestException('Регион не найден');
      if (body.siteId !== undefined && body.siteId !== current.siteId) {
        throw new BadRequestException('Регион нельзя переносить между сайтами');
      }
      const data = { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.slug !== undefined ? { slug: body.slug } : {}) };
      const region = await transaction.region.update({ where: { id }, data });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: region.siteId,
        entityType: 'REGION',
        entityId: region.id,
        action: 'UPDATE',
        previousSnapshot: current as unknown as Record<string, unknown>,
        snapshot: region as unknown as Record<string, unknown>,
        changedFields: Object.keys(data),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...region, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private assertCanonicalBody(body: Partial<RegionBody>) {
    const legacy = body as Partial<RegionBody> & { phone?: unknown; content?: unknown };
    if (legacy.phone !== undefined || legacy.content !== undefined) throw new BadRequestException('Телефон и content не принадлежат региону');
  }
}

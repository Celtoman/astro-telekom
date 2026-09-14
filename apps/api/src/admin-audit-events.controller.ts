import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '../generated';
import { CursorPageQueryDto, decodeCursor, encodeCursor, pageSize, searchQuery } from './admin-pagination';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';

const AUDIT_ENTITY_TYPES = ['PROVIDER', 'SITE', 'REGION', 'CITY', 'PAGE', 'TARIFF', 'REDIRECT'] as const;
const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'IMPORT', 'UNDO', 'ARCHIVE', 'RESTORE'] as const;

type AuditEntityType = typeof AUDIT_ENTITY_TYPES[number];
type AuditAction = typeof AUDIT_ACTIONS[number];

export class AuditEventListQueryDto extends CursorPageQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  siteId!: string;

  @IsOptional()
  @IsIn(AUDIT_ENTITY_TYPES)
  entityType?: AuditEntityType;

  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction;
}

const auditEventListSelect = {
  id: true,
  siteId: true,
  siteRevision: true,
  entityType: true,
  entityId: true,
  action: true,
  changedFields: true,
  source: true,
  actorId: true,
  createdAt: true,
  actor: { select: { id: true, email: true } },
  site: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.AuditEventSelect;

@Controller('admin/audit-events')
@UseGuards(AdminTokenGuard)
export class AdminAuditEventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: AuditEventListQueryDto) {
    const limit = pageSize(query.limit);
    const cursor = decodeCursor(query.cursor);
    const q = searchQuery(query.q);
    const filters: Prisma.AuditEventWhereInput[] = [{ siteId: query.siteId }];
    if (query.entityType) filters.push({ entityType: query.entityType });
    if (query.action) filters.push({ action: query.action });
    if (q) {
      filters.push({
        OR: [
          { entityId: { contains: q, mode: 'insensitive' } },
          { source: { contains: q, mode: 'insensitive' } },
          { actor: { is: { email: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }
    const filterWhere: Prisma.AuditEventWhereInput = { AND: filters };
    const where: Prisma.AuditEventWhereInput = cursor
      ? {
          AND: [
            filterWhere,
            {
              OR: [
                { createdAt: { lt: cursor.sortValue } },
                { createdAt: cursor.sortValue, id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : filterWhere;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: auditEventListSelect,
      }),
      this.prisma.auditEvent.count({ where: filterWhere }),
    ]);
    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      pageInfo: {
        limit,
        total,
        hasNextPage,
        nextCursor: hasNextPage && last ? encodeCursor(last.createdAt, last.id) : null,
      },
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const event = await this.prisma.auditEvent.findUnique({
      where: { id },
      select: {
        ...auditEventListSelect,
        changes: true,
      },
    });
    if (!event) throw new NotFoundException('Событие истории не найдено');
    return event;
  }
}

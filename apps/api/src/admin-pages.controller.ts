import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RELEASE_ONE_GLOBAL_PAGES } from './public-route-policy';
import { PublicationWorkflowService } from './publication-workflow.service';

type PageType = 'HOME' | 'INTERNET' | 'INTERNET_TV' | 'TV' | 'TARIFF' | 'ADDRESS_CHECK' | 'FAQ'
  | 'COVERAGE' | 'CITIES' | 'PRIVACY' | 'PERSONAL_DATA_CONSENT' | 'COOKIE_POLICY';
type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface PageBody {
  siteId: string;
  cityId: string | null;
  type: PageType;
  title: string;
  slug: string;
  status?: PublishStatus;
  seo?: object;
  content?: object;
}

interface AdminRequest {
  user?: { id: string };
}

const globalPageSlugs = new Map<PageType, string>(RELEASE_ONE_GLOBAL_PAGES.map((page) => [page.type, page.slug]));

function assertPageScope(page: Pick<PageBody, 'type' | 'cityId' | 'slug'>) {
  const expectedSlug = globalPageSlugs.get(page.type);
  const isGlobal = expectedSlug !== undefined;
  if ((isGlobal && page.cityId !== null) || (!isGlobal && !page.cityId)) {
    throw new BadRequestException('Тип и cityId не соответствуют области страницы');
  }
  if (expectedSlug !== undefined && page.slug !== expectedSlug) {
    throw new BadRequestException(`Slug общей страницы не соответствует каноническому маршруту: ${expectedSlug}`);
  }
}

@Controller('admin/pages')
@UseGuards(AdminTokenGuard)
export class AdminPagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  @Get()
  list() {
    return this.prisma.page.findMany({ orderBy: { updatedAt: 'desc' }, include: { city: true } });
  }

  @Post()
  async create(@Body() body: PageBody, @Req() request?: AdminRequest) {
    assertPageScope(body);
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const page = await transaction.page.create({ data: body });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: page.siteId,
        entityType: 'PAGE',
        entityId: page.id,
        action: 'CREATE',
        snapshot: page as unknown as Record<string, unknown>,
        changedFields: Object.keys(body),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...page, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<PageBody>, @Req() request?: AdminRequest) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.page.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Page not found');
      assertPageScope({
        type: body.type ?? current.type,
        cityId: body.cityId === undefined ? current.cityId : body.cityId,
        slug: body.slug ?? current.slug,
      });
      const page = await transaction.page.update({ where: { id }, data: body });
      const action = body.status === 'ARCHIVED' && current.status !== 'ARCHIVED'
        ? 'ARCHIVE'
        : current.status === 'ARCHIVED' && body.status && body.status !== 'ARCHIVED'
          ? 'RESTORE'
          : 'UPDATE';
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: page.siteId,
        entityType: 'PAGE',
        entityId: page.id,
        action,
        previousSnapshot: current as unknown as Record<string, unknown>,
        snapshot: page as unknown as Record<string, unknown>,
        changedFields: Object.keys(body),
        actorId: request?.user?.id,
        source: 'admin',
      });
      return { ...page, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

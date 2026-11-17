import { ADDRESS_PAGE_SLUG } from './address-page-model';
import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  if (page.type === 'HOME' && page.slug !== '') {
    throw new BadRequestException('Городская HOME должна иметь пустой slug');
  }
}

async function assertUniqueCityHome(
  transaction: Prisma.TransactionClient,
  page: Pick<PageBody, 'type' | 'cityId'>,
  excludedId?: string,
) {
  if (page.type !== 'HOME' || !page.cityId) return;
  const existing = await transaction.page.findFirst({
    where: {
      cityId: page.cityId,
      type: 'HOME',
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new ConflictException('Для этого города уже существует страница HOME');
}

function rethrowPageWriteConflict(error: unknown): never {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : null;
  if (code === 'P2002') {
    throw new ConflictException('Страница с такими уникальными параметрами уже существует');
  }
  if (code === 'P2034') {
    throw new ConflictException('Страница была изменена параллельно, повторите запрос');
  }
  throw error;
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
    return this.prisma.page.findMany({ where: { type: { not: 'HOME' } }, orderBy: { updatedAt: 'desc' }, include: { city: true } });
  }

  @Post()
  async create(@Body() body: PageBody, @Req() request?: AdminRequest) {
    if (['ACCOUNT','OFFICIAL_SITE','SPEED_TEST','CITY_SUPPORT'].includes(body.type as string)) throw new BadRequestException('Информационная страница создаётся миграцией и редактируется в своей отдельной форме');
    if (Object.hasOwn(body, 'seo')) throw new BadRequestException('SEO меняется только через SEO-шаблон');
    if (body.type === 'HOME') throw new BadRequestException('Городская HOME создается из общего шаблона вместе с городом');
    assertPageScope(body);
    try {
      return await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        await assertUniqueCityHome(transaction, body);
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
    } catch (error) {
      rethrowPageWriteConflict(error);
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<PageBody>, @Req() request?: AdminRequest) {
    if (Object.hasOwn(body, 'seo')) throw new BadRequestException('SEO меняется только через SEO-шаблон');
    try {
      return await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const current = await transaction.page.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Page not found');
        if (current.type === 'ACCOUNT' || current.type === 'OFFICIAL_SITE' || current.type === 'SPEED_TEST' || ['ACCOUNT','OFFICIAL_SITE','SPEED_TEST','CITY_SUPPORT'].includes(body.type as string)) throw new BadRequestException('Информационная страница редактируется в своей отдельной форме');
        if (current.type === 'ADDRESS_CHECK' && current.slug === ADDRESS_PAGE_SLUG && current.templateId) throw new BadRequestException('Страница проверки подключения редактируется через общий шаблон ADDRESS');
        if (current.type === 'CITY_SUPPORT') throw new BadRequestException('Поддержка редактируется через общий шаблон CITY_SUPPORT');
        if (current.type === 'HOME' || body.type === 'HOME') throw new BadRequestException('Городская HOME редактируется через общий шаблон');
        const nextScope = {
          type: body.type ?? current.type,
          cityId: body.cityId === undefined ? current.cityId : body.cityId,
          slug: body.slug ?? current.slug,
        };
        assertPageScope(nextScope);
        await assertUniqueCityHome(transaction, nextScope, id);
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
    } catch (error) {
      rethrowPageWriteConflict(error);
    }
  }
}

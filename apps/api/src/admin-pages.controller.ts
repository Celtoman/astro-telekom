import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { RELEASE_ONE_GLOBAL_PAGES } from './public-route-policy';

type PageType = 'HOME' | 'INTERNET' | 'INTERNET_TV' | 'TV' | 'TARIFF' | 'ADDRESS_CHECK' | 'FAQ'
  | 'COVERAGE' | 'CITIES' | 'PRIVACY' | 'PERSONAL_DATA_CONSENT';
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
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

  @Get()
  list() {
    return this.prisma.page.findMany({ orderBy: { updatedAt: 'desc' }, include: { city: true } });
  }

  @Post()
  async create(@Body() body: PageBody) {
    assertPageScope(body);
    const page = await this.prisma.page.create({ data: body });
    await this.rebuild.enqueue({ entity: 'page', id: page.id, siteId: page.siteId });
    return page;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<PageBody>) {
    const current = await this.prisma.page.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Page not found');
    assertPageScope({
      type: body.type ?? current.type,
      cityId: body.cityId === undefined ? current.cityId : body.cityId,
      slug: body.slug ?? current.slug,
    });
    const page = await this.prisma.page.update({ where: { id }, data: body });
    await this.rebuild.enqueue({ entity: 'page', id: page.id, siteId: page.siteId });
    return page;
  }
}

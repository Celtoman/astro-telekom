import { BadRequestException, ConflictException, Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Prisma } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { SiteValuesService } from './site-values.service';
import { validateFirstScreen } from './first-screen';
import { homeHeroDefaults, HOME_HERO_VERSION, HOME_HERO_IMPLEMENTATION, plainRedTitle } from './home-hero-model';
import type { AuthUser } from './auth.service';
import { readWorkingPreviewQuery } from './admin-route-pagination';

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
    private readonly values: SiteValuesService,
  ) {}

  @Get()
  list(@Query('summary') summary?: string) {
    if (summary === 'true') return this.prisma.site.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true, workingRevision: true, publishedRevision: true } });
    return this.prisma.site.findMany({ orderBy: { name: 'asc' }, include: { provider: true, regions: true, cities: { select: { id: true, name: true, slug: true, status: true } } } });
  }

  @Get('preview-bootstrap')
  @Header('Cache-Control', 'private, no-store')
  async previewBootstrap(@Req() request: { user?: AuthUser }, @Query('siteId') siteId?: string, @Query('preferred') preferred?: string) {
    const user = request.user;
    if (!user) throw new UnauthorizedException();
    const sites = await this.list('true');
    const site = sites.find(candidate => candidate.id === siteId) ?? (sites.length === 1 ? sites[0] : null);
    const selectedSiteId = site?.id ?? null;
    if (!site) return { user, sites, selectedSiteId, options: null };

    try {
      const options = await this.publications.getWorkingPreviewOptions(site.id, readWorkingPreviewQuery(undefined, undefined, preferred));
      return { user, sites, selectedSiteId, options };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Let the existing options read report its own error without hiding the site picker.
      return { user, sites, selectedSiteId, options: null };
    }
  }

  @Get('values')
  listValues() { return this.values.list(); }

  @Get('editorial-context')
  async editorialContext() {
    const slug=process.env.PUBLIC_SITE_SLUG?.trim()||'domru-site';
    const site=await this.prisma.site.findUnique({where:{slug},select:{id:true,name:true,slug:true}});
    if(!site)throw new ConflictException('Сайт Дом.ру не настроен. Проверьте PUBLIC_SITE_SLUG на сервере.');
    return site;
  }

  @Post()
  create(@Body() body: SiteBody, @Req() request?: AdminRequest) {
    const hero = homeHeroDefaults(body.name);
    validateFirstScreen('HOME', hero, false, HOME_HERO_VERSION);
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.create({ data: { ...body, pageTemplates: { create: {
        kind: 'HOME', titleTemplate: plainRedTitle(hero.title), status: 'PUBLISHED',
        content: { firstScreenPassportVersion: HOME_HERO_VERSION, firstScreenImplementationVersion: HOME_HERO_IMPLEMENTATION },
        blocks: { create: { blockType: 'home.hero', position: 10, visible: true, data: hero, source: 'first-screen:init' } },
      } } } });
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

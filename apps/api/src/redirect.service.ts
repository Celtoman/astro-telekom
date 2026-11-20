import { ADDRESS_PAGE_SLUG } from './address-page-model';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublishStatus } from '../generated';
import { PrismaService } from './prisma.service';
import { releaseOnePaths } from './public-route-policy';
import { PublicationWorkflowService } from './publication-workflow.service';
import { normalizeRedirectPath } from './redirect-path';
import { servingRedirectProjection } from './serving-publication-context';

export { normalizeRedirectPath } from './redirect-path';

type RedirectInput = {
  siteId: string;
  cityId?: string | null;
  sourcePath: string;
  targetPath: string;
  status?: PublishStatus;
};

type RedirectUpdate = Partial<Omit<RedirectInput, 'siteId'>>;
type Transaction = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RedirectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  list(siteId?: string) {
    return this.prisma.redirect.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { updatedAt: 'desc' },
      include: {
        site: { select: { id: true, name: true, slug: true } },
        city: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async create(body: RedirectInput, actorId?: string) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const candidate = await this.prepareCandidate(transaction, body);
      const redirect = await transaction.redirect.create({ data: candidate });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: redirect.siteId,
        entityType: 'REDIRECT',
        entityId: redirect.id,
        action: 'CREATE',
        snapshot: redirect as unknown as Record<string, unknown>,
        changedFields: Object.keys(candidate).sort(),
        actorId,
        source: 'admin',
      });
      return { ...redirect, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(id: string, body: RedirectUpdate, actorId?: string) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.redirect.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Redirect not found');
      if(current.managedEditorialKey)throw new ConflictException('Этот адрес управляется разделом новостей. Измените адрес статьи или категории в её редакторе.');
      const candidate = await this.prepareCandidate(transaction, {
        siteId: current.siteId,
        cityId: body.cityId === undefined ? current.cityId : body.cityId,
        sourcePath: body.sourcePath ?? current.sourcePath,
        targetPath: body.targetPath ?? current.targetPath,
        status: body.status ?? current.status,
      }, id);
      const redirect = await transaction.redirect.update({ where: { id }, data: candidate });
      const action = body.status === PublishStatus.ARCHIVED && current.status !== PublishStatus.ARCHIVED
        ? 'ARCHIVE'
        : current.status === PublishStatus.ARCHIVED && body.status && body.status !== PublishStatus.ARCHIVED
          ? 'RESTORE'
          : 'UPDATE';
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: redirect.siteId,
        entityType: 'REDIRECT',
        entityId: redirect.id,
        action,
        previousSnapshot: current as unknown as Record<string, unknown>,
        snapshot: redirect as unknown as Record<string, unknown>,
        changedFields: Object.keys(body).sort(),
        actorId,
        source: 'admin',
      });
      return { ...redirect, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async archive(id: string, actorId?: string) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.redirect.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Redirect not found');
      if(current.managedEditorialKey)throw new ConflictException('Этот адрес управляется разделом новостей и обновляется вместе с публикацией.');
      const redirect = await transaction.redirect.update({ where: { id }, data: { status: PublishStatus.ARCHIVED } });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: redirect.siteId,
        entityType: 'REDIRECT',
        entityId: redirect.id,
        action: current.status === PublishStatus.ARCHIVED ? 'UPDATE' : 'ARCHIVE',
        previousSnapshot: current as unknown as Record<string, unknown>,
        snapshot: redirect as unknown as Record<string, unknown>,
        changedFields: ['status'],
        actorId,
        source: 'admin',
      });
      return { ...redirect, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolvePublished(siteSlug: string, id: string) {
    const projection = await servingRedirectProjection(this.prisma, siteSlug, id);
    if (projection && !projection.data) throw new NotFoundException('Redirect not found');
    const stored = projection?.data && 'redirect' in projection.data ? projection.data : null;
    const catalog = !projection ? await this.publications.getPublishedCatalog(siteSlug)
      : projection.data && 'catalog' in projection.data ? projection.data.catalog : null;
    const redirects = Array.isArray(catalog?.redirects) ? catalog.redirects as Array<Record<string, unknown>> : [];
    const redirect = stored?.redirect ?? redirects.find(item => item.id === id && item.status === PublishStatus.PUBLISHED);
    if (!redirect) throw new NotFoundException('Redirect not found');
    const sourcePath = normalizeRedirectPath(redirect.sourcePath, 'sourcePath');
    const targetPath = normalizeRedirectPath(redirect.targetPath, 'targetPath');
    if (stored) {
      if (!stored.routeAllowed) throw new NotFoundException('Redirect not found');
    } else {
      const routes = Array.isArray(catalog?.routes) ? catalog.routes as Array<Record<string, unknown>> : [];
      const publishedPaths = new Set(routes.map(route => String(route.path || '')));
      if (publishedPaths.has(sourcePath) || !publishedPaths.has(targetPath)) throw new NotFoundException('Redirect not found');
    }
    const updated = await this.prisma.redirect.updateMany({
      where: { id },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    });
    if (updated.count !== 1) throw new NotFoundException('Redirect not found');
    return targetPath;
  }

  private async prepareCandidate(transaction: Transaction, body: RedirectInput, currentId?: string) {
    if (!body.siteId) throw new BadRequestException('siteId обязателен');
    const status = body.status ?? PublishStatus.PUBLISHED;
    if (![PublishStatus.DRAFT, PublishStatus.PUBLISHED, PublishStatus.ARCHIVED].includes(status)) {
      throw new BadRequestException('Некорректный статус redirect');
    }
    const sourcePath = normalizeRedirectPath(body.sourcePath, 'sourcePath');
    const targetPath = normalizeRedirectPath(body.targetPath, 'targetPath');
    if (sourcePath === targetPath) throw new BadRequestException('sourcePath и targetPath должны отличаться');

    const site = await transaction.site.findUnique({ where: { id: body.siteId }, select: { id: true,slug:true } });
    if (!site) throw new BadRequestException('Сайт не найден');
    if (body.cityId) {
      const city = await transaction.city.findUnique({ where: { id: body.cityId }, select: { siteId: true } });
      if (!city || city.siteId !== body.siteId) throw new BadRequestException('Город не принадлежит выбранному сайту');
    }

    const occupiedCandidates = [...new Set([sourcePath, `${sourcePath}/`])];
    const occupied = (await Promise.all(occupiedCandidates.map((candidatePath) => transaction.redirect.findUnique({
      where: { siteId_sourcePath: { siteId: body.siteId, sourcePath: candidatePath } },
      select: { id: true },
    })))).find((candidate) => candidate && candidate.id !== currentId);
    if (occupied) throw new ConflictException(`Redirect для ${sourcePath} уже существует`);

    if (status === PublishStatus.PUBLISHED) {
      await this.assertPublishedPolicy(transaction, body.siteId, sourcePath, targetPath,site.slug, currentId);
    }
    return { siteId: body.siteId, cityId: body.cityId || null, sourcePath, targetPath, status };
  }

  private async assertPublishedPolicy(transaction: Transaction, siteId: string, sourcePath: string, targetPath: string,siteSlug:string, currentId?: string) {
    const [cities, globalPages, redirects] = await Promise.all([
      transaction.city.findMany({
        where: { siteId, status: PublishStatus.PUBLISHED },
        select: {
          slug: true,
          pages: { where: { type: 'ADDRESS_CHECK', slug: ADDRESS_PAGE_SLUG, status: PublishStatus.PUBLISHED }, select: { type: true, slug: true } },
          tariffs: { where: { status: PublishStatus.PUBLISHED, availability: 'ACTIVE' }, select: { slug: true } },
        },
      }),
      transaction.page.findMany({
        where: { siteId, cityId: null, status: PublishStatus.PUBLISHED },
        select: { type: true, slug: true },
      }),
      transaction.redirect.findMany({
        where: { siteId, status: PublishStatus.PUBLISHED, ...(currentId ? { id: { not: currentId } } : {}) },
        select: { id: true, sourcePath: true, targetPath: true },
      }),
    ]);
    let publishedPaths: Set<string>;
    try {
      publishedPaths = releaseOnePaths(cities, globalPages, { addressCheck: cities.some(city => city.pages?.some(page => page.slug === ADDRESS_PAGE_SLUG)) });
    } catch (error) {
      throw new ConflictException(`Release 1 route inventory не готов: ${(error as Error).message}`);
    }
    if(sourcePath.startsWith('/news')||targetPath.startsWith('/news')){
      const published=await this.publications.getPublishedCatalog(siteSlug);
      for(const route of (published.routes??[]) as Array<{kind:string;path:string}>)if(['NEWS_LIST','NEWS_ARTICLE','NEWS_CATEGORY'].includes(route.kind))publishedPaths.add(route.path);
    }
    if (publishedPaths.has(sourcePath)) throw new ConflictException(`sourcePath ${sourcePath} занят опубликованным ресурсом`);
    if (redirects.some((redirect) => (
      normalizeRedirectPath(redirect.sourcePath, 'sourcePath') === targetPath
      || normalizeRedirectPath(redirect.targetPath, 'targetPath') === sourcePath
    ))) {
      throw new ConflictException('Цепочки redirects запрещены: переход должен вести сразу на опубликованный ресурс');
    }
    if (!publishedPaths.has(targetPath)) throw new ConflictException(`targetPath ${targetPath} не является опубликованным ресурсом`);
  }
}

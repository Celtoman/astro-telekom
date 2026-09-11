import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PublishStatus } from '../generated';
import { PrismaService } from './prisma.service';
import { RebuildQueueService } from './rebuild-queue.service';

type RedirectInput = {
  siteId: string;
  cityId?: string | null;
  sourcePath: string;
  targetPath: string;
  status?: PublishStatus;
};

type RedirectUpdate = Partial<Omit<RedirectInput, 'siteId'>>;

const safePathPattern = /^\/[a-z0-9._~/-]*$/;

export function normalizeRedirectPath(value: unknown, field: 'sourcePath' | 'targetPath') {
  if (typeof value !== 'string' || !value.trim().startsWith('/')) {
    throw new BadRequestException(`${field} должен быть внутренним путем от корня сайта`);
  }
  let path = value.trim();
  if (!safePathPattern.test(path) || path.includes('//') || path.includes('..')) {
    throw new BadRequestException(`${field} содержит недопустимые символы`);
  }
  if (path !== '/') path = path.replace(/\/+$/, '');
  if (field === 'sourcePath' && path === '/') throw new BadRequestException('Корневой URL нельзя использовать как sourcePath');
  return path;
}

@Injectable()
export class RedirectService {
  constructor(private readonly prisma: PrismaService, private readonly rebuild: RebuildQueueService) {}

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

  async create(body: RedirectInput) {
    const candidate = await this.prepareCandidate(body);
    const redirect = await this.prisma.redirect.create({ data: candidate });
    await this.rebuild.enqueue({ entity: 'redirect', id: redirect.id, siteId: redirect.siteId });
    return redirect;
  }

  async update(id: string, body: RedirectUpdate) {
    const current = await this.prisma.redirect.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Redirect not found');
    const candidate = await this.prepareCandidate({
      siteId: current.siteId,
      cityId: body.cityId === undefined ? current.cityId : body.cityId,
      sourcePath: body.sourcePath ?? current.sourcePath,
      targetPath: body.targetPath ?? current.targetPath,
      status: body.status ?? current.status,
    }, id);
    const redirect = await this.prisma.redirect.update({ where: { id }, data: candidate });
    await this.rebuild.enqueue({ entity: 'redirect', id: redirect.id, siteId: redirect.siteId });
    return redirect;
  }

  async archive(id: string) {
    const current = await this.prisma.redirect.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Redirect not found');
    const redirect = await this.prisma.redirect.update({ where: { id }, data: { status: PublishStatus.ARCHIVED } });
    await this.rebuild.enqueue({ entity: 'redirect', id: redirect.id, siteId: redirect.siteId });
    return redirect;
  }

  async resolvePublished(siteSlug: string, id: string) {
    const where = { id, status: PublishStatus.PUBLISHED, site: { slug: siteSlug, status: PublishStatus.PUBLISHED } };
    const redirect = await this.prisma.redirect.findFirst({ where, select: { siteId: true, sourcePath: true, targetPath: true } });
    if (!redirect) throw new NotFoundException('Redirect not found');
    const sourcePath = normalizeRedirectPath(redirect.sourcePath, 'sourcePath');
    const targetPath = normalizeRedirectPath(redirect.targetPath, 'targetPath');
    const cities = await this.prisma.city.findMany({
      where: { siteId: redirect.siteId, status: PublishStatus.PUBLISHED },
      select: {
        slug: true,
        pages: { where: { status: PublishStatus.PUBLISHED }, select: { type: true, slug: true } },
        tariffs: { where: { status: PublishStatus.PUBLISHED }, select: { slug: true } },
      },
    });
    const publishedPaths = this.publishedPaths(cities);
    if (publishedPaths.has(sourcePath) || !publishedPaths.has(targetPath)) throw new NotFoundException('Redirect not found');
    const updated = await this.prisma.redirect.updateMany({
      where,
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    });
    if (updated.count !== 1) throw new NotFoundException('Redirect not found');
    return targetPath;
  }

  private async prepareCandidate(body: RedirectInput, currentId?: string) {
    if (!body.siteId) throw new BadRequestException('siteId обязателен');
    const status = body.status ?? PublishStatus.PUBLISHED;
    if (![PublishStatus.DRAFT, PublishStatus.PUBLISHED, PublishStatus.ARCHIVED].includes(status)) {
      throw new BadRequestException('Некорректный статус redirect');
    }
    const sourcePath = normalizeRedirectPath(body.sourcePath, 'sourcePath');
    const targetPath = normalizeRedirectPath(body.targetPath, 'targetPath');
    if (sourcePath === targetPath) throw new BadRequestException('sourcePath и targetPath должны отличаться');

    const site = await this.prisma.site.findUnique({ where: { id: body.siteId }, select: { id: true } });
    if (!site) throw new BadRequestException('Сайт не найден');
    if (body.cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: body.cityId }, select: { siteId: true } });
      if (!city || city.siteId !== body.siteId) throw new BadRequestException('Город не принадлежит выбранному сайту');
    }

    const occupiedCandidates = [...new Set([sourcePath, `${sourcePath}/`])];
    const occupied = (await Promise.all(occupiedCandidates.map((candidatePath) => this.prisma.redirect.findUnique({
      where: { siteId_sourcePath: { siteId: body.siteId, sourcePath: candidatePath } },
      select: { id: true },
    })))).find((candidate) => candidate && candidate.id !== currentId);
    if (occupied) throw new ConflictException(`Redirect для ${sourcePath} уже существует`);

    if (status === PublishStatus.PUBLISHED) {
      await this.assertPublishedPolicy(body.siteId, sourcePath, targetPath, currentId);
    }
    return { siteId: body.siteId, cityId: body.cityId || null, sourcePath, targetPath, status };
  }

  private async assertPublishedPolicy(siteId: string, sourcePath: string, targetPath: string, currentId?: string) {
    const [cities, redirects] = await Promise.all([
      this.prisma.city.findMany({
        where: { siteId, status: PublishStatus.PUBLISHED },
        select: {
          slug: true,
          pages: { where: { status: PublishStatus.PUBLISHED }, select: { type: true, slug: true } },
          tariffs: { where: { status: PublishStatus.PUBLISHED }, select: { slug: true } },
        },
      }),
      this.prisma.redirect.findMany({
        where: { siteId, status: PublishStatus.PUBLISHED, ...(currentId ? { id: { not: currentId } } : {}) },
        select: { id: true, sourcePath: true, targetPath: true },
      }),
    ]);
    const publishedPaths = this.publishedPaths(cities);
    if (publishedPaths.has(sourcePath)) throw new ConflictException(`sourcePath ${sourcePath} занят опубликованным ресурсом`);
    if (redirects.some((redirect) => (
      normalizeRedirectPath(redirect.sourcePath, 'sourcePath') === targetPath
      || normalizeRedirectPath(redirect.targetPath, 'targetPath') === sourcePath
    ))) {
      throw new ConflictException('Цепочки redirects запрещены: переход должен вести сразу на опубликованный ресурс');
    }
    if (!publishedPaths.has(targetPath)) throw new ConflictException(`targetPath ${targetPath} не является опубликованным ресурсом`);
  }

  private publishedPaths(cities: Array<{ slug: string; pages: Array<{ type: string; slug: string }>; tariffs: Array<{ slug: string }> }>) {
    const publishedPaths = new Set(['/']);
    for (const city of cities) {
      const cityPath = `/${city.slug}`;
      publishedPaths.add(cityPath);
      for (const page of city.pages) if (page.type !== 'HOME' && page.type !== 'TARIFF') publishedPaths.add(`${cityPath}/${page.slug}`);
      for (const tariff of city.tariffs) publishedPaths.add(`${cityPath}/${tariff.slug}`);
    }
    return publishedPaths;
  }
}

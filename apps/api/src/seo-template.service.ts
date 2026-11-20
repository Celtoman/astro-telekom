import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, SeoIndexState, SeoTemplateKind } from '../generated';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { resolveSocialImage } from './seo-templates';
import { readPublishedSeoDetail } from './published-seo-detail';
import { ADMIN_ROUTE_PAGE_SIZE } from './admin-route-pagination';
import { resolveVariableText } from './variable-registry';

export interface UpdateSeoTemplateInput {
  expectedWorkingRevision: number;
  titleTemplate: string;
  descriptionTemplate: string;
  indexState: SeoIndexState;
  ogTitleTemplate?: string | null;
  ogDescriptionTemplate?: string | null;
  ogImageUrl?: string | null;
  confirmNoindexCount?: number;
}

const SEO_REVIEW_TTL_MS = 5 * 60_000;
const SEO_REVIEW_MAX_REPORTS = 4;
const SEO_REVIEW_MAX_WEIGHT = 16 * 1024 * 1024;
const REVIEW_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

type ReviewInput = {
  workingRevision: number;
  kind: string;
  page: number;
  path?: string;
  publishedPublicationId?: string;
  startReview?: boolean;
  reviewId?: string;
};
type RouteWarning = { path: string };
type RouteMeta = { working: unknown; warnings: RouteWarning[] };
type PublishedStamp = { id: string; catalogGeneration: number } | null;
const samePublishedStamp = (left: PublishedStamp, right: PublishedStamp) =>
  (left?.id ?? null) === (right?.id ?? null) && (left?.catalogGeneration ?? null) === (right?.catalogGeneration ?? null);
type SeoReview = {
  siteId: string;
  workingRevision: number;
  kind: string;
  paths: string[];
  details: Map<string, RouteMeta>;
  published: PublishedStamp;
  expiresAt: number;
  weight: number;
};

@Injectable()
export class SeoTemplateService {
  private readonly reviews = new Map<string, SeoReview>();
  private reviewWeight = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  private async readSettings(siteId: string, client: Prisma.TransactionClient) {
    const site = await client.site.findUnique({
      where: { id: siteId },
      select: { id: true, slug: true, workingRevision: true, publishedRevision: true },
    });
    if (!site) throw new NotFoundException('Сайт не найден');
    const templates = await client.seoTemplate.findMany({ where: { siteId }, orderBy: { kind: 'asc' } });
    return { ...site, templates };
  }

  async get(siteId: string) {
    const { templates, ...site } = await this.readSettings(siteId, this.prisma);
    let workingByPath: Record<string, unknown> | null = null;
    let workingWarnings: unknown[] = [];
    let routes: unknown[] = [];
    let workingError: string | null = null;
    try {
      const preview = await this.publications.getWorkingPreview(siteId);
      workingByPath = preview.catalog.seoByPath as Record<string, unknown> || null;
      workingWarnings = preview.catalog.seoWarnings as unknown[] || [];
      routes = preview.catalog.routes as unknown[] || [];
    } catch (error) {
      workingError = error instanceof Error ? error.message : 'Рабочий просмотр недоступен';
    }
    let publishedByPath: Record<string, unknown> | null = null;
    try {
      const catalog = await this.publications.getPublishedCatalog(site.slug);
      publishedByPath = catalog.seoByPath as Record<string, unknown> || null;
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    return { ...site, templates, routes, workingByPath, workingWarnings, workingError, publishedByPath };
  }


  getSettings(siteId: string) {
    return this.prisma.$transaction(tx => this.readSettings(siteId, tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private removeReview(id: string, review: SeoReview) {
    this.reviews.delete(id);
    this.reviewWeight -= review.weight;
  }

  private rememberReview(
    siteId: string, input: ReviewInput, paths: string[],
    metadata: Record<string, unknown>, warnings: RouteWarning[], published: PublishedStamp,
  ) {
    const details = new Map<string, RouteMeta>(paths.map(path => [path, { working: metadata[path] ?? null, warnings: [] }]));
    for (const warning of warnings) details.get(warning.path)?.warnings.push(warning);
    // Budget UTF-16 data and per-entry overhead in addition to the report count.
    let weight = 0;
    for (const [path, detail] of details) {
      weight += 256 + (path.length + JSON.stringify(detail).length) * 2;
      if (weight > SEO_REVIEW_MAX_WEIGHT) return undefined;
    }
    const now = Date.now();
    for (const [id, review] of this.reviews) {
      if (review.expiresAt <= now || this.reviews.size >= SEO_REVIEW_MAX_REPORTS || this.reviewWeight + weight > SEO_REVIEW_MAX_WEIGHT) {
        this.removeReview(id, review);
      }
    }
    const reviewId = randomUUID();
    this.reviews.set(reviewId, { siteId, workingRevision: input.workingRevision, kind: input.kind, paths, details,
      published, expiresAt: now + SEO_REVIEW_TTL_MS, weight });
    this.reviewWeight += weight;
    return reviewId;
  }

  async review(siteId: string, input: ReviewInput) {
    if (!Object.values(SeoTemplateKind).includes(input.kind as SeoTemplateKind)) throw new BadRequestException('Неизвестный тип SEO-шаблона');
    if (input.path !== undefined && (typeof input.path !== 'string' || !input.path.startsWith('/') || input.path.length > 2048)) {
      throw new BadRequestException('Укажите канонический путь URL');
    }
    if (input.publishedPublicationId !== undefined &&
      (typeof input.publishedPublicationId !== 'string' || !/^[a-zA-Z0-9_-]{0,200}$/.test(input.publishedPublicationId))) {
      throw new BadRequestException('Укажите идентификатор опубликованного снимка');
    }
    if (input.reviewId !== undefined && (input.startReview || typeof input.reviewId !== 'string' || !REVIEW_ID.test(input.reviewId))) {
      throw new BadRequestException('Укажите идентификатор проверки маршрутов');
    }
    const currentSite = () => this.prisma.site.findUnique({
      where: { id: siteId }, select: { id: true, slug: true, workingRevision: true },
    });
    const site = await currentSite();
    if (!site) throw new NotFoundException('Сайт не найден');
    const stale = () => new ConflictException('Рабочая ревизия изменилась; обновите SEO-шаблоны');
    if (site.workingRevision !== input.workingRevision) throw stale();

    let report: SeoReview | undefined;
    if (input.reviewId !== undefined) {
      report = this.reviews.get(input.reviewId);
      if (report && report.expiresAt <= Date.now()) {
        this.removeReview(input.reviewId, report);
        report = undefined;
      }
      if (!report || report.siteId !== siteId || report.kind !== input.kind || report.workingRevision !== site.workingRevision) {
        throw new ConflictException('Проверка маршрутов устарела или недоступна. Нажмите «Проверить маршруты» ещё раз.');
      }
    }

    const readPublished = (path: string | null) => readPublishedSeoDetail(this.prisma, site.slug, path).catch(error => {
      if (error instanceof NotFoundException) return null;
      throw error;
    });
    const publishedBefore = input.startReview
      ? await readPublished(null).then(value => ({ value }), error => ({ error }))
      : null;

    let working: Awaited<ReturnType<PublicationWorkflowService['getWorkingPreview']>> | null = null;
    let workingError: string | null = null;
    if (!report) {
      try {
        working = await this.publications.getWorkingPreview(siteId, 'SEO');
      } catch (error) {
        if ((await currentSite())?.workingRevision !== input.workingRevision) throw stale();
        workingError = error instanceof Error ? error.message : 'Рабочий просмотр недоступен';
      }
      if (working && working.workingRevision !== input.workingRevision) throw stale();
    }

    const paths = report?.paths ?? ((working?.catalog.routes ?? []) as Array<{ id: string; path: string }>)
      .filter(route => route.id === input.kind).map(route => route.path);
    const offset = (input.page - 1) * ADMIN_ROUTE_PAGE_SIZE;
    const page = paths.slice(offset, offset + ADMIN_ROUTE_PAGE_SIZE);
    if (input.path && !(report ? report.details.has(input.path) : paths.includes(input.path)) && !workingError) {
      throw new NotFoundException('URL не относится к текущему типу SEO-шаблона');
    }
    const requested = !workingError ? input.path : undefined;
    const path = requested ?? page[0] ?? null;
    const workingWarnings = (working?.catalog.seoWarnings ?? []) as RouteWarning[];
    const atPath = (metadata: unknown) => path && metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)[path] ?? null : null;
    let published: { id: string; metadata: unknown; catalogGeneration?: number } | null = null;
    if (report || path) {
      try {
        if (input.startReview || report) published = await readPublished(path);
        else {
          const snapshot = await this.publications.getPublishedSnapshot(site.slug);
          published = { id: snapshot.id, metadata: atPath(snapshot.catalog.seoByPath) };
        }
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    if (path && publishedBefore && 'error' in publishedBefore) throw publishedBefore.error;
    const stamp = published && published.catalogGeneration !== undefined
      ? { id: published.id, catalogGeneration: published.catalogGeneration } : null;
    if ((report && !samePublishedStamp(report.published, stamp))
      || (publishedBefore && 'value' in publishedBefore && path && !samePublishedStamp(publishedBefore.value ?? null, stamp))
      || (path && input.publishedPublicationId !== undefined && (published?.id ?? '') !== input.publishedPublicationId)) {
      throw new ConflictException('Опубликованный снимок изменился; проверьте маршруты заново');
    }
    if ((input.startReview || report) && (await currentSite())?.workingRevision !== input.workingRevision) throw stale();
    const workingMetadata = (working?.catalog.seoByPath ?? {}) as Record<string, unknown>;
    const reviewId = input.reviewId ?? (input.startReview && path && !workingError
      ? this.rememberReview(siteId, input, paths, workingMetadata, workingWarnings, stamp) : undefined);
    const cachedDetail = path ? report?.details.get(path) : undefined;
    return {
      workingRevision: input.workingRevision,
      workingError,
      page: input.page,
      pageSize: ADMIN_ROUTE_PAGE_SIZE,
      total: paths.length,
      routes: page,
      detail: path ? {
        path,
        working: cachedDetail?.working ?? atPath(workingMetadata),
        published: published?.metadata ?? null,
        publishedPublicationId: published?.id ?? null,
        warnings: cachedDetail?.warnings ?? workingWarnings.filter(warning => warning.path === path),
      } : null,
      ...(reviewId ? { reviewId } : {}),
    };
  }

  async update(siteId: string, kind: string, input: UpdateSeoTemplateInput, actorId?: string | null) {
    if (!Object.values(SeoTemplateKind).includes(kind as SeoTemplateKind)) throw new BadRequestException('Неизвестный тип SEO-шаблона');
    if (!Object.values(SeoIndexState).includes(input.indexState)) throw new BadRequestException('Неизвестное состояние индексации');
    if (!Number.isInteger(input.expectedWorkingRevision) || input.expectedWorkingRevision < 0) throw new BadRequestException('Передайте актуальную рабочую ревизию сайта');
    for (const [field, value] of [['Title', input.titleTemplate], ['Description', input.descriptionTemplate]] as const) {
      if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw new BadRequestException(`${field} должен содержать от 1 до 1000 символов`);
    }
    for (const [field, value] of [['OG Title', input.ogTitleTemplate], ['OG Description', input.ogDescriptionTemplate]] as const) {
      if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > 1000)) {
        throw new BadRequestException(`${field} должен содержать не более 1000 символов`);
      }
    }
    if (input.ogImageUrl !== undefined && input.ogImageUrl !== null &&
      (typeof input.ogImageUrl !== 'string' || input.ogImageUrl.length > 2048)) {
      throw new BadRequestException('OG image URL должен содержать не более 2048 символов');
    }
    if (input.ogImageUrl?.trim()) resolveSocialImage(input.ogImageUrl, 'seo.ogImage');
    for (const field of ['titleTemplate', 'descriptionTemplate', 'ogTitleTemplate', 'ogDescriptionTemplate'] as const) {
      const value = input[field];
      if (typeof value === 'string' && value.trim()) {
        resolveVariableText(value, { now: new Date() }, { path: `SeoTemplate.${field}`, field: 'TEXT' });
      }
    }
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const site = await transaction.site.findUnique({ where: { id: siteId }, select: { id: true, workingRevision: true, publishedRevision: true } });
      if (!site) throw new NotFoundException('Сайт не найден');
      if (site.workingRevision !== input.expectedWorkingRevision) throw new ConflictException('Рабочая ревизия изменилась; обновите SEO-шаблон');
      const current = await transaction.seoTemplate.findUnique({ where: { siteId_kind: { siteId, kind: kind as SeoTemplateKind } } });
      if (!current) throw new NotFoundException('SEO-шаблон не найден');
      if (current.indexState !== 'NOINDEX' && input.indexState === 'NOINDEX') {
        const preview = await this.publications.getWorkingPreview(siteId);
        if (preview.workingRevision !== site.workingRevision) throw new ConflictException('Рабочая ревизия изменилась; обновите SEO-шаблон');
        const affectedCount = (preview.catalog.routes as Array<{ id: string }>).filter((route) => route.id === kind).length;
        if (!affectedCount || input.confirmNoindexCount !== affectedCount) {
          throw new BadRequestException(`Изменение переведет ${affectedCount} URL в noindex; требуется отдельное подтверждение точного количества`);
        }
      }
      const next = {
        titleTemplate: input.titleTemplate.trim(),
        descriptionTemplate: input.descriptionTemplate.trim(),
        indexState: input.indexState,
        ogTitleTemplate: input.ogTitleTemplate === undefined ? current.ogTitleTemplate : input.ogTitleTemplate?.trim() || null,
        ogDescriptionTemplate: input.ogDescriptionTemplate === undefined ? current.ogDescriptionTemplate : input.ogDescriptionTemplate?.trim() || null,
        ogImageUrl: input.ogImageUrl === undefined ? current.ogImageUrl : input.ogImageUrl?.trim() || null,
      };
      const changedFields = (Object.keys(next) as Array<keyof typeof next>).filter((field) => current[field] !== next[field]);
      if (changedFields.length === 0) return { ...current, workingRevision: site.workingRevision, publishedRevision: site.publishedRevision };
      const updated = await transaction.seoTemplate.update({ where: { id: current.id }, data: next });
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId,
        entityType: 'SITE',
        entityId: siteId,
        action: 'UPDATE',
        previousSnapshot: { seoTemplate: current },
        snapshot: { seoTemplate: updated },
        changedFields: ['seoTemplate'],
        actorId,
        source: 'admin-seo-templates',
      });
      return { ...updated, workingRevision: revision.siteRevision, publishedRevision: site.publishedRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SeoIndexState, SeoTemplateKind } from '../generated';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { resolveSocialImage } from './seo-templates';
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

@Injectable()
export class SeoTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  async get(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, slug: true, workingRevision: true, publishedRevision: true },
    });
    if (!site) throw new NotFoundException('Сайт не найден');
    const templates = await this.prisma.seoTemplate.findMany({ where: { siteId }, orderBy: { kind: 'asc' } });
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

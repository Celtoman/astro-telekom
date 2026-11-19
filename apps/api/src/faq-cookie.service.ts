import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { APP_VERSION } from './app-version';
import { editorialDigest } from './editorial-revisions';
import { editorialServingSource } from './editorial-serving-source';
import { readCookieNotice, validateCookieNotice, validateFaqPage } from './faq-cookie-validation';
import { FAQ_SEO, FAQ_SLUG } from './faq-page-model';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { validatePublicationSource } from './publication-validation';
import { RebuildQueueService } from './rebuild-queue.service';
import { SiteCatalogService, type CatalogSource } from './site-catalog.service';

type Scope = 'FAQ' | 'COOKIE_NOTICE';
type Tx = Prisma.TransactionClient;
const faqWhere = { type: 'FAQ', cityId: null, slug: FAQ_SLUG } as const;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const settingsObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function parseScopes(raw: unknown): Scope[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 2 || new Set(raw).size !== raw.length ||
      raw.some(scope => scope !== 'FAQ' && scope !== 'COOKIE_NOTICE')) {
    throw new BadRequestException('Выберите FAQ, уведомление cookie или оба изменения.');
  }
  return [...raw].sort();
}

function operationKey(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new BadRequestException('Укажите идентификатор операции.');
  return 'faq-cookie:' + id;
}

@Injectable()
export class FaqCookieService {
  constructor(
    private readonly db: PrismaService,
    private readonly workflow: PublicationWorkflowService,
    private readonly catalog: SiteCatalogService,
    private readonly queue: RebuildQueueService,
  ) {}

  async get(siteId: string, scope: Scope) {
    return this.db.$transaction(async tx => {
      const site = await tx.site.findUnique({ where: { id: siteId } });
      if (!site) throw new NotFoundException('Сайт не найден.');
      const content = scope === 'FAQ'
        ? (await tx.page.findFirst({ where: { ...faqWhere, siteId } }))?.content
        : readCookieNotice(site.settings);
      return { content: content ?? null, workingRevision: site.workingRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async save(siteId: string, scope: Scope, content: unknown, expectedRevision: number, actorId?: string) {
    if (scope === 'FAQ') validateFaqPage(content);
    else validateCookieNotice(content);
    return this.db.$transaction(async tx => {
      const site = await tx.site.findUnique({ where: { id: siteId } });
      if (!site) throw new NotFoundException('Сайт не найден.');
      if (site.workingRevision !== expectedRevision) throw new ConflictException('Рабочая версия изменилась. Обновите данные перед сохранением.');

      if (scope === 'COOKIE_NOTICE') {
        const before = readCookieNotice(site.settings);
        if (before && editorialDigest(before) === editorialDigest(content)) return { content, workingRevision: site.workingRevision };
        const after = await tx.site.update({
          where: { id: siteId },
          data: { settings: json({ ...settingsObject(site.settings), cookieNotice: content }) },
        });
        const revision = await this.workflow.recordWorkingRevision(tx, {
          siteId, entityType: 'SITE', entityId: siteId, action: 'UPDATE', previousSnapshot: site,
          snapshot: after, changedFields: ['settings.cookieNotice'], actorId, source: 'admin:cookie-notice',
        });
        return { content, workingRevision: revision.siteRevision };
      }

      validateFaqPage(content);
      const where = { ...faqWhere, siteId };
      const before = await tx.page.findFirst({ where });
      if (before?.status === 'PUBLISHED' && editorialDigest(before.content) === editorialDigest(content)) {
        return { content, workingRevision: site.workingRevision };
      }
      const [cityCollision, pageCollision, aliasCollision] = await Promise.all([
        tx.city.count({ where: { siteId, slug: FAQ_SLUG } }),
        tx.page.count({ where: { siteId, cityId: null, slug: FAQ_SLUG, type: { not: 'FAQ' } } }),
        tx.redirect.count({ where: { siteId, sourcePath: '/faq', status: 'PUBLISHED' } }),
      ]);
      if (cityCollision || pageCollision || aliasCollision) throw new ConflictException('Адрес /faq уже занят. Сначала устраните конфликт маршрута.');
      const row = { title: content.h1, content: json(content), status: 'PUBLISHED' as const };
      const after = before
        ? await tx.page.update({ where: { id: before.id }, data: row })
        : await tx.page.create({ data: { ...where, ...row } });
      await tx.seoTemplate.upsert({ where: { siteId_kind: { siteId, kind: 'FAQ' } }, create: { siteId, ...FAQ_SEO }, update: {} });
      const revision = await this.workflow.recordWorkingRevision(tx, {
        siteId, entityType: 'PAGE', entityId: after.id, action: before ? 'UPDATE' : 'CREATE',
        previousSnapshot: before, snapshot: after, changedFields: ['title', 'content', 'status'], actorId, source: 'admin:faq',
      });
      return { content, workingRevision: revision.siteRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async candidate(tx: Tx, siteId: string, scopes: Scope[]) {
    const site = await tx.site.findUnique({ where: { id: siteId, status: 'PUBLISHED' } });
    if (!site) throw new NotFoundException('Сайт не найден.');
    const { source, publication } = await editorialServingSource(tx, site);
    const selected: Parameters<typeof applyFaqCookieSelection>[1] = {};
    if (scopes.includes('FAQ')) {
      const page = await tx.page.findFirst({ where: { siteId, ...faqWhere, status: 'PUBLISHED' }, include: { blocks: { where: { visible: true, archivedAt: null }, orderBy: { position: 'asc' } } } });
      const seo = await tx.seoTemplate.findUnique({ where: { siteId_kind: { siteId, kind: 'FAQ' } } });
      if (!page || !seo) throw new ConflictException('Сначала сохраните FAQ и его SEO.');
      validateFaqPage(page.content);
      selected.faq = { page, seo };
    }
    if (scopes.includes('COOKIE_NOTICE')) {
      const cookie = readCookieNotice(site.settings);
      if (!cookie) throw new ConflictException('Сначала сохраните уведомление cookie.');
      selected.cookie = cookie;
    }
    const next = applyFaqCookieSelection(source, selected);
    const before = { faq: source.globalPages.find(page => page.type === 'FAQ')?.content ?? null, seo: source.seoTemplates.find(item => item.kind === 'FAQ') ?? null, cookie: readCookieNotice(source.site.settings) ?? null };
    const after = { faq: selected.faq?.page.content ?? before.faq, seo: selected.faq?.seo ?? before.seo, cookie: selected.cookie ?? before.cookie };
    const changed = editorialDigest(json(before)) !== editorialDigest(json(after));
    const report = validatePublicationSource(next, { appVersion: APP_VERSION, siteRevision: publication.siteRevision }, (data, now) => this.catalog.renderSource(data, now));
    const reviewDigest = editorialDigest({ baseline: publication.id, scopes, selected });
    return { next, publication, report, reviewDigest, changed, before, after, scopes };
  }

  async review(siteId: string, rawScopes: unknown) {
    const scopes = parseScopes(rawScopes);
    const candidate = await this.db.$transaction(tx => this.candidate(tx, siteId, scopes), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000,
    });
    return {
      ready: candidate.changed && !!candidate.report.catalog,
      changed: candidate.changed, basePublicationId: candidate.publication.id,
      reviewDigest: candidate.reviewDigest, scopes,
      before: { ...(scopes.includes('FAQ') ? { faq: candidate.before.faq, seo: candidate.before.seo } : {}), ...(scopes.includes('COOKIE_NOTICE') ? { cookie: candidate.before.cookie } : {}) },
      after: { ...(scopes.includes('FAQ') ? { faq: candidate.after.faq, seo: candidate.after.seo } : {}), ...(scopes.includes('COOKIE_NOTICE') ? { cookie: candidate.after.cookie } : {}) },
      report: candidate.report.report,
    };
  }

  async publish(siteId: string, rawScopes: unknown, digest: unknown, operationId: unknown, actorId?: string) {
    const scopes = parseScopes(rawScopes);
    const scopeKey = operationKey(operationId);
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new BadRequestException('Сначала проверьте выбранные изменения.');
    const publication = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Site" WHERE id = ${siteId} FOR UPDATE`;
      const previous = await tx.sitePublication.findFirst({ where: { siteId, scopeKey } });
      if (previous) {
        if (previous.changeSetDigest !== digest) throw new ConflictException('Идентификатор уже использован для другой публикации.');
        return previous;
      }
      const pending = await tx.sitePublication.findFirst({ where: { siteId, status: { in: ['PENDING', 'RUNNING'] } }, select: { id: true } });
      if (pending) throw new ConflictException('На сайте уже идёт публикация.');
      const candidate = await this.candidate(tx, siteId, scopes);
      if (candidate.reviewDigest !== digest) throw new ConflictException('Состав выпуска изменился. Выполните проверку заново.');
      const validation = candidate.report;
      if (!candidate.changed || !validation.catalog) throw new ConflictException({ message: 'Выбранный выпуск пуст или не прошёл проверку.', report: validation.report });
      const siteRevision = candidate.publication.siteRevision;
      const saved = await tx.sitePublicationValidation.create({ data: {
        siteId, siteRevision, sourceSnapshot: json(candidate.next), report: json(validation.report), appVersion: APP_VERSION,
        outcome: validation.report.outcome, checkedUrlCount: validation.report.checkedUrlCount, requestedById: actorId,
      } });
      return tx.sitePublication.create({ data: {
        siteId, siteRevision, scopeKey, basePublicationId: candidate.publication.id, changeSetDigest: digest,
        triggerEntity: 'faq-cookie', triggerEntityId: scopes.join('+'), validationId: saved.id,
        catalog: json(validation.catalog), requestedById: actorId, status: 'PENDING',
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
    const rebuild = ['PENDING', 'RUNNING'].includes(publication.status)
      ? await this.queue.enqueue({ entity: 'site-publication', id: publication.id, siteId, publicationId: publication.id })
      : null;
    return { publicationId: publication.id, status: publication.status, rebuild };
  }

  async operation(siteId: string, id: string) {
    const publication = await this.db.sitePublication.findFirst({
      where: { siteId, scopeKey: operationKey(id) },
      select: { id: true, status: true, lastError: true, publishedAt: true, basePublicationId: true },
    });
    if (!publication) throw new NotFoundException('Операция не найдена.');
    return publication;
  }
}

export function applyFaqCookieSelection(source: CatalogSource, selection: {
  faq?: { page: Record<string, any>; seo: Record<string, any> };
  cookie?: import('./cookie-notice-model').CookieNotice;
}): CatalogSource {
  const next = structuredClone(source);
  if (selection.faq) {
    next.globalPages = [...next.globalPages.filter(page => page.type !== 'FAQ'), structuredClone(selection.faq.page)];
    next.seoTemplates = [...next.seoTemplates.filter(seo => seo.kind !== 'FAQ'), structuredClone(selection.faq.seo)];
  }
  if (selection.cookie) {
    next.site.settings = { ...settingsObject(next.site.settings), cookieNotice: structuredClone(selection.cookie) };
  }
  return next;
}

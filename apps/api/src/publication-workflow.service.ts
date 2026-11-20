import { acknowledgedEditorialAliases,confirmedEditorialTransfers } from './editorial-redirects';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { publishedVariableContext, publishedVariableUsages, type PublishedVariableUsagePage } from './published-variable-context';
import { readCorporatePhone } from './site-contact-settings';
import { createHash } from 'node:crypto';
import { selectFrozenCity, servingCityProjection, servingPublication } from './serving-publication-context';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { SiteCatalogService } from './site-catalog.service';
import { sitePhoneReadinessErrors } from './site-phone';
import { APP_VERSION } from './app-version';
import { validatePublicationSource, type PublicationValidationReport } from './publication-validation';
import { publicationChangeSummary } from './publication-change-summary';
import { ADMIN_ROUTE_PAGE_SIZE } from './admin-route-pagination';
import { prepareWorkingPreviewCatalog, workingPreviewPage } from './working-preview-model';
import { readWorkingPreviewFingerprint } from './working-preview-fingerprint';
import { WorkingPreviewReuse, type WorkingPreviewLease } from './working-preview-reuse';
import {
  readCmsProgress, estimatePublicationRemaining, preparePublicationEstimate, type CmsProgress, type PublicationEstimate,
} from './publication-progress';

type Transaction = Prisma.TransactionClient | PrismaService;
type JsonObject = Record<string, unknown>;

// Full publication catalogs share a bounded budget; ordinary CMS transactions keep their defaults.
const PUBLICATION_CATALOG_TRANSACTION_TIMEOUT_MS = 60_000;
const PUBLICATION_ETA_CACHE_LIMIT = 32;
const WORKING_PREVIEW_RULES_VERSION = process.env.APP_SOURCE_COMMIT || `local:${APP_VERSION}:working-preview-v1`;

function auditFieldValue(snapshot: JsonObject, field: string): unknown {
  if (Object.hasOwn(snapshot, field)) return snapshot[field] ?? null;
  const visit = (value: unknown, path: string[]): unknown => {
    if (!path.length) return value ?? null;
    if (!value || typeof value !== 'object') return null;
    const [key, ...rest] = path;
    if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) return value.map(item => visit(item, path));
    return Object.hasOwn(value, key) ? visit((value as JsonObject)[key], rest) : null;
  };
  return visit(snapshot, field.split('.'));
}

type WorkingRevisionInput = {
  siteId: string;
  entityType: 'PROVIDER' | 'SITE' | 'REGION' | 'CITY' | 'PAGE' | 'PAGE_TEMPLATE' | 'TARIFF' | 'REDIRECT';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'IMPORT' | 'UNDO' | 'ARCHIVE' | 'RESTORE' | 'PURGE';
  previousSnapshot?: JsonObject | null;
  snapshot: JsonObject;
  changedFields: string[];
  actorId?: string | null;
  source: string;
};

type PublicationInput = {
  siteId: string;
  siteRevision: number;
  catalog: JsonObject;
  triggerEntity: string;
  triggerEntityId: string;
  requestedById?: string | null;
  validationId?: string | null;
  basePublicationId?: string | null;
};

type PreparePublicationInput = Omit<PublicationInput, 'siteRevision' | 'catalog'> & {
  expectedWorkingRevision: number;
};

type BlockedPublication = { blocked: true; validationId: string; report: PublicationValidationReport };

@Injectable()
export class PublicationWorkflowService {
  private readonly publicationEstimates = new Map<string, { key: string; result: Promise<PublicationEstimate | null> }>();
  private readonly workingPreviewReuse = new WorkingPreviewReuse();

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: SiteCatalogService,
  ) {}

  private jsonSnapshot(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private fieldChanges(input: WorkingRevisionInput): Prisma.InputJsonValue {
    const previous = input.previousSnapshot && typeof input.previousSnapshot === 'object'
      ? input.previousSnapshot
      : {};
    const next = input.snapshot && typeof input.snapshot === 'object' ? input.snapshot : {};
    return Object.fromEntries([...new Set(input.changedFields)].sort().map((field) => [
      field,
      {
        before: auditFieldValue(previous, field),
        after: auditFieldValue(next, field),
      },
    ])) as Prisma.InputJsonObject;
  }

  async recordWorkingRevision(transaction: Transaction, input: WorkingRevisionInput) {
    const site = await transaction.site.update({
      where: { id: input.siteId },
      data: { workingRevision: { increment: 1 } },
    });
    const previous = await transaction.contentRevision.aggregate({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
      },
      _max: { entityRevision: true },
    });
    const entityRevision = (previous._max.entityRevision || 0) + 1;
    const changedFields = [...new Set(input.changedFields)].sort();
    const revision = await transaction.contentRevision.create({
      data: {
        siteId: input.siteId,
        entityType: input.entityType,
        entityId: input.entityId,
        entityRevision,
        siteRevision: site.workingRevision,
        action: input.action,
        previousSnapshot: input.previousSnapshot === undefined
          ? Prisma.DbNull
          : this.jsonSnapshot(input.previousSnapshot),
        snapshot: this.jsonSnapshot(input.snapshot),
        changedFields,
        source: input.source,
        actorId: input.actorId || null,
      },
    });
    await transaction.auditEvent.create({
      data: {
        siteId: input.siteId,
        siteRevision: site.workingRevision,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        changedFields,
        changes: this.jsonSnapshot(this.fieldChanges(input)),
        source: input.source,
        actorId: input.actorId || null,
      },
    });
    return revision;
  }

  createPublication(transaction: Transaction, input: PublicationInput) {
    return transaction.sitePublication.create({
      data: {
        siteId: input.siteId,
        siteRevision: input.siteRevision,
        catalog: this.jsonSnapshot(input.catalog),
        triggerEntity: input.triggerEntity,
        triggerEntityId: input.triggerEntityId,
        requestedById: input.requestedById || null,
        validationId: input.validationId || null,
        ...(input.basePublicationId ? {basePublicationId:input.basePublicationId}:{}),
        status: 'PENDING',
      },
    });
  }

  private async validateWorkingSource(
    transaction: Transaction,
    input: Omit<PublicationInput, 'catalog'>,
  ) {
    const site = await transaction.site.findUnique({ where: { id: input.siteId } });
    if (!site) throw new NotFoundException('Site not found');
    if (site.workingRevision !== input.siteRevision) {
      throw new ConflictException('Рабочая ревизия сайта изменилась до создания снимка публикации');
    }
    const source = await this.catalog.captureSourceBySiteId(input.siteId, transaction);
    const snapshot = this.jsonSnapshot(source) as JsonObject;
    const result = validatePublicationSource(snapshot as Parameters<typeof validatePublicationSource>[0], {
      appVersion: APP_VERSION,
      requestedById: input.requestedById,
      siteRevision: input.siteRevision,
    }, (candidate, now, resolution) => this.catalog.renderSource(candidate, now, resolution));
    const validation = await transaction.sitePublicationValidation.create({
      data: {
        siteId: input.siteId,
        siteRevision: input.siteRevision,
        sourceSnapshot: snapshot as Prisma.InputJsonValue,
        report: this.jsonSnapshot(result.report),
        appVersion: APP_VERSION,
        outcome: result.report.outcome,
        checkedUrlCount: result.report.checkedUrlCount,
        requestedById: input.requestedById || null,
        validatedAt: new Date(result.report.validatedAt),
      },
    });
    if (!result.catalog) {
      return { blocked: true as const, validationId: validation.id, report: result.report };
    }
    return {
      blocked: false as const,
      validationId: validation.id,
      catalog: this.jsonSnapshot(result.catalog) as JsonObject,
      basePublicationId: source.publicationBaseId,
    };
  }

  async captureWorkingPublication(transaction: Transaction, input: Omit<PublicationInput, 'catalog'>) {
    const validated = await this.validateWorkingSource(transaction, input);
    if (validated.blocked) return validated;
    const publication = await this.createPublication(transaction, { ...input, catalog: validated.catalog, validationId: validated.validationId,basePublicationId:validated.basePublicationId });
    return { blocked: false as const, publication };
  }

  async preparePublication(input: PreparePublicationInput) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM "Site" WHERE id=${input.siteId} FOR UPDATE`);
      const editorialPending=await transaction.sitePublication.findFirst({where:{siteId:input.siteId,scopeKey:{not:'legacy'},status:{in:['PENDING','RUNNING']}},select:{id:true}});
      if(editorialPending)throw new ConflictException('Выполняется редакционная публикация. Дождитесь её результата перед общим выпуском сайта.');
      const site = await transaction.site.findUnique({ where: { id: input.siteId } });
      if (!site) throw new NotFoundException('Site not found');
      if (site.workingRevision !== input.expectedWorkingRevision) {
        throw new ConflictException('Рабочая ревизия сайта изменилась; обновите состояние перед публикацией');
      }
      if (site.workingRevision <= site.publishedRevision) {
        throw new ConflictException('Нет неопубликованных изменений');
      }
      const existing = await transaction.sitePublication.findUnique({
        where: {
          siteId_siteRevision: {
            siteId: site.id,
            siteRevision: site.workingRevision,
            scopeKey: 'legacy',
          },
        },
      });
      if (existing) {
        if (existing.status !== 'FAILED' && existing.status !== 'CANCELLED') return { blocked: false as const, publication: existing };
        const validated = await this.validateWorkingSource(transaction, {
          siteId: site.id, siteRevision: site.workingRevision,
          triggerEntity: input.triggerEntity, triggerEntityId: input.triggerEntityId,
          requestedById: input.requestedById,
        });
        if (validated.blocked) return validated;
        const publication = await transaction.sitePublication.update({
          where: { id: existing.id },
          data: {
            catalog: validated.catalog as Prisma.InputJsonValue,
            validationId: validated.validationId,
            basePublicationId: validated.basePublicationId??null,
            requestedById: input.requestedById || null,
            status: 'PENDING',
            lastError: null,
            providerDeploymentId: null,
            providerResponse: Prisma.DbNull,
            publishedAt: null,
          },
        });
        return { blocked: false as const, publication };
      }
      return this.captureWorkingPublication(transaction, {
        siteId: site.id,
        siteRevision: site.workingRevision,
        triggerEntity: input.triggerEntity,
        triggerEntityId: input.triggerEntityId,
        requestedById: input.requestedById,
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      // Capturing/validating a whole published city/tariff catalog and storing
      // its JSON can exceed Prisma's default 5-second interactive transaction.
      // Keep one consistent snapshot and a bounded publication-only budget.
      timeout: PUBLICATION_CATALOG_TRANSACTION_TIMEOUT_MS,
    });
    if (result.blocked) {
      const first = result.report.issues.find((issue) => issue.severity === 'BLOCKING');
      throw new ConflictException(`Публикация заблокирована: ${first?.message || 'проверка URL не пройдена'}. Отчет ${result.validationId}`);
    }
    return result.publication;
  }

  private async getPublicationEstimate(siteId: string, current: CmsProgress): Promise<PublicationEstimate | null> {
    const where = { siteId, status: 'SUCCEEDED' } as const;
    // Compare only the metadata of the ordered sample window. Reading provider
    // JSON and parsing all stage durations is necessary when its version changes.
    const refs = await this.prisma.sitePublication.findMany({
      where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 20,
      select: { id: true, updatedAt: true },
    });
    const key = JSON.stringify([current.publicationId, current.revision, current.runId, current.rendererId, current.totalPages, refs]);
    const cached = this.publicationEstimates.get(siteId);
    if (cached?.key === key) return cached.result;
    if (refs.length < 3) {
      this.publicationEstimates.delete(siteId);
      return null;
    }

    const result = this.prisma.sitePublication.findMany({
      where: { ...where, OR: refs },
      select: { providerResponse: true },
    }).then(rows => {
      // A receipt can update a selected row between the two reads. Never
      // cache an estimate for this version when the second read missed a row.
      if (rows.length !== refs.length) {
        if (this.publicationEstimates.get(siteId)?.result === result) this.publicationEstimates.delete(siteId);
        return null;
      }
      const samples = rows.map(row => readCmsProgress(row.providerResponse)).filter((sample): sample is CmsProgress => Boolean(sample));
      return preparePublicationEstimate(current, samples);
    }).catch(error => {
      if (this.publicationEstimates.get(siteId)?.result === result) this.publicationEstimates.delete(siteId);
      throw error;
    });
    this.publicationEstimates.set(siteId, { key, result });
    if (this.publicationEstimates.size > PUBLICATION_ETA_CACHE_LIMIT) {
      const oldestSiteId = this.publicationEstimates.keys().next().value;
      if (oldestSiteId !== undefined) this.publicationEstimates.delete(oldestSiteId);
    }
    return result;
  }

  async getState(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId }, select: { workingRevision: true, publishedRevision: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    const [latestPublication, rebuild, latestValidation] = await Promise.all([
      this.prisma.sitePublication.findFirst({
        where: { siteId },
        orderBy: { releaseSequence: 'desc' },
        select: {
          id: true,
          siteRevision: true,
          status: true,
          triggerEntity: true,
          triggerEntityId: true,
          requestedById: true,
          validationId: true,
          lastError: true,
          providerDeploymentId: true,
          createdAt: true,
          updatedAt: true,
          publishedAt: true,
        },
      }),
      this.prisma.siteRebuild.findUnique({
        where: { dedupeKey: `site:${siteId}` },
        select: {
          id: true,
          status: true,
          requestedRevision: true,
          processingRevision: true,
          publishedRevision: true,
          requestedPublicationId: true,
          processingPublicationId: true,
          publishedPublicationId: true,
          attempts: true,
          maxAttempts: true,
          lastError: true,
          providerStatus: true,
          providerDeploymentId: true,
          queuedAt: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
          providerResponse: true,
        },
      }),
      this.prisma.sitePublicationValidation.findFirst({
        where: { siteId },
        orderBy: [{ validatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, siteRevision: true, appVersion: true, outcome: true, checkedUrlCount: true, requestedById: true, validatedAt: true },
      }),
    ]);
    const currentProgress = readCmsProgress(rebuild?.providerResponse);
    const matchingProgress = currentProgress && latestPublication?.id === currentProgress.publicationId
      && currentProgress.revision === rebuild?.processingRevision ? currentProgress : null;
    const now = Date.now();
    const estimate = matchingProgress?.rendererId && matchingProgress.totalPages && matchingProgress.sampleEligible
      && !matchingProgress.completedAt && !matchingProgress.waitingReason
      ? await this.getPublicationEstimate(siteId, matchingProgress) : null;
    const { providerResponse: _privateResponse, ...publicRebuild } = rebuild || {};
    return {
      siteId,
      workingRevision: site.workingRevision,
      publishedRevision: site.publishedRevision,
      hasUnpublishedChanges: site.workingRevision > site.publishedRevision,
      latestPublication,
      latestValidation,
      rebuild: rebuild ? publicRebuild : null,
      progress: matchingProgress ? { ...matchingProgress, ...estimatePublicationRemaining(matchingProgress, estimate, now),
        elapsedSeconds: Math.max(0, Math.floor(((matchingProgress.completedAt ? Date.parse(matchingProgress.completedAt) : now) - Date.parse(matchingProgress.startedAt)) / 1000)),
        stale: !matchingProgress.completedAt && now - Date.parse(matchingProgress.updatedAt) > 45_000,
      } : null,
    };
  }

  async listValidations(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) throw new NotFoundException('Site not found');
    return this.prisma.sitePublicationValidation.findMany({
      where: { siteId },
      orderBy: [{ validatedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, siteRevision: true, appVersion: true, outcome: true, checkedUrlCount: true, requestedById: true, validatedAt: true },
    });
  }

  async getValidation(siteId: string, validationId: string) {
    const validation = await this.prisma.sitePublicationValidation.findUnique({ where: { id: validationId } });
    if (!validation || validation.siteId !== siteId) throw new NotFoundException('Отчет проверки публикации не найден');
    return validation;
  }

  async getVariableContext(siteId: string, cityId?: string) {
    return this.prisma.$transaction(async transaction => {
      const site = await transaction.site.findUnique({ where: { id: siteId }, select: {
        id: true, slug: true, status: true, connectionPhone: true, supportPhone: true, settings: true, workingRevision: true, publishedRevision: true,
        provider: { select: { name: true } },
      } });
      if (!site || site.status !== 'PUBLISHED') throw new NotFoundException('Site not found');
      const cities = await transaction.city.findMany({
        where: { siteId, status: 'PUBLISHED' }, orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, nameGenitive: true, namePrepositional: true,
          tariffs: { where: { status: 'PUBLISHED', availability: 'ACTIVE', ...(cityId ? { cityId } : { id: { in: [] } }) }, orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, slug: true, speed: true, standardPrice: true, promoPrice: true, attributes: true } },
        },
      });
      return { siteId, workingRevision: site.workingRevision, publishedRevision: site.publishedRevision,
        catalog: this.jsonSnapshot({ site: { ...site, settings: undefined, corporatePhone: readCorporatePhone(site.settings) }, cities,
          variableSources: { providerName: site.provider.name, resolvedAt: new Date().toISOString() },
        }) as JsonObject };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getWorkingPreview(siteId: string, projection: 'FULL' | 'SEO' = 'FULL') {
    return this.prisma.$transaction(async (transaction) => {
      const site = await transaction.site.findUnique({ where: { id: siteId } });
      if (!site) throw new NotFoundException('Site not found');
      const catalog = await this.catalog.listBySiteId(site.id, transaction);
      return {
        siteId: site.id,
        workingRevision: site.workingRevision,
        publishedRevision: site.publishedRevision,
        catalog: this.jsonSnapshot(projection === 'SEO'
          ? { routes: catalog.routes, seoByPath: catalog.seoByPath, seoWarnings: catalog.seoWarnings }
          : catalog) as JsonObject,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: PUBLICATION_CATALOG_TRANSACTION_TIMEOUT_MS });
  }

  async getWorkingPreviewOptions(siteId: string, query: { page: number; search?: string; preferred?: string }) {
    const inventory = await this.prisma.$transaction(
      tx => this.catalog.previewInventory(siteId, tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: PUBLICATION_CATALOG_TRANSACTION_TIMEOUT_MS },
    );
    const { options, ...stamp } = inventory;
    const selected = options.find(option => option.path === query.preferred || option.kind === query.preferred)
      ?? options.find(option => option.kind === 'CITY_HOME') ?? options[0] ?? null;
    const search = query.search?.trim().toLocaleLowerCase('ru') || '';
    const matches = search ? options.filter(option => `${option.path} ${option.label}`.toLocaleLowerCase('ru').includes(search)) : options;
    const offset = (query.page - 1) * ADMIN_ROUTE_PAGE_SIZE;
    return {
      ...stamp, selected, total: matches.length, page: query.page, pageSize: ADMIN_ROUTE_PAGE_SIZE,
      items: matches.slice(offset, offset + ADMIN_ROUTE_PAGE_SIZE),
    };
  }

  async getWorkingPreviewPage(siteId: string, path: string, workingRevision: number, basePublicationId: string | null) {
    const { site, catalog } = await this.readWorkingPreviewCatalog(siteId, workingRevision, basePublicationId);
    return {
      siteId, path, workingRevision, basePublicationId, publishedRevision: site.publishedRevision,
      catalog: this.jsonSnapshot(workingPreviewPage(catalog, path)) as JsonObject,
    };
  }

  private async readWorkingPreviewCatalog(siteId: string, workingRevision: number, basePublicationId: string | null) {
    const owned: { lease?: WorkingPreviewLease } = {};
    const staleBase = () => new ConflictException('Опубликованный редакционный снимок изменился. Обновите список страниц.');
    try {
      const snapshot = await this.prisma.$transaction(async tx => {
        const site = await tx.site.findUnique({ where: { id: siteId }, select: {
          id: true, slug: true, status: true, workingRevision: true, publishedRevision: true,
        } });
        if (!site) throw new NotFoundException('Site not found');
        if (site.workingRevision !== workingRevision) {
          throw new ConflictException('Рабочая версия изменилась. Обновите список страниц.');
        }
        if (process.env.WORKING_PREVIEW_REUSE_ENABLED !== 'true') {
          const source = await this.catalog.captureSourceBySiteId(site.id, tx, {});
          if ((source.publicationBaseId ?? null) !== basePublicationId) throw staleBase();
          return { state: 'build' as const, site, source, now: new Date() };
        }
        if (site.status !== 'PUBLISHED') throw new NotFoundException('Site not found');

        // Stamp and full capture use one SQL snapshot. Re-check the exact serving
        // identity through the normal verified read before any result can be reused.
        const base = await this.catalog.readWorkingPreviewBase(site, tx);
        if ((base?.publication.id ?? null) !== basePublicationId) throw staleBase();
        const fingerprint = await readWorkingPreviewFingerprint(tx, site.id);
        const servingCatalog = base && 'catalog' in base.publication ? base.publication.catalog : undefined;
        const servingDigest = base?.verifiedCatalogDigest
          ?? (servingCatalog === undefined ? null : createHash('sha256').update(JSON.stringify(servingCatalog)).digest('hex'));
        const now = new Date();
        const key = createHash('sha256').update(JSON.stringify([
          siteId, workingRevision, site.publishedRevision, WORKING_PREVIEW_RULES_VERSION, now.toISOString().slice(0, 10),
          fingerprint, basePublicationId, base?.publication.releaseSequence ?? null, base?.publication.validationId ?? null,
          base?.publication.catalogGeneration ?? null, servingDigest,
          base?.source.editorial ?? null, base?.source.redirects ?? null,
        ])).digest('hex');
        const reservation = this.workingPreviewReuse.reserve(key);
        if (reservation.state === 'ready' || reservation.state === 'waiting') return { ...reservation, site };
        if (reservation.state === 'owner') owned.lease = reservation.entry;
        const source = await this.catalog.captureSourceBySiteId(site.id, tx, { base });
        return { state: 'build' as const, site, source, now };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: PUBLICATION_CATALOG_TRANSACTION_TIMEOUT_MS });

      // The checked catalog is immutable. A joiner releases its SQL connection
      // before waiting and has already independently verified the same input.
      if (snapshot.state === 'ready') return { site: snapshot.site, catalog: snapshot.catalog };
      if (snapshot.state === 'waiting') return { site: snapshot.site, catalog: await snapshot.result };
      const catalog = prepareWorkingPreviewCatalog(this.catalog.renderSource(snapshot.source, snapshot.now));
      if (owned.lease) this.workingPreviewReuse.finish(owned.lease, catalog);
      return { site: snapshot.site, catalog };
    } catch (error) {
      if (owned.lease) this.workingPreviewReuse.abort(owned.lease, error);
      throw error;
    }
  }

  async getPublicationReview(siteId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const site = await transaction.site.findUnique({ where: { id: siteId } });
      if (!site) throw new NotFoundException('Site not found');
      const source = await this.catalog.captureSourceBySiteId(siteId, transaction);
      const { report } = validatePublicationSource(source, {
        appVersion: APP_VERSION,
        siteRevision: site.workingRevision,
      }, (candidate, now, resolution) => this.catalog.renderSource(candidate, now, resolution));
      const where = { siteId, siteRevision: { gt: site.publishedRevision, lte: site.workingRevision } };
      const [rows, totalChanges] = await Promise.all([
        transaction.contentRevision.findMany({
          where,
          orderBy: [{ siteRevision: 'desc' }, { id: 'desc' }],
          take: 100,
          select: { id: true, siteRevision: true, entityType: true, entityId: true, action: true, changedFields: true, source: true, createdAt: true, snapshot: true, previousSnapshot: true },
        }),
        transaction.contentRevision.count({ where }),
      ]);
      return {
        siteId: site.id,
        siteName: site.name,
        workingRevision: site.workingRevision,
        publishedRevision: site.publishedRevision,
        hasUnpublishedChanges: site.workingRevision > site.publishedRevision,
        totalChanges,
        changes: rows.map(({ id, siteRevision, entityType, entityId, action, changedFields, source: changeSource, createdAt, snapshot, previousSnapshot }) => ({
          id, siteRevision, entityType, entityId, action, changedFields, source: changeSource, createdAt,
          ...publicationChangeSummary({ snapshot, previousSnapshot }),
        })),
        validation: report,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: PUBLICATION_CATALOG_TRANSACTION_TIMEOUT_MS });
  }

  async getBuildCatalog(siteSlug: string): Promise<JsonObject> {
    const site = await this.prisma.site.findUnique({ where: { slug: siteSlug } });
    if (!site) throw new NotFoundException('Site not found');
    const missingPhones = sitePhoneReadinessErrors(site);
    if (missingPhones.length > 0) {
      throw new ConflictException(`Сборка заблокирована: заполните ${missingPhones.join(' и ')}`);
    }
    const rebuild = await this.prisma.siteRebuild.findUnique({ where: { dedupeKey: `site:${site.id}` } });
    if (rebuild?.processingPublicationId) {
      const processing = await this.prisma.sitePublication.findUnique({ where: { id: rebuild.processingPublicationId } });
      if (processing?.siteId === site.id && processing.status !== 'FAILED') return processing.catalog as JsonObject;
    }
    if (rebuild?.status === 'RUNNING' && !rebuild.processingPublicationId) {
      return this.jsonSnapshot(await this.catalog.listBySiteId(site.id, this.prisma)) as JsonObject;
    }
    const published = await this.prisma.sitePublication.findFirst({
      where: { siteId: site.id, status: 'SUCCEEDED' },
      orderBy: { releaseSequence: 'desc' },
    });
    if (published) return published.catalog as JsonObject;

    const captured = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.site.findUnique({ where: { id: site.id } });
      if (!current) throw new NotFoundException('Site not found');
      const existing = await transaction.sitePublication.findFirst({
        where: { siteId: site.id, status: 'SUCCEEDED' },
        orderBy: { releaseSequence: 'desc' },
      });
      if (existing) return { blocked: false as const, catalog: existing.catalog as JsonObject };
      const validated = await this.validateWorkingSource(transaction, {
        siteId: site.id,
        siteRevision: current.workingRevision,
        triggerEntity: 'bootstrap',
        triggerEntityId: site.id,
      });
      if (validated.blocked) return validated;
      const baseline = await transaction.sitePublication.create({
        data: {
          siteId: site.id,
          siteRevision: current.workingRevision,
          status: 'SUCCEEDED',
          catalog: validated.catalog as Prisma.InputJsonValue,
          validationId: validated.validationId,
          triggerEntity: 'bootstrap',
          triggerEntityId: site.id,
          publishedAt: new Date(),
        },
      });
      return { blocked: false as const, catalog: baseline.catalog as JsonObject };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (captured.blocked) {
      throw new ConflictException(`Первая сборка заблокирована: отчет ${captured.validationId}`);
    }
    return captured.catalog;
  }

  async getExactBuildSnapshot(siteSlug: string, publicationId: string) {
    const site = await this.prisma.site.findUnique({ where: { slug: siteSlug }, select: { id: true, slug: true } });
    const publication = await this.prisma.sitePublication.findUnique({ where: { id: publicationId } });
    if (!site || !publication || publication.siteId !== site.id) throw new NotFoundException('Publication snapshot not found');
    if (!['PENDING', 'RUNNING', 'SUCCEEDED'].includes(publication.status)) throw new ConflictException('Publication snapshot is not eligible for a build');
    return {
      publicationId: publication.id, siteId: site.id, siteSlug: site.slug, siteRevision: publication.siteRevision,
      ...(publication.releaseSequence === undefined ? {} : {releaseSequence:publication.releaseSequence}),
      ...(publication.basePublicationId ? {basePublicationId:publication.basePublicationId} : {}),
      catalogDigest: createHash('sha256').update(JSON.stringify(publication.catalog)).digest('hex'),
      catalog: publication.catalog as JsonObject,
    };
  }

  async getPublishedVariableContext(siteSlug: string, cityId?: string, includeUsages = true): Promise<JsonObject> {
    const context = await publishedVariableContext(this.prisma, siteSlug, cityId, includeUsages);
    if (!context) throw new NotFoundException('Published variable context not found');
    return context as JsonObject;
  }

  getPublishedVariableUsages(siteId: string, publicationId: string | null, page?: PublishedVariableUsagePage) {
    return publishedVariableUsages(this.prisma, siteId, publicationId, page);
  }

  async getPublishedCatalog(siteSlug: string): Promise<JsonObject> {
    return (await this.getPublishedSnapshot(siteSlug)).catalog;
  }

  async getPublishedSnapshot(siteSlug: string): Promise<{ id: string; catalog: JsonObject }> {
    const serving = await servingPublication(this.prisma, siteSlug);
    if (serving) return { id: serving.id, catalog: serving.catalog as JsonObject };
    const site = await this.prisma.site.findUnique({ where: { slug: siteSlug } });
    if (!site) throw new NotFoundException('Site not found');
    const publication = await this.prisma.sitePublication.findFirst({
      where: { siteId: site.id, status: 'SUCCEEDED' },
      orderBy: { releaseSequence: 'desc' },
    });
    if (!publication) throw new NotFoundException('Published catalog not found');
    return { id: publication.id, catalog: publication.catalog as JsonObject };
  }

  async getPublishedCity(siteSlug: string, citySlug: string) {
    return this.getPublishedCityEntry(siteSlug, citySlug);
  }

  async getPublishedTariff(siteSlug: string, citySlug: string, tariffSlug: string) {
    return this.getPublishedCityEntry(siteSlug, citySlug, tariffSlug);
  }

  private async getPublishedCityEntry(siteSlug: string, citySlug: string, tariffSlug?: string): Promise<JsonObject> {
    const selected = await servingCityProjection(this.prisma, siteSlug, citySlug, tariffSlug)
      ?? selectFrozenCity(await this.getPublishedCatalog(siteSlug), citySlug, tariffSlug);
    if (!selected.cityFound) throw new NotFoundException('City not found');
    if (!selected.value) throw new NotFoundException('Published tariff not found');
    return selected.value;
  }

  async markSucceeded(publicationId: string, result: { deploymentId?: string; [key: string]: unknown }, existingTransaction?: Prisma.TransactionClient) {
    const acknowledge = async (transaction: Prisma.TransactionClient) => {
      const publication = await transaction.sitePublication.findUnique({ where: { id: publicationId } });
      if (!publication) throw new NotFoundException('Publication not found');
      const publishedAt = new Date();
      const updated = await transaction.sitePublication.update({
        where: { id: publication.id },
        data: {
          status: 'SUCCEEDED',
          lastError: null,
          providerDeploymentId: typeof result.deploymentId === 'string' ? result.deploymentId : null,
          providerResponse: result as Prisma.InputJsonValue,
          publishedAt,
        },
      });
      const site = await transaction.site.findUnique({ where: { id: publication.siteId } });
      if (!site) throw new NotFoundException('Site not found');
      if ((!publication.scopeKey || publication.scopeKey === 'legacy') && publication.siteRevision > site.publishedRevision) {
        await transaction.site.update({
          where: { id: site.id },
          data: { publishedRevision: publication.siteRevision },
        });
      }
      if (publication.scopeKey && publication.scopeKey !== 'legacy') {
        const items = await transaction.editorialPublicationItem.findMany({where:{publicationId:publication.id}});
        for (const item of items) {
          if(item.kind==='ARTICLE'&&item.action==='REASSIGN')continue;
          if (item.action === 'PUBLISH') await transaction.editorialRevision.updateMany({where:{siteId:publication.siteId,kind:item.kind,entityId:item.entityId,revision:item.revision,publishedAt:null},data:{publishedAt}});
          // A delayed receipt remains a historical success, never a rollback of a
          // newer confirmed entity watermark. Live reads still use serving source.
          const latest = await transaction.editorialPublicationItem.findFirst({where:{kind:item.kind,entityId:item.entityId,...(item.kind==='ARTICLE'?{action:{not:'REASSIGN' as const}}:{}),publication:{siteId:publication.siteId,status:'SUCCEEDED'}},orderBy:{publication:{releaseSequence:'desc'}}});
          if (latest?.publicationId !== publication.id) continue;
          const publishedRevision = item.action === 'WITHDRAW' || item.action === 'REASSIGN' ? null : item.revision;
          if (item.kind === 'ARTICLE') await transaction.newsArticle.updateMany({where:{id:item.entityId,siteId:publication.siteId},data:{publishedRevision,everPublished:true}});
          else if (item.kind === 'CATEGORY') await transaction.newsCategory.updateMany({where:{id:item.entityId,siteId:publication.siteId},data:{publishedRevision,...(['WITHDRAW','REASSIGN'].includes(item.action)?{archivedAt:publishedAt}:{})}});
          else await transaction.editorialSettings.updateMany({where:{id:item.entityId,siteId:publication.siteId},data:{publishedRevision}});
        }
        for(const alias of acknowledgedEditorialAliases(publication.catalog as Record<string,any>))await transaction.redirect.updateMany({where:{id:alias.id,siteId:publication.siteId,managedEditorialKey:{not:null},OR:[{managedEditorialReleaseSequence:null},{managedEditorialReleaseSequence:{lt:publication.releaseSequence}}]},data:{managedEditorialKey:alias.managedEditorialKey,targetPath:alias.targetPath,managedEditorialReleaseSequence:publication.releaseSequence}});
        // Replay confirmed replacements in order: an older delayed receipt can
        // complete A→B after B→C, including aliases currently hidden by pagination.
        for(const transfer of await confirmedEditorialTransfers(transaction,publication.siteId))await transaction.redirect.updateMany({where:{siteId:publication.siteId,managedEditorialKey:`CATEGORY:${transfer.sourceId}`,managedEditorialReleaseSequence:{not:null,lt:transfer.releaseSequence}},data:{managedEditorialKey:`CATEGORY:${transfer.targetId}`,managedEditorialReleaseSequence:transfer.releaseSequence}});
      }
      return updated;
    };
    return existingTransaction ? acknowledge(existingTransaction) : this.prisma.$transaction(acknowledge);
  }

  async markRunning(publicationId: string) {
    const publication = await this.prisma.sitePublication.findUnique({ where: { id: publicationId } });
    if (!publication) throw new NotFoundException('Publication not found');
    if (publication.status === 'SUCCEEDED') return publication;
    return this.prisma.sitePublication.update({
      where: { id: publication.id },
      data: { status: 'RUNNING', lastError: null },
    });
  }

  async markFailed(publicationId: string, error: string) {
    const publication = await this.prisma.sitePublication.findUnique({ where: { id: publicationId } });
    if (!publication) throw new NotFoundException('Publication not found');
    if (publication.status === 'SUCCEEDED') return publication;
    return this.prisma.sitePublication.update({
      where: { id: publication.id },
      data: { status: 'FAILED', lastError: error.slice(0, 2000) },
    });
  }
}

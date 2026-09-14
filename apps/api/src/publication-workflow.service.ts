import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { SiteCatalogService } from './site-catalog.service';

type Transaction = Prisma.TransactionClient | PrismaService;
type JsonObject = Record<string, unknown>;

type WorkingRevisionInput = {
  siteId: string;
  entityType: 'PROVIDER' | 'SITE' | 'REGION' | 'CITY' | 'PAGE' | 'TARIFF' | 'REDIRECT';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'IMPORT' | 'ARCHIVE' | 'RESTORE';
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
};

@Injectable()
export class PublicationWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: SiteCatalogService,
  ) {}

  private jsonSnapshot(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  async recordWorkingRevision(transaction: Transaction, input: WorkingRevisionInput) {
    const site = await transaction.site.update({
      where: { id: input.siteId },
      data: { workingRevision: { increment: 1 } },
    });
    const previous = await transaction.contentRevision.aggregate({
      where: {
        siteId: input.siteId,
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
      },
    });
  }

  async captureWorkingPublication(
    transaction: Transaction,
    input: Omit<PublicationInput, 'catalog'>,
  ) {
    const site = await transaction.site.findUnique({ where: { id: input.siteId } });
    if (!site) throw new NotFoundException('Site not found');
    if (site.workingRevision !== input.siteRevision) {
      throw new ConflictException('Рабочая ревизия сайта изменилась до создания снимка публикации');
    }
    const catalog = await this.catalog.listBySiteId(input.siteId, transaction);
    return this.createPublication(transaction, { ...input, catalog: this.jsonSnapshot(catalog) as JsonObject });
  }

  async getBuildCatalog(siteSlug: string): Promise<JsonObject> {
    const site = await this.prisma.site.findUnique({ where: { slug: siteSlug } });
    if (!site) throw new NotFoundException('Site not found');
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
      orderBy: { siteRevision: 'desc' },
    });
    if (published) return published.catalog as JsonObject;

    const catalog = this.jsonSnapshot(await this.catalog.listBySiteId(site.id, this.prisma)) as JsonObject;
    const baseline = await this.prisma.sitePublication.create({
      data: {
        siteId: site.id,
        siteRevision: site.workingRevision,
        status: 'SUCCEEDED',
        catalog: catalog as Prisma.InputJsonValue,
        triggerEntity: 'bootstrap',
        triggerEntityId: site.id,
        publishedAt: new Date(),
      },
    });
    return baseline.catalog as JsonObject;
  }

  async getPublishedCatalog(siteSlug: string): Promise<JsonObject> {
    const site = await this.prisma.site.findUnique({ where: { slug: siteSlug } });
    if (!site) throw new NotFoundException('Site not found');
    const publication = await this.prisma.sitePublication.findFirst({
      where: { siteId: site.id, status: 'SUCCEEDED' },
      orderBy: { siteRevision: 'desc' },
    });
    if (!publication) throw new NotFoundException('Published catalog not found');
    return publication.catalog as JsonObject;
  }

  async getPublishedCity(siteSlug: string, citySlug: string) {
    const catalog = await this.getPublishedCatalog(siteSlug);
    const cities = Array.isArray(catalog.cities) ? catalog.cities as Array<Record<string, unknown>> : [];
    const city = cities.find((item) => item.slug === citySlug);
    if (!city) throw new NotFoundException('City not found');
    return city;
  }

  async markSucceeded(publicationId: string, result: { deploymentId?: string; [key: string]: unknown }) {
    return this.prisma.$transaction(async (transaction) => {
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
      if (publication.siteRevision > site.publishedRevision) {
        await transaction.site.update({
          where: { id: site.id },
          data: { publishedRevision: publication.siteRevision },
        });
      }
      return updated;
    });
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

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';
import { formatSitePhone, normalizeSitePhone, sitePhoneReadinessErrors } from './site-phone';
import { readSitePublicDisplay, validateSitePublicDisplay, withSitePublicDisplay } from './site-public-display';
import { isDeepStrictEqual } from 'node:util';

export { formatSitePhone, normalizeSitePhone, sitePhoneReadinessErrors } from './site-phone';

@Injectable()
export class SiteValuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  async get(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        slug: true,
        connectionPhone: true,
        supportPhone: true,
        settings: true,
        workingRevision: true,
        publishedRevision: true,
      },
    });
    if (!site) throw new NotFoundException('Сайт не найден');
    return this.response(site);
  }

  async list() {
    const sites = await this.prisma.site.findMany({ orderBy: { name: 'asc' }, select: {
      id: true, name: true, slug: true, connectionPhone: true, supportPhone: true, settings: true,
      workingRevision: true, publishedRevision: true,
    } });
    return sites.map(site => this.response(site));
  }

  async update(input: {
    siteId: string;
    expectedWorkingRevision: number;
    connectionPhone: string;
    supportPhone: string;
    publicDisplay?: unknown;
    actorId?: string | null;
  }) {
    if (!Number.isInteger(input.expectedWorkingRevision) || input.expectedWorkingRevision < 0) {
      throw new BadRequestException('Передайте актуальную рабочую ревизию сайта');
    }
    const connectionPhone = normalizeSitePhone(input.connectionPhone);
    const supportPhone = normalizeSitePhone(input.supportPhone);
    if (input.publicDisplay !== undefined) validateSitePublicDisplay(input.publicDisplay);
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.site.findUnique({ where: { id: input.siteId } });
      if (!current) throw new NotFoundException('Сайт не найден');
      if (current.workingRevision !== input.expectedWorkingRevision) {
        throw new ConflictException('Рабочая ревизия сайта изменилась; обновите значения перед сохранением');
      }
      const settings = input.publicDisplay === undefined ? undefined : withSitePublicDisplay(current.settings, input.publicDisplay);
      const site = await transaction.site.update({
        where: { id: input.siteId },
        data: { connectionPhone, supportPhone, ...(settings ? { settings } : {}) },
      });
      const changedFields = ['connectionPhone', 'supportPhone'].filter((field) => current[field as 'connectionPhone' | 'supportPhone'] !== site[field as 'connectionPhone' | 'supportPhone']);
      if (settings && !isDeepStrictEqual((current.settings as Record<string, unknown> | null)?.publicDisplay, input.publicDisplay)) changedFields.push('settings.publicDisplay');
      if (changedFields.length === 0) return this.response(site);
      const revision = await this.publications.recordWorkingRevision(transaction, {
        siteId: site.id,
        entityType: 'SITE',
        entityId: site.id,
        action: 'UPDATE',
        previousSnapshot: current as unknown as Record<string, unknown>,
        snapshot: site as unknown as Record<string, unknown>,
        changedFields,
        actorId: input.actorId,
        source: 'admin-site-values',
      });
      return this.response({ ...site, workingRevision: revision.siteRevision });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private response(site: {
    id: string;
    name: string;
    slug: string;
    connectionPhone: string | null;
    supportPhone: string | null;
    workingRevision: number;
    publishedRevision: number;
    settings?: unknown;
  }) {
    return {
      id: site.id, name: site.name, slug: site.slug,
      connectionPhone: site.connectionPhone, supportPhone: site.supportPhone,
      workingRevision: site.workingRevision, publishedRevision: site.publishedRevision,
      publicDisplay: readSitePublicDisplay(site.settings),
      connectionPhoneFormatted: site.connectionPhone ? formatSitePhone(site.connectionPhone) : null,
      supportPhoneFormatted: site.supportPhone ? formatSitePhone(site.supportPhone) : null,
      readinessErrors: sitePhoneReadinessErrors(site),
    };
  }
}

import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { PublicationWorkflowService } from './publication-workflow.service';

const PAGE_LIMIT = 25;

type TariffRow = Prisma.TariffGetPayload<{
  include: { city: { select: { name: true; slug: true; siteId: true } } };
}>;

type DependencyCounts = {
  leads: bigint;
  redirects: bigint;
  publications: bigint;
  validations: bigint;
  imports: bigint;
};

type PurgeItem = {
  id: string;
  name: string;
  path: string;
  updatedAt: string;
  archivedAt: string | null;
  blockers: string[];
};

@Injectable()
export class TariffPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: PublicationWorkflowService,
  ) {}

  private async dependencies(transaction: Prisma.TransactionClient, tariff: TariffRow): Promise<DependencyCounts> {
    const path = `/${tariff.city.slug}/${tariff.slug}`;
    const rows = await transaction.$queryRaw<DependencyCounts[]>`
      SELECT
        (SELECT count(*) FROM "Lead" WHERE "tariffId" = ${tariff.id}) AS "leads",
        (SELECT count(*) FROM "Redirect" WHERE "siteId" = ${tariff.city.siteId}
          AND ("managedTariffId" = ${tariff.id} OR "sourcePath" = ${path} OR "targetPath" = ${path})) AS "redirects",
        (SELECT count(*) FROM "SitePublication" WHERE "siteId" = ${tariff.city.siteId}
          AND ("triggerEntityId" = ${tariff.id} OR jsonb_path_exists("catalog",
            '$.** ? (@.id == $tariffId)', jsonb_build_object('tariffId', ${tariff.id}::text)))) AS "publications",
        (SELECT count(*) FROM "SitePublicationValidation" WHERE "siteId" = ${tariff.city.siteId}
          AND jsonb_path_exists("sourceSnapshot",
            '$.** ? (@.id == $tariffId)', jsonb_build_object('tariffId', ${tariff.id}::text))) AS "validations",
        (SELECT count(*) FROM "TariffImportRun" WHERE "providerId" = ${tariff.providerId}
          AND "changeSet" IS NOT NULL AND jsonb_path_exists("changeSet",
            '$.** ? (@.id == $tariffId)', jsonb_build_object('tariffId', ${tariff.id}::text))) AS "imports"
    `;
    return rows[0];
  }

  private async describe(transaction: Prisma.TransactionClient, tariff: TariffRow): Promise<PurgeItem> {
    const blockers: string[] = [];
    if (tariff.status !== 'ARCHIVED' || tariff.availability !== 'ARCHIVED') blockers.push('Тариф не архивирован');
    const counts = await this.dependencies(transaction, tariff);
    if (counts.leads > 0n) blockers.push(`Связан с заявками: ${counts.leads}`);
    if (counts.redirects > 0n) blockers.push(`Связан с редиректами: ${counts.redirects}`);
    if (counts.publications > 0n) blockers.push(`Упоминается в публикациях: ${counts.publications}`);
    if (counts.validations > 0n) blockers.push(`Упоминается в проверках публикации: ${counts.validations}`);
    if (tariff.archivedByImportRunId || counts.imports > 0n) blockers.push('Связан с историей импорта');
    return {
      id: tariff.id,
      name: tariff.name,
      path: `/${tariff.city.slug}/${tariff.slug}`,
      updatedAt: tariff.updatedAt.toISOString(),
      archivedAt: tariff.archivedAt?.toISOString() ?? null,
      blockers,
    };
  }

  private fingerprint(siteId: string, offset: number, total: number, items: PurgeItem[]) {
    return createHash('sha256').update(JSON.stringify({ siteId, offset, total, items })).digest('hex');
  }

  private async page(transaction: Prisma.TransactionClient, siteId: string, offset: number) {
    const site = await transaction.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) throw new NotFoundException('Сайт не найден');
    const where: Prisma.TariffWhereInput = { city: { siteId }, status: 'ARCHIVED' };
    const [tariffs, total] = await Promise.all([
      transaction.tariff.findMany({
        where,
        orderBy: [{ archivedAt: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: PAGE_LIMIT,
        include: { city: { select: { name: true, slug: true, siteId: true } } },
      }),
      transaction.tariff.count({ where }),
    ]);
    const items: PurgeItem[] = [];
    for (const tariff of tariffs) items.push(await this.describe(transaction, tariff));
    return {
      siteId,
      offset,
      limit: PAGE_LIMIT,
      total,
      nextOffset: offset + items.length < total ? offset + items.length : null,
      items,
      fingerprint: this.fingerprint(siteId, offset, total, items),
    };
  }

  async preview(siteId: string, offset = 0) {
    if (!siteId || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
      throw new BadRequestException('Некорректные параметры очистки тарифов');
    }
    return this.prisma.$transaction((transaction: Prisma.TransactionClient) => this.page(transaction, siteId, offset), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 120_000,
    });
  }

  async purge(input: { siteId: string; offset: number; ids: string[]; fingerprint: string; confirm: boolean }, actorId?: string) {
    if (input.confirm !== true) throw new BadRequestException('Подтвердите физическое удаление');
    if (!input.siteId || !Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 1_000_000
      || input.ids.length === 0 || input.ids.length > PAGE_LIMIT || new Set(input.ids).size !== input.ids.length) {
      throw new BadRequestException('Некорректный пакет очистки тарифов');
    }
    try {
      return await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        await transaction.$queryRaw`SELECT id FROM "Site" WHERE id = ${input.siteId} FOR UPDATE`;
        const initial = await this.page(transaction, input.siteId, input.offset);
        const eligibleIds = initial.items.filter((item) => item.blockers.length === 0).map((item) => item.id);
        if (initial.fingerprint !== input.fingerprint || JSON.stringify(eligibleIds) !== JSON.stringify(input.ids)) {
          throw new ConflictException('Предпросмотр очистки устарел; обновите его');
        }
        // The row lock also conflicts with FK checks when a new Lead references one of these tariffs.
        await transaction.$queryRaw`SELECT id FROM "Tariff" WHERE id IN (${Prisma.join(input.ids)}) FOR UPDATE`;
        const fresh = await this.page(transaction, input.siteId, input.offset);
        if (fresh.fingerprint !== input.fingerprint) throw new ConflictException('Связи тарифа изменились; обновите предпросмотр');
        const snapshots = await transaction.tariff.findMany({ where: { id: { in: input.ids }, city: { siteId: input.siteId } } });
        if (snapshots.length !== input.ids.length) throw new ConflictException('Состав пакета изменился');
        const removed = await transaction.tariff.deleteMany({
          where: { id: { in: input.ids }, city: { siteId: input.siteId }, status: 'ARCHIVED', availability: 'ARCHIVED' },
        });
        if (removed.count !== input.ids.length) throw new ConflictException('Состав архива изменился');
        let workingRevision = 0;
        for (const tariff of snapshots) {
          const revision = await this.publications.recordWorkingRevision(transaction, {
            siteId: input.siteId,
            entityType: 'TARIFF',
            entityId: tariff.id,
            action: 'PURGE',
            previousSnapshot: tariff as unknown as Record<string, unknown>,
            snapshot: { id: tariff.id, purged: true },
            changedFields: ['purged'],
            actorId,
            source: 'admin-tariff-purge',
          });
          workingRevision = revision.siteRevision;
        }
        return { removed: removed.count, workingRevision };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2034'].includes(error.code)) {
        throw new ConflictException('Появилась новая связь или параллельное изменение; обновите предпросмотр');
      }
      throw error;
    }
  }
}

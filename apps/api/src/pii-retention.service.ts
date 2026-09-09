import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5_000;
const MAX_RETENTION_DAYS = 3_650;

function positiveInteger(value: string | undefined, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

@Injectable()
export class PiiRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async purge(now = new Date()) {
    const retentionDays = positiveInteger(process.env.PII_RETENTION_DAYS, MAX_RETENTION_DAYS);
    if (!retentionDays) {
      throw new ServiceUnavailableException('PII retention policy is not configured');
    }
    const batchSize = positiveInteger(process.env.PII_RETENTION_BATCH_SIZE, MAX_BATCH_SIZE) ?? DEFAULT_BATCH_SIZE;
    const cutoffDate = new Date(now.getTime() - retentionDays * DAY_MS);

    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.lead.findMany({
        where: { createdAt: { lt: cutoffDate } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        take: batchSize,
      });
      const ids = candidates.map((lead) => lead.id);

      const detachedDuplicates = ids.length
        ? await tx.lead.updateMany({
          where: { duplicateOfId: { in: ids }, id: { notIn: ids } },
          data: { duplicateOfId: null, duplicateReason: null },
        })
        : { count: 0 };
      const accessTokens = await tx.leadAccessToken.deleteMany({ where: { expiresAt: { lt: now } } });
      const leads = ids.length
        ? await tx.lead.deleteMany({ where: { id: { in: ids } } })
        : { count: 0 };
      const addressChecks = await tx.addressCheck.deleteMany({
        where: { createdAt: { lt: cutoffDate }, leads: { none: {} } },
      });

      return {
        cutoff: cutoffDate.toISOString(),
        retentionDays,
        batchSize,
        complete: candidates.length < batchSize,
        detachedDuplicates: detachedDuplicates.count,
        deleted: {
          leads: leads.count,
          addressChecks: addressChecks.count,
          accessTokens: accessTokens.count,
        },
      };
    }, { isolationLevel: 'Serializable', timeout: 60_000 });
  }
}

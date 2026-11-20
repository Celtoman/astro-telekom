import { Prisma } from '../generated';
import { readTarifnikCoverageSnapshot } from './coverage.service';
import { normalizeAddress, normalizePhone } from './lead-utils';
import type { PrismaService } from './prisma.service';

const ADDRESS_CANDIDATE_BATCH_SIZE = 500;
const RECENT_FIRST: Prisma.LeadOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

function premiseKey(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  const flat = typeof data.flat === 'string' ? normalizeAddress(data.flat) : '';
  if (flat) return `flat:${normalizeAddress(typeof data.flat_type === 'string' ? data.flat_type : '')}:${flat}`;
  const room = typeof data.room === 'string' ? normalizeAddress(data.room) : '';
  return room ? `room:${normalizeAddress(typeof data.room_type === 'string' ? data.room_type : '')}:${room}` : '';
}

type Duplicate = { id: string; reason: 'phone_24h' | 'address_24h' };

/** Keep the historical JavaScript normalization and the site's newest matching lead. */
export async function findRecentLeadDuplicate(
  prisma: PrismaService,
  input: { siteId: string; cutoff: Date; phone: string; address?: string; premise?: Record<string, unknown> },
): Promise<Duplicate | null> {
  const { siteId, cutoff, phone } = input;
  const where = { siteId, createdAt: { gte: cutoff } };
  const normalizedAddress = normalizeAddress(input.address);
  const inputPremise = premiseKey(input.premise);
  const phoneMatch = (rows: Array<{ id: string; phone: string }>): Duplicate | null => {
    const match = rows.find(row => normalizePhone(row.phone) === phone);
    return match ? { id: match.id, reason: 'phone_24h' } : null;
  };

  if (!normalizedAddress || !inputPremise) {
    return phoneMatch(await prisma.lead.findMany({ where, orderBy: RECENT_FIRST, select: { id: true, phone: true } }));
  }

  return prisma.$transaction(async tx => {
    const recent = await tx.lead.findMany({ where, orderBy: RECENT_FIRST, select: { id: true, phone: true, address: true } });
    const phoneDuplicate = phoneMatch(recent);
    if (phoneDuplicate) return phoneDuplicate;

    // Both reads use the same snapshot. Filter the address before reading provider JSON.
    const ids = recent.filter(row => normalizeAddress(row.address) === normalizedAddress).map(row => row.id);
    for (let offset = 0; offset < ids.length; offset += ADDRESS_CANDIDATE_BATCH_SIZE) {
      const candidates = await tx.lead.findMany({
        where: { id: { in: ids.slice(offset, offset + ADDRESS_CANDIDATE_BATCH_SIZE) } },
        orderBy: RECENT_FIRST,
        select: { id: true, apiResult: true },
      });
      const match = candidates.find(candidate => {
        const result = candidate.apiResult as { response?: unknown } | null;
        const candidateCoverage = readTarifnikCoverageSnapshot(result?.response);
        return premiseKey(candidateCoverage?.suggestion.data) === inputPremise;
      });
      if (match) return { id: match.id, reason: 'address_24h' };
    }
    return null;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

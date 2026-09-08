import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';

const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class LeadAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(leadId: string) {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      await tx.leadAccessToken.updateMany({
        where: { leadId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.leadAccessToken.create({
        data: { leadId, tokenHash: tokenHash(token), expiresAt },
      });
    });
    return { token, expiresAt };
  }

  async consume(leadId: string, token: string) {
    const now = new Date();
    const invalid = () => new UnauthorizedException('Ссылка недействительна или истекла');
    return this.prisma.$transaction(async (tx) => {
      const access = await tx.leadAccessToken.findFirst({
        where: {
          leadId,
          tokenHash: tokenHash(token),
          expiresAt: { gt: now },
          usedAt: null,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (!access) throw invalid();

      const consumed = await tx.leadAccessToken.updateMany({
        where: { id: access.id, expiresAt: { gt: now }, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw invalid();

      const lead = await tx.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          createdAt: true,
          phone: true,
          name: true,
          address: true,
          processingStatus: true,
          city: { select: { name: true, slug: true } },
          tariff: { select: { name: true } },
        },
      });
      if (!lead) throw invalid();
      return lead;
    });
  }

  async revoke(leadId: string) {
    const result = await this.prisma.$transaction((tx) => tx.leadAccessToken.updateMany({
      where: { leadId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }));
    return result.count;
  }
}

import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';

type PublishedTemplateView = { homeHero: Record<string, any> | null; generalHome?: Record<string, any> | null; pageTemplates: Record<string, any>[] | null };

// Project the immutable JSON inside PostgreSQL. The editor does not need to
// transfer/parse every city, tariff, revision and validation report in Node.
export async function publishedPageTemplateView(prisma: Pick<PrismaService, '$queryRaw'>, siteId: string): Promise<PublishedTemplateView | null> {
  const rows = await prisma.$queryRaw<PublishedTemplateView[]>(Prisma.sql`
    SELECT p.catalog -> 'homeHero' AS "homeHero",
           p.catalog -> 'generalHome' AS "generalHome",
           jsonb_path_query_array(v."sourceSnapshot", '$.pageTemplates[*] ? (@.kind == "HOME" || @.kind == "CITY_HOME" || @.kind == "CITY_ADDRESS_CHECK")') AS "pageTemplates"
    FROM "SitePublication" p
    LEFT JOIN "SitePublicationValidation" v ON v.id = p."validationId"
    WHERE p."siteId" = ${siteId} AND p.status = 'SUCCEEDED'
    ORDER BY p."siteRevision" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

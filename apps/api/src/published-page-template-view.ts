import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';

type PublishedTemplateView = { homeHero: Record<string, any> | null; pageTemplates: Record<string, any>[] | null };

// Project the immutable JSON inside PostgreSQL. The editor does not need to
// transfer/parse every city, tariff, revision and validation report in Node.
export async function publishedPageTemplateView(prisma: PrismaService, siteId: string): Promise<PublishedTemplateView | null> {
  const rows = await prisma.$queryRaw<PublishedTemplateView[]>(Prisma.sql`
    SELECT p.catalog -> 'homeHero' AS "homeHero",
           jsonb_path_query_array(v."sourceSnapshot", '$.pageTemplates[*] ? (@.kind == "HOME" || @.kind == "CITY_HOME")') AS "pageTemplates"
    FROM "SitePublication" p
    LEFT JOIN "SitePublicationValidation" v ON v.id = p."validationId"
    WHERE p."siteId" = ${siteId} AND p.status = 'SUCCEEDED'
    ORDER BY p."siteRevision" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

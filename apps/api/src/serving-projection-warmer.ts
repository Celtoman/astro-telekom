import { Prisma } from '../generated';
import type { PrismaService } from './prisma.service';
import { SERVING_CATALOG_PROJECTION_VERSION, type ProjectionWarmTarget } from './serving-catalog-projection';

export type PendingProjectionTarget = Required<Pick<ProjectionWarmTarget, 'publicationId' | 'generation'>>;

export async function discoverServingProjectionTargets(client: Pick<PrismaService, '$queryRaw'>, deferred: readonly PendingProjectionTarget[] = []) {
  return client.$queryRaw<PendingProjectionTarget[]>(Prisma.sql`
    WITH jobs AS (
      SELECT "siteId", "processingPublicationId", "requestedPublicationId", "processingRevision", "requestedRevision",
        "publishedRevision", "updatedAt"
      FROM "SiteRebuild" WHERE status IN ('PENDING', 'QUEUED', 'RUNNING', 'RETRYING')
    ), references_by_priority AS (
      SELECT "siteId", "processingPublicationId" AS "publicationId", "updatedAt", 0 AS priority
      FROM jobs WHERE "processingRevision" > "publishedRevision"
      UNION ALL
      SELECT "siteId", "requestedPublicationId" AS "publicationId", "updatedAt", 1 AS priority
      FROM jobs WHERE "requestedRevision" > "publishedRevision"
    ), candidates AS (
      SELECT "siteId", "publicationId", min(priority) AS priority, min("updatedAt") AS "queuedAt"
      FROM references_by_priority WHERE "publicationId" IS NOT NULL GROUP BY "siteId", "publicationId"
    )
    SELECT p.id AS "publicationId", p."catalogGeneration" AS generation
    FROM candidates JOIN "SitePublication" p ON p.id = candidates."publicationId" AND p."siteId" = candidates."siteId"
    WHERE p.status IN ('PENDING', 'RUNNING', 'SUCCEEDED')
      AND NOT EXISTS (
        SELECT 1 FROM "SitePublicationProjection" projection
        WHERE projection."publicationId" = p.id AND projection."catalogGeneration" = p."catalogGeneration"
          AND projection."formatVersion" = ${SERVING_CATALOG_PROJECTION_VERSION}
          AND projection."cityCount" = (
            SELECT count(*) FROM "SitePublicationCityProjection" cities WHERE cities."publicationId" = p.id
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(deferred)}::jsonb) AS skipped("publicationId" text, generation int)
        WHERE skipped."publicationId" = p.id AND skipped.generation = p."catalogGeneration"
      )
    ORDER BY candidates.priority, candidates."queuedAt", p.id
    LIMIT 1
  `);
}

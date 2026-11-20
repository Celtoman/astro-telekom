import { Prisma } from '../generated';
import type { PrismaService } from './prisma.service';
import { readStoredProjection, servingPublication } from './serving-publication-context';

type PublishedSeoDetail = { id: string; catalogGeneration: number; metadata: Prisma.JsonValue };

function metadataAtPath(catalog: Prisma.JsonValue, path: string | null): Prisma.JsonValue {
  if (!path || !catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return null;
  const metadata = catalog.seoByPath;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata[path] ?? null : null;
}

export async function readPublishedSeoDetail(prisma: PrismaService, siteSlug: string, path: string | null): Promise<PublishedSeoDetail | null> {
  const projection = path === null ? Prisma.sql`NULL::jsonb` : Prisma.sql`
    CASE WHEN jsonb_typeof(p.catalog -> 'seoByPath') = 'object' THEN p.catalog -> 'seoByPath' -> ${path}::text END
  `;
  // The stored digest and catalog generation prove the same catalog that contains this value.
  const stored = await readStoredProjection(prisma, siteSlug, projection, catalog => metadataAtPath(catalog, path));
  if (stored) return { id: stored.publication.id, catalogGeneration: stored.publication.catalogGeneration, metadata: stored.data };

  // Static serving without a proven projection still verifies its full digest before the lookup.
  const serving = await servingPublication(prisma, siteSlug);
  if (serving) return { id: serving.id, catalogGeneration: serving.catalogGeneration, metadata: metadataAtPath(serving.catalog, path) };

  const [row] = await prisma.$queryRaw<PublishedSeoDetail[]>(Prisma.sql`
    SELECT p.id, p."catalogGeneration", ${projection} AS metadata
    FROM "SitePublication" p
    JOIN "Site" s ON s.id = p."siteId"
    WHERE s.slug = ${siteSlug} AND p.status = 'SUCCEEDED'
    ORDER BY p."releaseSequence" DESC
    LIMIT 1
  `);
  return row ?? null;
}

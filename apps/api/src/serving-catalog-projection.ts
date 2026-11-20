import { createHash } from 'node:crypto';
import { Prisma } from '../generated';
import type { PrismaService } from './prisma.service';
import { normalizeRedirectPath } from './redirect-path';

export const SERVING_CATALOG_PROJECTION_VERSION = 1;

export function catalogDigest(catalog: Prisma.JsonValue) {
  return createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
}

function isObject(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type ProjectionData = Pick<Prisma.SitePublicationProjectionUncheckedCreateInput, 'globalPages' | 'addressCities' | 'redirects' | 'cityCount'>
  & { site: Prisma.JsonObject };
type CatalogStamp = { siteId: string; siteRevision: number; releaseSequence: number; catalogGeneration: number; status: string };
type ProjectionProof = { publicationId: string; generation: number; cityCount: number; catalogDigest: string };
export type ProjectionWarmTarget = {
  publicationId: string;
  generation?: number;
  active?: { siteId: string; siteSlug: string; siteRevision: number; releaseSequence?: number; catalogDigest: string };
};

type WarmResult =
  | { state: 'ready' | 'already_ready'; proof: ProjectionProof; lockMs: number }
  | { state: 'busy' | 'stale' | 'unsupported' | 'identity_mismatch' };

const eligibleStatus = (status: string) => ['PENDING', 'RUNNING', 'SUCCEEDED'].includes(status);

function projectionFor(catalog: Prisma.JsonValue): ProjectionData | null {
  if (!isObject(catalog) || !isObject(catalog.site) || typeof catalog.site.slug !== 'string'
    || !Array.isArray(catalog.cities) || !catalog.cities.every(isObject)) return null;
  const slugs = new Set<string>();
  const addressCities = [];
  for (const city of catalog.cities) {
    if (typeof city.slug !== 'string' || slugs.has(city.slug) || typeof city.id !== 'string'
      || typeof city.name !== 'string' || !isObject(city.region) || typeof city.region.name !== 'string') return null;
    slugs.add(city.slug);
    addressCities.push({ id: city.id, slug: city.slug, name: city.name, region: city.region });
  }
  const globalPages = catalog.globalPages ?? [];
  const sourceRedirects = catalog.redirects ?? [];
  const routes = catalog.routes ?? [];
  if (!Array.isArray(globalPages) || !globalPages.every(isObject)
    || !Array.isArray(sourceRedirects) || !sourceRedirects.every(isObject)
    || !Array.isArray(routes) || !routes.every(isObject)) return null;

  const paths = new Set(routes.map(route => String(route.path || '')));
  const redirects = sourceRedirects.filter(redirect => redirect.status === 'PUBLISHED').map(redirect => {
    let routeAllowed = false;
    try {
      const sourcePath = normalizeRedirectPath(redirect.sourcePath, 'sourcePath');
      const targetPath = normalizeRedirectPath(redirect.targetPath, 'targetPath');
      routeAllowed = !paths.has(sourcePath) && paths.has(targetPath);
    } catch {
      // The resolver retains its existing error for a malformed published path.
    }
    return { redirect, routeAllowed };
  });
  return { site: catalog.site, globalPages, addressCities, redirects, cityCount: slugs.size };
}

export async function readServingProjectionState(client: Pick<PrismaService, '$queryRaw'>, publicationId: string) {
  const [state] = await client.$queryRaw<Array<CatalogStamp & { catalogDigest: string | null; cityCount: number | null; siteSlug: string | null }>>`
    SELECT p."siteId", p."siteRevision", p."releaseSequence", p."catalogGeneration", p.status::text AS status,
      projection."catalogDigest", projection."cityCount", projection.site ->> 'slug' AS "siteSlug"
    FROM "SitePublication" p
    LEFT JOIN "SitePublicationProjection" projection
      ON projection."publicationId" = p.id AND projection."catalogGeneration" = p."catalogGeneration"
      AND projection."formatVersion" = ${SERVING_CATALOG_PROJECTION_VERSION}
      AND projection."cityCount" = (
        SELECT count(*) FROM "SitePublicationCityProjection" cities WHERE cities."publicationId" = p.id
      )
    WHERE p.id = ${publicationId}
  `;
  return state;
}

function correspondsToActive(target: ProjectionWarmTarget, stamp: CatalogStamp, slug: unknown, digest: string) {
  const active = target.active;
  return !active || (active.siteId === stamp.siteId && active.siteRevision === stamp.siteRevision
    && (active.releaseSequence === undefined || active.releaseSequence === stamp.releaseSequence)
    && active.siteSlug === slug && active.catalogDigest === digest);
}

export async function prepareServingCatalogProjection(prisma: PrismaService, target: ProjectionWarmTarget): Promise<WarmResult> {
  const { publicationId } = target;
  const result = await prisma.$transaction<WarmResult>(async tx => {
    // Warmers share this lock. Publication mutations and activation do not acquire it.
    const [lease] = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(635, 1) AS acquired`;
    if (!lease.acquired) return { state: 'busy' };
    const current = await readServingProjectionState(tx, publicationId);
    if (!current || !eligibleStatus(current.status)
      || (target.generation !== undefined && target.generation !== current.catalogGeneration)) return { state: 'stale' };
    if (current.catalogDigest && current.cityCount !== null) {
      if (!correspondsToActive(target, current, current.siteSlug, current.catalogDigest)) return { state: 'identity_mismatch' };
      return { state: 'already_ready', proof: { publicationId, generation: current.catalogGeneration,
        cityCount: current.cityCount, catalogDigest: current.catalogDigest }, lockMs: 0 };
    }

    const publication = await tx.sitePublication.findUnique({
      where: { id: publicationId, catalogGeneration: current.catalogGeneration },
      select: { catalog: true, siteId: true, siteRevision: true, releaseSequence: true, catalogGeneration: true, status: true },
    });
    if (!publication || !eligibleStatus(publication.status)) return { state: 'stale' };
    const data = projectionFor(publication.catalog);
    if (!data) return { state: 'unsupported' };
    const digest = catalogDigest(publication.catalog);
    if (!correspondsToActive(target, publication, data.site.slug, digest)) return { state: 'identity_mismatch' };

    // Expand the exact SQL JSON before taking the publication row lock. The temporary
    // table is private to this connection and disappears on commit or rollback.
    await tx.$executeRaw`
      CREATE TEMP TABLE serving_catalog_warm_cities (slug text, catalog jsonb) ON COMMIT DROP
    `;
    await tx.$executeRaw`
      INSERT INTO pg_temp.serving_catalog_warm_cities (slug, catalog)
      SELECT city ->> 'slug' AS slug, city AS catalog
      FROM "SitePublication" p, jsonb_array_elements(p.catalog -> 'cities') AS cities(city)
      WHERE p.id = ${publicationId} AND p."catalogGeneration" = ${publication.catalogGeneration}
    `;

    const lockStartedAt = performance.now();
    const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "SitePublication"
      WHERE id = ${publicationId} AND "catalogGeneration" = ${publication.catalogGeneration}
        AND status IN ('PENDING', 'RUNNING', 'SUCCEEDED')
      FOR UPDATE NOWAIT
    `;
    if (!locked) return { state: 'stale' };
    await tx.sitePublicationProjection.deleteMany({ where: { publicationId } });
    await tx.sitePublicationProjection.create({ data: {
      publicationId, formatVersion: SERVING_CATALOG_PROJECTION_VERSION,
      catalogGeneration: publication.catalogGeneration, catalogDigest: digest,
      ...data,
    } });
    const inserted = await tx.$executeRaw`
      INSERT INTO "SitePublicationCityProjection" ("publicationId", "citySlug", "catalog")
      SELECT ${publicationId}, parts.slug, parts.catalog FROM pg_temp.serving_catalog_warm_cities parts
    `;
    if (inserted !== data.cityCount) throw new Error('Incomplete serving catalog projection');
    return { state: 'ready', proof: { publicationId, generation: publication.catalogGeneration,
      cityCount: inserted, catalogDigest: digest }, lockMs: performance.now() - lockStartedAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60_000 });

  if ('proof' in result) {
    const proof = await readServingProjectionState(prisma, publicationId);
    if (!proof || proof.catalogGeneration !== result.proof.generation || !eligibleStatus(proof.status)) return { state: 'stale' };
    if (!correspondsToActive(target, proof, proof.siteSlug, result.proof.catalogDigest)) return { state: 'identity_mismatch' };
    if (proof.catalogDigest !== result.proof.catalogDigest || proof.cityCount !== result.proof.cityCount) {
      throw new Error('Serving catalog projection readback did not match the committed generation');
    }
  }
  return result;
}

// Explicit ops command. Only the persisted catalog provides the data and digest.
export async function warmServingCatalogProjection(prisma: PrismaService, publicationId: string) {
  const result = await prepareServingCatalogProjection(prisma, { publicationId });
  return 'proof' in result ? result.proof : null;
}

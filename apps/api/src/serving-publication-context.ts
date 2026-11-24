import { ROUTER_PAGE_SLUG } from './router-page-model';
import { BadRequestException, CallHandler, ExecutionContext, NestInterceptor, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { catalogDigest, SERVING_CATALOG_PROJECTION_VERSION } from './serving-catalog-projection';

type ServingIdentity = { publicationId: string; siteId?: string; siteSlug?: string; siteRevision?: number; releaseSequence?:number; catalogDigest?: string };
type ActiveServingIdentity = Required<Omit<ServingIdentity, 'releaseSequence'>> & Pick<ServingIdentity, 'releaseSequence'>;
const requestPublication = new AsyncLocalStorage<ServingIdentity | undefined>();
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const staticServing = () => process.env.REBUILD_PROVIDER === 'static';
const storedProjectionsEnabled = () => staticServing() && process.env.SERVING_CATALOG_PROJECTIONS_ENABLED === 'true';

export function derivePublicationProxyToken(adminToken: string) {
  if (!adminToken) throw new Error('Publication proxy key is not configured');
  return createHmac('sha256', adminToken).update('serving-publication:v1').digest('hex');
}

export class ServingPublicationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    let identity: ServingIdentity | undefined;
    const token = request.headers['x-site-publication-token'];
    const publicationId = request.headers['x-site-publication-id'];
    if (staticServing() && process.env.ADMIN_API_TOKEN && validId(publicationId) && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
      const expected = derivePublicationProxyToken(process.env.ADMIN_API_TOKEN);
      if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) identity = { publicationId };
    }
    return new Observable(subscriber => requestPublication.run(identity, () => next.handle().subscribe(subscriber)));
  }
}

export async function activeServing(timeoutMs = 10000): Promise<ActiveServingIdentity> {
  try {
    const base = new URL(process.env.STATIC_PUBLICATION_URL || '');
    const token = process.env.ADMIN_API_TOKEN;
    if (!token || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Private controller is not configured');
    const response = await fetch(`${base.href.replace(/\/$/, '')}/active`, { headers: { 'x-admin-token': token }, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status !== 200) throw new Error('Serving is unavailable');
    const identity = await response.json() as ActiveServingIdentity;
    if (!identity || !validId(identity.publicationId) || !validId(identity.siteId)
      || typeof identity.siteSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity.siteSlug)
      || !Number.isSafeInteger(identity.siteRevision) || identity.siteRevision! < 0
      || (identity.releaseSequence !== undefined && (!Number.isSafeInteger(identity.releaseSequence) || identity.releaseSequence < 1))
      || typeof identity.catalogDigest !== 'string' || !/^[a-f0-9]{64}$/.test(identity.catalogDigest)) throw new Error('Serving identity is invalid');
    return identity;
  } catch {
    throw new ServiceUnavailableException('Обслуживаемая публикация пока не подтверждена');
  }
}

export async function servingPublication(client: Pick<PrismaService, 'sitePublication'>, siteSlug: string) {
  return (await servingPublicationProof(client, siteSlug))?.publication ?? null;
}

export async function servingPublicationProof(client: Pick<PrismaService, 'sitePublication'>, siteSlug: string) {
  if (!staticServing()) return null;
  const identity = requestPublication.getStore() || await activeServing();
  return fullServingPublication(client, identity, siteSlug);
}

async function fullServingPublication(client: Pick<PrismaService, 'sitePublication'>, identity: ServingIdentity, siteSlug: string) {
  const publication = await client.sitePublication.findUnique({ where: { id: identity.publicationId } });
  const catalog = publication?.catalog as { site?: { slug?: unknown } } | undefined;
  const checked = checkedServingPublication(publication, identity, siteSlug, catalog?.site?.slug,
    () => catalogDigest(publication?.catalog ?? null));
  return { publication: checked, verifiedCatalogDigest: identity.catalogDigest ?? null };
}

type ServingPublicationRow = { id: string; status: string; siteId: string; siteRevision: number; releaseSequence: number };
type ServingProjectionClient = Pick<PrismaService, 'sitePublication' | '$queryRaw'>;
type FullServingPublication = Awaited<ReturnType<typeof fullServingPublication>>['publication'];

function checkedServingPublication<T extends ServingPublicationRow>(publication: T | null | undefined, identity: ServingIdentity,
  siteSlug: string, catalogSiteSlug: unknown, digest?: () => string): T {
  if (!publication || !['PENDING', 'RUNNING', 'SUCCEEDED'].includes(publication.status)) throw new ServiceUnavailableException('Обслуживаемый снимок недоступен');
  if (catalogSiteSlug !== siteSlug || (identity.siteSlug && identity.siteSlug !== siteSlug)) throw new NotFoundException('Published site not found');
  if ((identity.siteId && identity.siteId !== publication.siteId)
    || (identity.siteRevision !== undefined && identity.siteRevision !== publication.siteRevision)
    || (identity.releaseSequence !== undefined && identity.releaseSequence !== publication.releaseSequence)
    || (identity.catalogDigest && identity.catalogDigest !== digest?.())) {
    throw new ServiceUnavailableException('Обслуживаемый снимок не совпадает с подтверждённым каталогом');
  }
  return publication;
}

export async function readStoredProjection<T>(client: ServingProjectionClient, siteSlug: string,
  data: Prisma.Sql, fallback: (catalog: Prisma.JsonValue, publication: FullServingPublication) => T | Promise<T>, joins = Prisma.empty) {
  if (!storedProjectionsEnabled()) return null;
  const identity = requestPublication.getStore() || await activeServing();
  const [row] = await client.$queryRaw<Array<ServingPublicationRow & {
    validationId: string | null; catalogGeneration: number; digest: string | null; catalogSiteSlug: unknown; complete: boolean; data: T;
  }>>(Prisma.sql`
    SELECT p.id, p.status::text AS status, p."siteId", p."siteRevision", p."releaseSequence", p."validationId", p."catalogGeneration",
      projection."catalogDigest" AS digest, projection.site -> 'slug' AS "catalogSiteSlug",
      projection."cityCount" = (
        SELECT count(*) FROM "SitePublicationCityProjection" parts WHERE parts."publicationId" = projection."publicationId"
      ) AS complete,
      CASE WHEN projection."publicationId" IS NOT NULL
        AND p.status IN ('PENDING', 'RUNNING', 'SUCCEEDED')
        AND projection.site -> 'slug' = to_jsonb(${siteSlug}::text)
        AND (${identity.catalogDigest ?? null}::text IS NULL OR projection."catalogDigest" = ${identity.catalogDigest ?? null})
        THEN ${data} END AS data
    FROM "SitePublication" p
    LEFT JOIN "SitePublicationProjection" projection
      ON projection."publicationId" = p.id AND projection."catalogGeneration" = p."catalogGeneration"
      AND projection."formatVersion" = ${SERVING_CATALOG_PROJECTION_VERSION}
    ${joins}
    WHERE p.id = ${identity.publicationId}
  `);
  const digest = row?.digest;
  if (row && digest) {
    const publication = checkedServingPublication(row, identity, siteSlug, row.catalogSiteSlug, () => digest);
    if (publication.complete) return { publication, data: publication.data, verifiedCatalogDigest: digest };
  }
  // Read the same captured identity even when the controller switches in flight.
  const { publication, verifiedCatalogDigest } = await fullServingPublication(client, identity, siteSlug);
  return { publication, data: await fallback(publication.catalog, publication), verifiedCatalogDigest };
}

type CityValue = { cityFound: boolean; value: Record<string, unknown> | null };

export function selectFrozenCity(catalog: Record<string, unknown>, citySlug: string, tariffSlug?: string): CityValue {
  const cities = Array.isArray(catalog.cities) ? catalog.cities as Array<Record<string, unknown>> : [];
  const city = cities.find(item => item.slug === citySlug);
  if (!city || tariffSlug === undefined) return { cityFound: Boolean(city), value: city ?? null };
  const tariffs = Array.isArray(city.tariffs) ? city.tariffs as Array<Record<string, unknown>> : [];
  return { cityFound: true, value: tariffs.find(tariff => tariff.slug === tariffSlug) ?? null };
}

export async function servingCityProjection(client: ServingProjectionClient, siteSlug: string, citySlug: string, tariffSlug?: string) {
  const value = tariffSlug === undefined ? Prisma.sql`selected.city` : Prisma.sql`(
    SELECT tariff
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(selected.city -> 'tariffs') = 'array'
      THEN selected.city -> 'tariffs' ELSE '[]'::jsonb END) WITH ORDINALITY AS rows(tariff, ordinal)
    WHERE tariff -> 'slug' = to_jsonb(${tariffSlug}::text)
    ORDER BY ordinal LIMIT 1
  )`;
  const stored = await readStoredProjection<CityValue>(client, siteSlug,
    Prisma.sql`jsonb_build_object('cityFound', selected.city IS NOT NULL, 'value', ${value})`,
    catalog => selectFrozenCity(catalog as Record<string, unknown>, citySlug, tariffSlug),
    cityProjectionJoin(citySlug));
  if (stored) return stored.data;

  const identity = requestPublication.getStore();
  // Requests verified against /active still compare the SHA-256 of the entire catalog.
  if (!staticServing() || !identity || identity.catalogDigest) return null;
  const [publication] = await client.$queryRaw<Array<ServingPublicationRow & CityValue & {
    catalogSiteSlug: unknown;
  }>>(Prisma.sql`
    SELECT p.id, p.status::text AS status, p."siteId", p."siteRevision", p."releaseSequence",
           catalog.site -> 'slug' AS "catalogSiteSlug", selected.city IS NOT NULL AS "cityFound", ${value} AS value
    FROM "SitePublication" p
    CROSS JOIN LATERAL jsonb_to_record(CASE WHEN jsonb_typeof(p.catalog) = 'object'
      THEN p.catalog ELSE '{}'::jsonb END) AS catalog(site jsonb, cities jsonb)
    LEFT JOIN LATERAL (
      SELECT city
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(catalog.cities) = 'array'
        THEN catalog.cities ELSE '[]'::jsonb END) WITH ORDINALITY AS rows(city, ordinal)
      WHERE city -> 'slug' = to_jsonb(${citySlug}::text)
      ORDER BY ordinal LIMIT 1
    ) AS selected ON true
    WHERE p.id = ${identity.publicationId}
  `);
  return checkedServingPublication(publication, identity, siteSlug, publication?.catalogSiteSlug);
}

function cityProjectionJoin(citySlug: string) {
  return Prisma.sql`LEFT JOIN LATERAL (
    SELECT part.catalog AS city FROM "SitePublicationCityProjection" part
    WHERE part."publicationId" = projection."publicationId" AND part."citySlug" = ${citySlug}
  ) selected ON true`;
}

type FrozenPage = { id: string; slug: string; [key: string]: unknown };
type FrozenCity = { id: string; name: string; slug: string; region: { name: string; slug: string }; pages: FrozenPage[]; tariffs: Array<Record<string, unknown>> };
type FrozenSources = { site: { slug: string }; cities: FrozenCity[]; globalPages?: FrozenPage[] };
type GlobalSourceType = 'ACCOUNT' | 'OFFICIAL_SITE' | 'SPEED_TEST' | 'EQUIPMENT_ROUTER';

export function globalPageType(pageSlug?: string): GlobalSourceType | null {
  if (pageSlug === 'lichnyy-kabinet-dom-ru') return 'ACCOUNT';
  if (pageSlug === 'official-site-domru') return 'OFFICIAL_SITE';
  if (pageSlug === 'proverit-skorost-interneta') return 'SPEED_TEST';
  if (pageSlug === ROUTER_PAGE_SLUG) return 'EQUIPMENT_ROUTER';
  return null;
}

function selectGlobalPage(pages: FrozenPage[] | undefined, pageSlug: string | undefined, pageType: GlobalSourceType | null) {
  return pages?.find(item => item.slug === pageSlug && item.type === pageType) ?? null;
}

function projectedGlobalPage(pageSlug: string | undefined, pageType: GlobalSourceType | null) {
  if (pageSlug === undefined || pageType === null) return Prisma.sql`NULL::jsonb`;
  return Prisma.sql`(
    SELECT page FROM jsonb_array_elements(projection."globalPages") WITH ORDINALITY AS pages(page, ordinal)
    WHERE page -> 'slug' = to_jsonb(${pageSlug}::text) AND page -> 'type' = to_jsonb(${pageType}::text)
    ORDER BY ordinal LIMIT 1
  )`;
}

export function servingGlobalProjection(client: ServingProjectionClient, siteSlug: string, pageSlug: string | undefined, pageType: GlobalSourceType) {
  return readStoredProjection<{ site: FrozenSources['site']; page: FrozenPage | null; cities: Array<Pick<FrozenCity, 'id' | 'slug' | 'name' | 'region'>> }>(
    client, siteSlug, Prisma.sql`jsonb_build_object(
      'site', projection.site, 'page', ${projectedGlobalPage(pageSlug, pageType)}, 'cities', projection."addressCities"
    )`, raw => {
      const catalog = raw as FrozenSources;
      return { site: catalog.site, page: selectGlobalPage(catalog.globalPages, pageSlug, pageType), cities: catalog.cities };
    });
}

export function servingRedirectProjection(client: ServingProjectionClient, siteSlug: string, redirectId: string) {
  type RedirectView = { redirect: Record<string, unknown>; routeAllowed: boolean } | { catalog: Record<string, unknown> } | null;
  return readStoredProjection<RedirectView>(client, siteSlug, Prisma.sql`(
    SELECT item FROM jsonb_array_elements(projection.redirects) WITH ORDINALITY AS redirects(item, ordinal)
    WHERE item -> 'redirect' -> 'id' = to_jsonb(${redirectId}::text)
    ORDER BY ordinal LIMIT 1
  )`, catalog => ({ catalog: catalog as Record<string, unknown> }));
}

export async function servingEntities(client: ServingProjectionClient, siteSlug: string, citySlug: string, pageSlug?: string, pageScope?: 'GLOBAL') {
  const pageType = pageScope === 'GLOBAL' ? globalPageType(pageSlug) : null;
  const select = (raw: Prisma.JsonValue) => {
    const catalog = raw as FrozenSources;
    return { site: catalog.site, city: catalog.cities?.find(item => item.slug === citySlug),
      globalPage: pageType ? selectGlobalPage(catalog.globalPages, pageSlug, pageType) : null };
  };
  const stored = await readStoredProjection<ReturnType<typeof select>>(client, siteSlug,
    Prisma.sql`jsonb_build_object('site', projection.site, 'city', selected.city, 'globalPage', ${projectedGlobalPage(pageSlug, pageType)})`,
    select, cityProjectionJoin(citySlug));
  const full = stored ? null : await servingPublication(client, siteSlug);
  const publication = stored?.publication ?? full;
  const source = stored?.data ?? (full && select(full.catalog));
  if (!publication || !source) return null;
  const { site, city, globalPage } = source;
  if (!city || !validId(city.id)) throw new BadRequestException('Город недоступен в опубликованной версии');
  if (pageScope === 'GLOBAL' && !pageType) throw new BadRequestException('Неизвестная общая страница');
  const page = pageScope === 'GLOBAL' ? globalPage : pageSlug ? city.pages?.find(item => item.slug === pageSlug) : null;
  if (pageSlug && (!page || !validId(page.id))) throw new BadRequestException('Страница недоступна в опубликованной версии');
  return { publication, site: { ...site, id: publication.siteId }, city, page: page || null };
}

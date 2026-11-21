import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { readStoredProjection, servingPublication, servingPublicationProof } from './serving-publication-context';
import type { CatalogSource } from './site-catalog.service';
import { emptyEditorial, type EditorialKind, type EditorialSource } from './editorial-publication-model';
import { editorialPreviewShell } from './editorial-preview-model';
import { editorialPublicUrl } from './editorial-live-url';
import type { NewsRouteSource } from './news-projection';

type EditorialClient = PrismaService | Prisma.TransactionClient;
type EditorialSite = { id: string; slug: string };
type EditorialSourceQuery = (validationId: string | Prisma.Sql) => Prisma.Sql;
type PublishedArticle = Record<string, unknown> & { id: string };
type PublishedCategory = { id: string; slug: string; revision: number; name: string };

function missingSource() {
  return new ConflictException('Исходные данные опубликованного снимка недоступны. Выпуск остановлен без подмены рабочей версией.');
}

function validatedPublication<T extends { siteId: string; validationId: string | null }>(publication: T | null, site: EditorialSite) {
  if (!publication || publication.siteId !== site.id || !publication.validationId) {
    throw new ConflictException('Для независимого выпуска нужен подтверждённый опубликованный снимок с исходными данными. Рабочие изменения не подставлены.');
  }
  return { publication, validationId: publication.validationId };
}

async function resolveEditorialPublication(client: EditorialClient, site: EditorialSite) {
  const active = await servingPublication(client, site.slug);
  const publication = active ?? await client.sitePublication.findFirst({
    where: { siteId: site.id, status: 'SUCCEEDED' },
    orderBy: { releaseSequence: 'desc' },
  });
  return validatedPublication(publication, site);
}

async function resolveEditorialWorkingPreviewPublication(client: EditorialClient, site: EditorialSite) {
  const active = await servingPublicationProof(client, site.slug);
  if (active) return { ...validatedPublication(active.publication, site), verifiedCatalogDigest: active.verifiedCatalogDigest };
  const publication = await client.sitePublication.findFirst({
    where: { siteId: site.id, status: 'SUCCEEDED' }, orderBy: { releaseSequence: 'desc' },
    select: { id: true, siteId: true, releaseSequence: true, validationId: true, catalogGeneration: true },
  });
  return { ...validatedPublication(publication, site), verifiedCatalogDigest: null };
}

async function fullEditorialSnapshot(client: EditorialClient, site: EditorialSite, validationId: string) {
  const validation = await client.sitePublicationValidation.findUnique({ where: { id: validationId } });
  const source = validation?.sourceSnapshot as unknown as CatalogSource;
  if (!source?.site || source.site.id !== site.id || !Array.isArray(source.cities) || !Array.isArray(source.globalPages)) throw missingSource();
  return structuredClone(source);
}

// Mutation, review and legacy preview work on an independent copy of the full source.
export async function editorialServingSource(client: EditorialClient, site: EditorialSite) {
  const { publication, validationId } = await resolveEditorialPublication(client, site);
  return { publication, source: await fullEditorialSnapshot(client, site, validationId) };
}

const sourceArticles = Prisma.sql`CASE WHEN jsonb_typeof(source.editorial -> 'articles') = 'array'
  THEN source.editorial -> 'articles' ELSE '[]'::jsonb END`;

async function readEditorialProjection<T>(client: EditorialClient, site: EditorialSite, columns: Prisma.Sql) {
  return (await readEditorialView<T>(client, site, columns)).data;
}

function editorialProjectionQuery(site: EditorialSite, validationId: string | Prisma.Sql, columns: Prisma.Sql) {
  return Prisma.sql`
    SELECT ${columns}
    FROM "SitePublicationValidation" validation
    CROSS JOIN LATERAL jsonb_to_record(
      CASE WHEN jsonb_typeof(validation."sourceSnapshot") = 'object'
        THEN validation."sourceSnapshot" ELSE '{}'::jsonb END
    ) AS source(site jsonb, cities jsonb, "globalPages" jsonb, editorial jsonb)
    WHERE validation.id = ${validationId}
      AND source.site -> 'id' = to_jsonb(${site.id}::text)
      AND jsonb_typeof(source.cities) = 'array'
      AND jsonb_typeof(source."globalPages") = 'array'
      AND COALESCE(jsonb_typeof(source.editorial -> 'articles'), 'null') IN ('array', 'null')
  `;
}

const storedPreviewShell = Prisma.sql` || jsonb_build_object('catalogShell', (
  SELECT CASE WHEN jsonb_typeof(shell.cities) = 'array' AND jsonb_typeof(shell.routes) = 'array'
    THEN jsonb_build_object(
      'site', projection.site,
      'cities', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('slug', city -> 'slug', 'name', city -> 'name', 'status', city -> 'status')
          ORDER BY ordinal)
        FROM jsonb_array_elements(shell.cities) WITH ORDINALITY AS items(city, ordinal)
      ), '[]'::jsonb),
      'routes', COALESCE((
        SELECT jsonb_agg(route ORDER BY ordinal)
        FROM jsonb_array_elements(shell.routes) WITH ORDINALITY AS items(route, ordinal)
        WHERE route ->> 'kind' IN ('HOME', 'GLOBAL_PAGE', 'CITY_ADDRESS_CHECK') OR route ->> 'path' = '/news'
      ), '[]'::jsonb)
    ) END
  FROM jsonb_to_record(p.catalog) shell(cities jsonb, routes jsonb)
))`;

async function readEditorialView<T>(client: EditorialClient, site: EditorialSite, selection: Prisma.Sql | EditorialSourceQuery, options: {
  shell?: boolean;
  compactLegacy?: boolean;
  missing?: (validationId: string) => Promise<T>;
} = {}) {
  const query = typeof selection === 'function' ? selection
    : (validationId: string | Prisma.Sql) => editorialProjectionQuery(site, validationId, selection);
  const readExact = async (validationId: string) => {
    const [data] = await client.$queryRaw<T[]>(query(validationId));
    if (data) return data;
    if (options.missing) return options.missing(validationId);
    throw missingSource();
  };
  // The source link, catalog generation, and seal must come from the same SQL statement.
  const validatedSource = query(Prisma.sql`p."validationId"`);
  const stored = await readStoredProjection<T | null>(client, site.slug, Prisma.sql`(
    SELECT to_jsonb(selected) ${options.shell ? storedPreviewShell : Prisma.empty}
    FROM (${validatedSource}) selected
    WHERE p."catalogGeneration" = projection."catalogGeneration"
  )`, (_catalog, publication) => readExact(validatedPublication(publication, site).validationId));
  if (stored) {
    const identity = validatedPublication(stored.publication, site);
    const data = stored.data ?? await options.missing?.(identity.validationId);
    if (!data) throw missingSource();
    return { ...identity, data, verifiedCatalogDigest: stored.verifiedCatalogDigest };
  }
  const identity = options.compactLegacy ? await resolveEditorialWorkingPreviewPublication(client, site)
    : { ...await resolveEditorialPublication(client, site), verifiedCatalogDigest: null };
  return { ...identity, data: await readExact(identity.validationId) };
}

export async function editorialServingSettings(client: EditorialClient, site: EditorialSite,
  kind: Extract<EditorialKind, 'NEWS_SETTINGS' | 'NOT_FOUND'>) {
  const field = kind === 'NEWS_SETTINGS' ? 'settings' : 'notFound';
  type SettingsSource = {
    domain: CatalogSource['site']['domain'];
    editorial?: Pick<EditorialSource, 'newsEnabled' | 'settings' | 'notFound'> | null;
    requiresFullSource?: boolean;
  };
  const loadExactSource = async (validationId: string): Promise<SettingsSource> => {
    const source = await fullEditorialSnapshot(client, site, validationId);
    return { domain: source.site.domain, editorial: source.editorial };
  };
  const { data, validationId } = await readEditorialView<SettingsSource>(client, site, Prisma.sql`
    source.site -> 'domain' AS domain,
    CASE WHEN jsonb_typeof(source.editorial) = 'object' THEN jsonb_build_object(
      'newsEnabled', source.editorial -> 'newsEnabled', ${field}::text, source.editorial -> ${field}::text
    ) END AS editorial,
    COALESCE(jsonb_typeof(source.editorial), 'null') NOT IN ('object', 'null') AS "requiresFullSource"
  `, { compactLegacy: true, missing: loadExactSource });
  const { domain, editorial } = data.requiresFullSource ? await loadExactSource(validationId) : data;
  if (kind === 'NOT_FOUND') return { published: editorial?.notFound ?? null, publicUrl: null };
  return editorial && editorial.newsEnabled !== false
    ? { published: editorial.settings ?? null, publicUrl: editorialPublicUrl(domain, '/news') }
    : { published: null, publicUrl: null };
}

export async function editorialServingPreview(
  client: EditorialClient,
  site: EditorialSite,
  kind: EditorialKind,
  detailId: string | null,
) {
  const columns = kind === 'NOT_FOUND'
    ? Prisma.sql`CASE WHEN jsonb_typeof(source.editorial) = 'object'
        THEN jsonb_build_object('notFound', source.editorial -> 'notFound') END AS editorial`
    : Prisma.sql`CASE WHEN jsonb_typeof(source.editorial) = 'object' THEN jsonb_build_object(
      'version', source.editorial -> 'version',
      'newsEnabled', source.editorial -> 'newsEnabled',
      'settings', source.editorial -> 'settings',
      'notFound', NULL::jsonb,
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', category -> 'id', 'slug', category -> 'slug', 'revision', category -> 'revision',
          'name', category -> 'name', 'description', category -> 'description'
        ) ORDER BY ordinal)
        FROM jsonb_array_elements(source.editorial -> 'categories') WITH ORDINALITY AS items(category, ordinal)
      ), '[]'::jsonb),
      'articles', COALESCE((
        SELECT jsonb_agg(CASE WHEN article -> 'id' = to_jsonb(${detailId}::text) THEN article ELSE jsonb_build_object(
          'id', article -> 'id', 'slug', article -> 'slug', 'revision', article -> 'revision',
          'categoryId', article -> 'categoryId', 'publishedDate', article -> 'publishedDate',
          'title', article -> 'title', 'summary', article -> 'summary', 'cover', article -> 'cover'
        ) END ORDER BY ordinal)
        FROM jsonb_array_elements(${sourceArticles}) WITH ORDINALITY AS items(article, ordinal)
      ), '[]'::jsonb)
    ) END AS editorial`;
  const { publication, validationId, data } = await readEditorialView<{
    editorial: EditorialSource | null; catalogShell?: unknown;
  }>(client, site, columns, { shell: true });
  const { editorial } = data;
  return {
    publication,
    previewShell: editorialPreviewShell('catalog' in publication ? publication.catalog : data.catalogShell),
    editorial: editorial && kind === 'NOT_FOUND' ? { ...emptyEditorial(), notFound: editorial.notFound } : editorial ?? undefined,
    loadHistoricalSource: () => fullEditorialSnapshot(client, site, validationId),
  };
}

export async function editorialServingRouteInventory(client: EditorialClient, site: EditorialSite) {
  const { publication, data } = await readEditorialView<{ editorial: NewsRouteSource | null }>(client, site, Prisma.sql`
    CASE WHEN jsonb_typeof(source.editorial) = 'object' THEN jsonb_build_object(
      'newsEnabled', source.editorial -> 'newsEnabled',
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', category -> 'id', 'slug', category -> 'slug') ORDER BY ordinal)
        FROM jsonb_array_elements(source.editorial -> 'categories') WITH ORDINALITY AS items(category, ordinal)
      ), '[]'::jsonb),
      'articles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('slug', article -> 'slug', 'categoryId', article -> 'categoryId') ORDER BY ordinal)
        FROM jsonb_array_elements(${sourceArticles}) WITH ORDINALITY AS items(article, ordinal)
      ), '[]'::jsonb)
    ) END AS editorial
  `, { compactLegacy: true });
  return { publicationId: publication.id, editorial: data.editorial ?? undefined };
}

export async function editorialServingWorkingPreviewBase(client: EditorialClient, site: EditorialSite) {
  // Only the shape of the large city/page branches is needed for this read.
  const query: EditorialSourceQuery = validationId => Prisma.sql`
    SELECT source.editorial, source.redirects
    FROM "SitePublicationValidation" validation
    CROSS JOIN LATERAL JSON_TABLE(validation."sourceSnapshot", 'strict $ ? (@.type() == "object")' COLUMNS (
      site jsonb FORMAT JSON PATH 'strict $.site' NULL ON EMPTY NULL ON ERROR,
      "citiesType" text PATH 'strict $.cities.type()' NULL ON EMPTY NULL ON ERROR,
      "globalPagesType" text PATH 'strict $.globalPages.type()' NULL ON EMPTY NULL ON ERROR,
      "articlesType" text PATH 'strict $.editorial.articles.type()' NULL ON EMPTY NULL ON ERROR,
      editorial jsonb FORMAT JSON PATH 'strict $.editorial' NULL ON EMPTY NULL ON ERROR,
      redirects jsonb FORMAT JSON PATH 'strict $.redirects' NULL ON EMPTY NULL ON ERROR
    )) AS source
    WHERE validation.id = ${validationId}
      AND source.site -> 'id' = to_jsonb(${site.id}::text)
      AND source."citiesType" = 'array'
      AND source."globalPagesType" = 'array'
      AND COALESCE(source."articlesType", 'null') IN ('array', 'null')
  `;
  const { publication, validationId, data, verifiedCatalogDigest } = await readEditorialView<Pick<CatalogSource, 'editorial' | 'redirects'>>(
    client, site, query, { compactLegacy: true, missing: id => fullEditorialSnapshot(client, site, id) },
  );
  // Historical malformed redirects follow the original capture of this exact validation.
  const source = Array.isArray(data.redirects) ? data : await fullEditorialSnapshot(client, site, validationId);
  return { publication, source, verifiedCatalogDigest };
}

export async function editorialServingArticles(client: EditorialClient, site: EditorialSite, ids: readonly string[]) {
  const articles = ids.length ? Prisma.sql`COALESCE((
    SELECT jsonb_agg(article ORDER BY ordinal)
    FROM jsonb_array_elements(${sourceArticles}) WITH ORDINALITY AS items(article, ordinal)
    WHERE article ->> 'id' IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))
  ), '[]'::jsonb)` : Prisma.sql`'[]'::jsonb`;
  return (await readEditorialProjection<{ articles: PublishedArticle[] }>(client, site, Prisma.sql`${articles} AS articles`)).articles;
}

export async function editorialServingCategories(client: EditorialClient, site: EditorialSite) {
  return readEditorialProjection<{
    domain: string | null;
    newsEnabled: boolean | null;
    categories: Array<PublishedCategory> | null;
    liveCounts: Record<string, number>;
  }>(client, site, Prisma.sql`
    source.site ->> 'domain' AS domain,
    source.editorial -> 'newsEnabled' AS "newsEnabled",
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', category -> 'id', 'slug', category -> 'slug',
        'revision', category -> 'revision', 'name', category -> 'name'
      ) ORDER BY ordinal)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(source.editorial -> 'categories') = 'array'
        THEN source.editorial -> 'categories' ELSE '[]'::jsonb END)
      WITH ORDINALITY AS items(category, ordinal)
    ) AS categories,
    COALESCE((
      SELECT jsonb_object_agg(category, total)
      FROM (
        SELECT article ->> 'categoryId' AS category, count(*) AS total
        FROM jsonb_array_elements(${sourceArticles}) AS items(article)
        WHERE jsonb_typeof(article -> 'categoryId') = 'string'
        GROUP BY article ->> 'categoryId'
      ) counts
    ), '{}'::jsonb) AS "liveCounts"
  `);
}

export async function editorialServingArticleOptions(client: EditorialClient, site: EditorialSite) {
  return (await readEditorialProjection<{ articles: PublishedArticle[] }>(client, site, Prisma.sql`
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', article -> 'id', 'title', article -> 'title', 'slug', article -> 'slug',
        'categoryId', article -> 'categoryId', 'publishedDate', article -> 'publishedDate'
      ) ORDER BY ordinal)
      FROM jsonb_array_elements(${sourceArticles}) WITH ORDINALITY AS items(article, ordinal)
    ), '[]'::jsonb) AS articles
  `)).articles;
}

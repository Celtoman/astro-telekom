import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { readStoredProjection, servingPublication } from './serving-publication-context';
import type { CatalogSource } from './site-catalog.service';
import { emptyEditorial, type EditorialKind, type EditorialSource } from './editorial-publication-model';
import { editorialPreviewShell } from './editorial-preview-model';

type EditorialClient = PrismaService | Prisma.TransactionClient;
type EditorialSite = { id: string; slug: string };
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

async function readProjection<T>(client: EditorialClient, site: EditorialSite, validationId: string, columns: Prisma.Sql) {
  const [result] = await client.$queryRaw<T[]>(editorialProjectionQuery(site, validationId, columns));
  if (!result) throw missingSource();
  return result;
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

async function readEditorialView<T>(client: EditorialClient, site: EditorialSite, columns: Prisma.Sql, preview = false) {
  // The source link, catalog generation, and seal must come from the same SQL statement.
  const validatedSource = editorialProjectionQuery(site, Prisma.sql`p."validationId"`, columns);
  const stored = await readStoredProjection<T | null>(client, site.slug, Prisma.sql`(
    SELECT to_jsonb(selected) ${preview ? storedPreviewShell : Prisma.empty}
    FROM (${validatedSource}) selected
    WHERE p."catalogGeneration" = projection."catalogGeneration"
  )`, (_catalog, publication) => readProjection<T>(client, site, validatedPublication(publication, site).validationId, columns));
  if (stored) {
    const identity = validatedPublication(stored.publication, site);
    if (!stored.data) throw missingSource();
    return { ...identity, data: stored.data };
  }
  const { publication, validationId } = await resolveEditorialPublication(client, site);
  return { publication, validationId, data: await readProjection<T>(client, site, validationId, columns) };
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
  }>(client, site, columns, true);
  const { editorial } = data;
  return {
    publication,
    previewShell: editorialPreviewShell('catalog' in publication ? publication.catalog : data.catalogShell),
    editorial: editorial && kind === 'NOT_FOUND' ? { ...emptyEditorial(), notFound: editorial.notFound } : editorial ?? undefined,
    loadHistoricalSource: () => fullEditorialSnapshot(client, site, validationId),
  };
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

import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { servingPublication } from './serving-publication-context';
import type { CatalogSource } from './site-catalog.service';

type EditorialClient = PrismaService | Prisma.TransactionClient;
type EditorialSite = { id: string; slug: string };
type PublishedArticle = Record<string, unknown> & { id: string };
type PublishedCategory = { id: string; slug: string; revision: number; name: string };

function missingSource() {
  return new ConflictException('Исходные данные опубликованного снимка недоступны. Выпуск остановлен без подмены рабочей версией.');
}

async function resolveEditorialPublication(client: EditorialClient, site: EditorialSite) {
  const active = await servingPublication(client, site.slug);
  const publication = active ?? await client.sitePublication.findFirst({
    where: { siteId: site.id, status: 'SUCCEEDED' },
    orderBy: { releaseSequence: 'desc' },
  });
  if (!publication || publication.siteId !== site.id || !publication.validationId) {
    throw new ConflictException('Для независимого выпуска нужен подтверждённый опубликованный снимок с исходными данными. Рабочие изменения не подставлены.');
  }
  return { publication, validationId: publication.validationId };
}

// Mutation, review and preview still work on an independent copy of the full source.
export async function editorialServingSource(client: EditorialClient, site: EditorialSite) {
  const { publication, validationId } = await resolveEditorialPublication(client, site);
  const validation = await client.sitePublicationValidation.findUnique({ where: { id: validationId } });
  const source = validation?.sourceSnapshot as unknown as CatalogSource;
  if (!source?.site || source.site.id !== site.id || !Array.isArray(source.cities) || !Array.isArray(source.globalPages)) throw missingSource();
  return { publication, source: structuredClone(source) };
}

const sourceArticles = Prisma.sql`CASE WHEN jsonb_typeof(source.editorial -> 'articles') = 'array'
  THEN source.editorial -> 'articles' ELSE '[]'::jsonb END`;

async function readEditorialProjection<T>(client: EditorialClient, site: EditorialSite, columns: Prisma.Sql) {
  const { validationId } = await resolveEditorialPublication(client, site);
  const [result] = await client.$queryRaw<T[]>(Prisma.sql`
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
  `);
  if (!result) throw missingSource();
  return result;
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

import { ConflictException } from '@nestjs/common';
import type { VariableUsage } from './catalog-variables';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';

// The admin comparison uses the latest SQL-confirmed snapshot. The public
// serving path can already use an activated RUNNING release before SQL ACK.
const latestConfirmedPublication = (siteFilter: Prisma.Sql) => Prisma.sql`
  SELECT p.id, p.catalog FROM "SitePublication" p JOIN "Site" s ON s.id = p."siteId"
  WHERE ${siteFilter} AND s.status = 'PUBLISHED' AND p.status = 'SUCCEEDED'
  ORDER BY p."releaseSequence" DESC LIMIT 1
`;

export async function publishedVariableContext(
  prisma: PrismaService, siteSlug: string, cityId?: string, includeUsages = true,
): Promise<Record<string, any> | null> {
  const usageFields = includeUsages ? Prisma.sql`'variableUsages', p.catalog -> 'variableUsages',`
    : Prisma.sql`'publicationId', p.id,
      'publishedUsageAvailable', COALESCE(jsonb_typeof(p.catalog -> 'variableUsages') = 'array', false),`;
  const rows = await prisma.$queryRaw<{ catalog: Record<string, any> }[]>(Prisma.sql`
    SELECT jsonb_build_object(
      'site', p.catalog -> 'site',
      'variableSources', p.catalog -> 'variableSources',
      'variableUsageVersion', p.catalog -> 'variableUsageVersion',
      ${usageFields}
      'cities', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', city -> 'id', 'name', city -> 'name', 'slug', city -> 'slug',
          'nameGenitive', city -> 'nameGenitive', 'namePrepositional', city -> 'namePrepositional',
          'tariffs', CASE WHEN city ->> 'id' = ${cityId ?? null} THEN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', tariff -> 'id', 'name', tariff -> 'name', 'slug', tariff -> 'slug',
              'speed', tariff -> 'speed', 'standardPrice', tariff -> 'standardPrice',
              'promoPrice', tariff -> 'promoPrice', 'attributes', tariff -> 'attributes'
            )) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(city -> 'tariffs') = 'array' THEN city -> 'tariffs' ELSE '[]'::jsonb END) tariff
          ), '[]'::jsonb) ELSE '[]'::jsonb END
        )) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.catalog -> 'cities') = 'array' THEN p.catalog -> 'cities' ELSE '[]'::jsonb END) city
      ), '[]'::jsonb)
    ) AS catalog
    FROM (${latestConfirmedPublication(Prisma.sql`s.slug = ${siteSlug}`)}) p
  `);
  return rows[0]?.catalog ?? null;
}

export interface PublishedVariableUsagePage {
  code: string;
  offset: number;
  pageSize: number;
}

export interface PublishedUsageData {
  counts?: Record<string, number>;
  items?: VariableUsage[];
  total?: number;
}

export async function publishedVariableUsages(
  prisma: PrismaService, siteId: string, publicationId: string | null, page?: PublishedVariableUsagePage,
): Promise<PublishedUsageData | null> {
  const evidence = Prisma.sql`jsonb_array_elements(p.catalog -> 'variableUsages') WITH ORDINALITY AS entries(usage, ordinal)`;
  const projection = page ? Prisma.sql`(
    WITH matching AS MATERIALIZED (
      SELECT usage, ordinal FROM ${evidence} WHERE usage ->> 'code' = ${page.code}
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM matching),
      'items', (SELECT COALESCE(jsonb_agg(usage ORDER BY ordinal), '[]'::jsonb) FROM (
        SELECT usage, ordinal FROM matching ORDER BY ordinal LIMIT ${page.pageSize} OFFSET ${page.offset}
      ) selected)
    )
  )` : Prisma.sql`(
    SELECT jsonb_build_object('counts', COALESCE(jsonb_object_agg(code, quantity), '{}'::jsonb))
    FROM (
      SELECT usage ->> 'code' AS code, count(*) AS quantity FROM ${evidence}
      WHERE jsonb_typeof(usage -> 'code') = 'string' GROUP BY usage ->> 'code'
    ) grouped
  )`;
  const [row] = await prisma.$queryRaw<{ publicationId: string; data: PublishedUsageData | null }[]>(Prisma.sql`
    SELECT p.id AS "publicationId",
      CASE WHEN p.id = ${publicationId} AND jsonb_typeof(p.catalog -> 'variableUsages') = 'array'
        THEN ${projection} END AS data
    FROM (${latestConfirmedPublication(Prisma.sql`s.id = ${siteId}`)}) p
  `);
  if ((row?.publicationId ?? null) !== publicationId) {
    throw new ConflictException('Опубликованный снимок изменился; обновите каталог переменных');
  }
  return row?.data ?? null;
}

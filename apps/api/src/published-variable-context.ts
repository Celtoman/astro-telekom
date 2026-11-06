import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';

// Keep the city selector and immutable usage evidence, but only transfer tariff
// values for the selected city. No pages, SEO reports or other cities' tariffs.
export async function publishedVariableContext(prisma: PrismaService, siteSlug: string, cityId?: string): Promise<Record<string, any> | null> {
  const rows = await prisma.$queryRaw<{ catalog: Record<string, any> }[]>(Prisma.sql`
    SELECT jsonb_build_object(
      'site', p.catalog -> 'site',
      'variableSources', p.catalog -> 'variableSources',
      'variableUsageVersion', p.catalog -> 'variableUsageVersion',
      'variableUsages', p.catalog -> 'variableUsages',
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
    FROM "SitePublication" p JOIN "Site" s ON s.id = p."siteId"
    WHERE s.slug = ${siteSlug} AND s.status = 'PUBLISHED' AND p.status = 'SUCCEEDED'
    ORDER BY p."releaseSequence" DESC LIMIT 1
  `);
  return rows[0]?.catalog ?? null;
}

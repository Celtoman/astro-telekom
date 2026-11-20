import { Prisma } from '../generated';

// Match every database input of SiteCatalogService.loadSource. Row content is used
// instead of ORM timestamps or MVCC tuple addresses, including for imported data.
export async function readWorkingPreviewFingerprint(client: Pick<Prisma.TransactionClient, '$queryRaw'>, siteId: string) {
  const [row] = await client.$queryRaw<Array<{ digest: string }>>(Prisma.sql`
    WITH cities AS (
      SELECT id, "regionId" FROM "City" WHERE "siteId" = ${siteId} AND status = 'PUBLISHED'
    ), pages AS (
      SELECT id FROM "Page" WHERE status = 'PUBLISHED'
        AND (("cityId" IS NULL AND "siteId" = ${siteId}) OR "cityId" IN (SELECT id FROM cities))
    ), inputs(kind, id, payload) AS (
      SELECT 'site', s.id, row_to_json(s)::text FROM "Site" s WHERE s.id = ${siteId}
      UNION ALL SELECT 'provider', p.id, jsonb_build_array(p.name, p.settings)::text
        FROM "Provider" p JOIN "Site" s ON s.id = ${siteId} AND s."providerId" = p.id
      UNION ALL SELECT 'region', r.id, jsonb_build_array(r.name, r.slug)::text
        FROM "Region" r WHERE r.id IN (SELECT "regionId" FROM cities)
      UNION ALL SELECT 'city', c.id, row_to_json(c)::text FROM "City" c WHERE c.id IN (SELECT id FROM cities)
      UNION ALL SELECT 'page', p.id, row_to_json(p)::text FROM "Page" p WHERE p.id IN (SELECT id FROM pages)
      UNION ALL SELECT 'block', b.id, row_to_json(b)::text FROM "PageBlock" b
        WHERE b."pageId" IN (SELECT id FROM pages) AND b.visible AND b."archivedAt" IS NULL
      UNION ALL SELECT 'tariff', t.id, row_to_json(t)::text FROM "Tariff" t
        WHERE t."cityId" IN (SELECT id FROM cities) AND t.status = 'PUBLISHED' AND t.availability = 'ACTIVE'
      UNION ALL SELECT 'template', t.id, row_to_json(t)::text FROM "PageTemplate" t WHERE t."siteId" = ${siteId}
      UNION ALL SELECT 'templateBlock', b.id, row_to_json(b)::text FROM "PageTemplateBlock" b
        JOIN "PageTemplate" t ON t.id = b."templateId" AND t."siteId" = ${siteId}
      UNION ALL SELECT 'seo', t.id, row_to_json(t)::text FROM "SeoTemplate" t WHERE t."siteId" = ${siteId}
      UNION ALL SELECT 'sitemap', e.id, to_jsonb(e.path)::text FROM "SitemapExclusion" e WHERE e."siteId" = ${siteId}
      UNION ALL SELECT 'redirect', r.id, jsonb_build_array(r."sourcePath", r."targetPath", r.status)::text
        FROM "Redirect" r WHERE r."siteId" = ${siteId} AND r.status = 'PUBLISHED'
      UNION ALL SELECT 'media', m.id, jsonb_build_array(m.ready, m.derivatives)::text
        FROM "MediaAsset" m WHERE m."siteId" = ${siteId}
    )
    SELECT encode(sha256(convert_to(COALESCE(string_agg(
      jsonb_build_array(kind, id, encode(sha256(convert_to(payload, 'UTF8')), 'hex'))::text,
      E'\n' ORDER BY kind COLLATE "C", id COLLATE "C"
    ), ''), 'UTF8')), 'hex') AS digest FROM inputs
  `);
  return row.digest;
}

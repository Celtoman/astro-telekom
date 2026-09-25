BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE "Page", "PageBlock", "City", "Site", "ContentRevision", "AuditEvent",
  "SitePublication", "SiteRebuild" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_home_template_candidates" ON COMMIT DROP AS
SELECT page."id" AS "pageId", page."siteId", city."namePrepositional",
  jsonb_build_object(
    'title', replace(page."title", city."namePrepositional", '{CITY_NAME_PREPOSITIONAL}'),
    'content', COALESCE(page."content", '{}'::jsonb),
    'seo', COALESCE(page."seo", '{}'::jsonb),
    'blocks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'blockType', block."blockType", 'position', block."position",
        'visible', block."visible",
        'data', replace(block."data"::text, city."namePrepositional", '{CITY_NAME_PREPOSITIONAL}')::jsonb
      ) ORDER BY block."position", block."id")
      FROM "PageBlock" AS block
      WHERE block."pageId" = page."id" AND block."archivedAt" IS NULL AND block."visible" = true
    ), '[]'::jsonb)
  ) AS "normalized"
FROM "Page" AS page
JOIN "City" AS city ON city."id" = page."cityId"
WHERE page."type" = 'HOME' AND page."status" = 'PUBLISHED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Page" AS page
    JOIN "City" AS city ON city."id" = page."cityId"
    WHERE page."type" = 'HOME' AND page."status" = 'PUBLISHED'
      AND (city."namePrepositional" IS NULL OR btrim(city."namePrepositional") = '')
  ) THEN
    RAISE EXCEPTION 'Published city HOME is missing namePrepositional; PageTemplate backfill stopped';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "_home_template_candidates"
    GROUP BY "siteId" HAVING count(DISTINCT "normalized") <> 1
  ) THEN
    RAISE EXCEPTION 'Published city HOME content differs after city normalization; PageTemplate backfill stopped';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "_home_template_candidates"
    WHERE jsonb_array_length("normalized"->'blocks') <> 7
  ) THEN
    RAISE EXCEPTION 'Published city HOME does not have seven visible blocks; PageTemplate backfill stopped';
  END IF;
END $$;

CREATE TEMP TABLE "_home_template_sites" ON COMMIT DROP AS
SELECT DISTINCT ON (candidate."siteId")
  candidate."siteId", candidate."normalized",
  'page_template_city_home_' || md5(candidate."siteId") AS "templateId",
  site."workingRevision" AS "previousRevision",
  site."workingRevision" + 1 AS "nextRevision"
FROM "_home_template_candidates" AS candidate
JOIN "Site" AS site ON site."id" = candidate."siteId"
ORDER BY candidate."siteId", candidate."pageId";

INSERT INTO "PageTemplate" ("id", "siteId", "kind", "titleTemplate", "status", "content", "seo", "updatedAt")
SELECT "templateId", "siteId", 'CITY_HOME', "normalized"->>'title', 'PUBLISHED',
  "normalized"->'content', "normalized"->'seo', CURRENT_TIMESTAMP
FROM "_home_template_sites";

INSERT INTO "PageTemplateBlock" ("id", "templateId", "blockType", "position", "visible", "data", "source")
SELECT 'page_template_block_' || md5(site."templateId" || ':' || (block.item->>'position')),
  site."templateId", block.item->>'blockType', (block.item->>'position')::integer,
  true, block.item->'data', 'template:city-home:v1'
FROM "_home_template_sites" AS site
CROSS JOIN LATERAL jsonb_array_elements(site."normalized"->'blocks') AS block(item);

UPDATE "Page" AS page SET "templateId" = site."templateId"
FROM "_home_template_sites" AS site
WHERE page."siteId" = site."siteId" AND page."type" = 'HOME' AND page."status" = 'PUBLISHED';

UPDATE "Site" AS site SET "workingRevision" = source."nextRevision", "updatedAt" = CURRENT_TIMESTAMP
FROM "_home_template_sites" AS source WHERE site."id" = source."siteId";

INSERT INTO "ContentRevision" (
  "id", "siteId", "entityType", "entityId", "entityRevision", "siteRevision",
  "action", "previousSnapshot", "snapshot", "changedFields", "source", "actorId", "createdAt"
)
SELECT 'migration_0053_revision_' || md5(source."siteId"), source."siteId", 'PAGE_TEMPLATE',
  source."templateId", 1, source."nextRevision", 'CREATE', NULL,
  jsonb_build_object('kind', 'CITY_HOME', 'titleTemplate', source."normalized"->'title',
    'content', source."normalized"->'content', 'seo', source."normalized"->'seo',
    'blocks', source."normalized"->'blocks'),
  '["titleTemplate","content","seo","blocks"]'::jsonb,
  'migration:0053_page_template_home_backfill', NULL, CURRENT_TIMESTAMP
FROM "_home_template_sites" AS source;

INSERT INTO "AuditEvent" (
  "id", "siteId", "siteRevision", "entityType", "entityId", "action",
  "changedFields", "changes", "source", "actorId", "createdAt"
)
SELECT 'migration_0053_audit_' || md5(source."siteId"), source."siteId", source."nextRevision",
  'PAGE_TEMPLATE', source."templateId", 'CREATE',
  '["titleTemplate","content","seo","blocks"]'::jsonb,
  jsonb_build_object('publishedHomeCount', (
    SELECT count(*) FROM "_home_template_candidates" AS candidate WHERE candidate."siteId" = source."siteId"
  )),
  'migration:0053_page_template_home_backfill', NULL, CURRENT_TIMESTAMP
FROM "_home_template_sites" AS source;

COMMIT;

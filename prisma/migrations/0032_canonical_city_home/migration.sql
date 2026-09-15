-- Canonicalize the known Release 1 duplicate HOME shape without guessing which
-- payload should survive. Any unexpected city or payload shape aborts the whole
-- migration before the first persistent write.
BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- Freeze every table whose state is validated or rewritten below. Reads remain
-- available, while concurrent CMS writes fail or wait outside this bounded
-- migration window instead of racing the preflight checks.
LOCK TABLE
  "Page",
  "PageBlock",
  "Site",
  "ContentRevision",
  "AuditEvent",
  "Lead",
  "AddressCheck",
  "SitePublication",
  "SiteRebuild"
IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SitePublication"
    WHERE "status" IN ('SCHEDULED', 'PENDING', 'RUNNING')
  ) OR EXISTS (
    SELECT 1
    FROM "SiteRebuild"
    WHERE "status" IN ('PENDING', 'QUEUED', 'RUNNING', 'RETRYING')
  ) THEN
    RAISE EXCEPTION '0032 canonical city HOME: active publication or rebuild must finish before migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "City" AS city
    LEFT JOIN "Page" AS page
      ON page."cityId" = city."id"
      AND page."type" = 'HOME'
    GROUP BY city."id"
    HAVING NOT (
      COUNT(page."id") = 1
      AND COUNT(page."id") FILTER (WHERE page."slug" = '') = 1
      AND COUNT(page."id") FILTER (WHERE page."slug" = 'home') = 0
      OR
      COUNT(page."id") = 2
      AND COUNT(page."id") FILTER (WHERE page."slug" = '') = 1
      AND COUNT(page."id") FILTER (WHERE page."slug" = 'home') = 1
    )
  ) THEN
    RAISE EXCEPTION '0032 canonical city HOME: expected one canonical HOME or one canonical plus one legacy HOME per city';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Page" AS canonical
    JOIN "Page" AS legacy
      ON legacy."cityId" = canonical."cityId"
      AND legacy."type" = 'HOME'
      AND legacy."slug" = 'home'
    WHERE canonical."type" = 'HOME'
      AND canonical."slug" = ''
      AND (
        NOT (canonical."siteId" IS NOT DISTINCT FROM legacy."siteId")
        OR NOT (canonical."status" IS NOT DISTINCT FROM legacy."status")
        OR NOT (canonical."seo" IS NOT DISTINCT FROM legacy."seo")
        OR NOT (canonical."content" IS NOT DISTINCT FROM legacy."content")
        OR NOT (
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'blockType', block."blockType",
                'position', block."position",
                'visible', block."visible",
                'data', block."data",
                'source', block."source",
                'archivedAt', block."archivedAt"
              )
              ORDER BY block."position", block."blockType", block."data"::text,
                COALESCE(block."source", ''), block."archivedAt" NULLS FIRST
            )
            FROM "PageBlock" AS block
            WHERE block."pageId" = canonical."id"
          ), '[]'::jsonb)
          IS NOT DISTINCT FROM
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'blockType', block."blockType",
                'position', block."position",
                'visible', block."visible",
                'data', block."data",
                'source', block."source",
                'archivedAt', block."archivedAt"
              )
              ORDER BY block."position", block."blockType", block."data"::text,
                COALESCE(block."source", ''), block."archivedAt" NULLS FIRST
            )
            FROM "PageBlock" AS block
            WHERE block."pageId" = legacy."id"
          ), '[]'::jsonb)
        )
      )
  ) THEN
    RAISE EXCEPTION '0032 canonical city HOME: canonical and legacy payloads differ; manual reconciliation is required';
  END IF;
END $$;

CREATE TEMP TABLE "_canonical_city_home_pairs" ON COMMIT DROP AS
SELECT
  canonical."siteId" AS "siteId",
  canonical."cityId" AS "cityId",
  canonical."id" AS "canonicalPageId",
  legacy."id" AS "legacyPageId"
FROM "Page" AS canonical
JOIN "Page" AS legacy
  ON legacy."cityId" = canonical."cityId"
  AND legacy."type" = 'HOME'
  AND legacy."slug" = 'home'
WHERE canonical."type" = 'HOME'
  AND canonical."slug" = '';

CREATE TEMP TABLE "_canonical_city_home_sites" ON COMMIT DROP AS
SELECT
  site."id" AS "siteId",
  site."workingRevision" AS "previousRevision",
  site."workingRevision" + 1 AS "nextRevision",
  COUNT(home."legacyPageId")::integer AS "removedPageCount"
FROM "Site" AS site
JOIN "_canonical_city_home_pairs" AS home ON home."siteId" = site."id"
GROUP BY site."id", site."workingRevision";

UPDATE "Lead" AS lead
SET "pageId" = home."canonicalPageId"
FROM "_canonical_city_home_pairs" AS home
WHERE lead."pageId" = home."legacyPageId";

UPDATE "AddressCheck" AS address_check
SET "pageId" = home."canonicalPageId"
FROM "_canonical_city_home_pairs" AS home
WHERE address_check."pageId" = home."legacyPageId";

DELETE FROM "Page" AS page
USING "_canonical_city_home_pairs" AS home
WHERE page."id" = home."legacyPageId";

UPDATE "Site" AS site
SET
  "workingRevision" = migration."nextRevision",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_canonical_city_home_sites" AS migration
WHERE site."id" = migration."siteId";

INSERT INTO "ContentRevision" (
  "id", "siteId", "entityType", "entityId", "entityRevision", "siteRevision",
  "action", "previousSnapshot", "snapshot", "changedFields", "source", "actorId", "createdAt"
)
SELECT
  'migration_0032_revision_' || md5(migration."siteId"),
  migration."siteId",
  'SITE'::"ContentEntityType",
  migration."siteId",
  COALESCE((
    SELECT MAX(revision."entityRevision")
    FROM "ContentRevision" AS revision
    WHERE revision."entityType" = 'SITE'
      AND revision."entityId" = migration."siteId"
  ), 0) + 1,
  migration."nextRevision",
  'UPDATE'::"ContentRevisionAction",
  jsonb_build_object(
    'workingRevision', migration."previousRevision",
    'canonicalCityHome', false,
    'legacyHomeCount', migration."removedPageCount"
  ),
  jsonb_build_object(
    'workingRevision', migration."nextRevision",
    'canonicalCityHome', true,
    'legacyHomeCount', 0
  ),
  '["pages"]'::jsonb,
  'migration:0032_canonical_city_home',
  NULL,
  CURRENT_TIMESTAMP
FROM "_canonical_city_home_sites" AS migration;

INSERT INTO "AuditEvent" (
  "id", "siteId", "siteRevision", "entityType", "entityId", "action",
  "changedFields", "changes", "source", "actorId", "createdAt"
)
SELECT
  'migration_0032_audit_' || md5(migration."siteId"),
  migration."siteId",
  migration."nextRevision",
  'SITE'::"ContentEntityType",
  migration."siteId",
  'UPDATE'::"ContentRevisionAction",
  '["pages"]'::jsonb,
  jsonb_build_object(
    'pages', jsonb_build_object(
      'before', jsonb_build_object('legacyHomeCount', migration."removedPageCount"),
      'after', jsonb_build_object('legacyHomeCount', 0)
    )
  ),
  'migration:0032_canonical_city_home',
  NULL,
  CURRENT_TIMESTAMP
FROM "_canonical_city_home_sites" AS migration;

ALTER TABLE "Page"
  ADD CONSTRAINT "Page_city_home_slug_check"
  CHECK ("type" <> 'HOME' OR "slug" = '');

CREATE UNIQUE INDEX "Page_cityId_home_type_key"
  ON "Page"("cityId")
  WHERE "cityId" IS NOT NULL AND "type" = 'HOME';

COMMIT;

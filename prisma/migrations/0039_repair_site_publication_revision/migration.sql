-- Repair the revision trail for sites whose live identity/contact values were
-- changed by 0034-0035 while their latest successful publication remained a
-- legacy snapshot. Historical publications stay immutable and nothing is
-- published automatically: this migration only prepares one working revision.
BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE
  "Site",
  "ContentRevision",
  "AuditEvent",
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
    RAISE EXCEPTION '0039 publication revision repair: active publication or rebuild must finish before migration';
  END IF;
END $$;

CREATE TEMP TABLE "_site_publication_revision_repairs" ON COMMIT DROP AS
WITH latest_succeeded AS (
  SELECT DISTINCT ON (publication."siteId")
    publication."siteId",
    publication."id" AS "publicationId",
    publication."siteRevision",
    publication."catalog" AS catalog
  FROM "SitePublication" AS publication
  WHERE publication."status" = 'SUCCEEDED'
  ORDER BY
    publication."siteId",
    publication."siteRevision" DESC,
    publication."publishedAt" DESC NULLS LAST,
    publication."createdAt" DESC,
    publication."id" DESC
)
SELECT
  site."id" AS "siteId",
  site."workingRevision" AS "previousRevision",
  site."workingRevision" + 1 AS "nextRevision",
  latest."publicationId",
  latest."siteRevision" AS "publicationRevision",
  jsonb_build_object(
    'name', latest.catalog #>> '{site,name}',
    'slug', latest.catalog #>> '{site,slug}',
    'connectionPhone', NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,connectionPhone}', '[^0-9]', '', 'g'), ''),
    'supportPhone', NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,supportPhone}', '[^0-9]', '', 'g'), ''),
    'publicationId', latest."publicationId"
  ) AS "previousSnapshot",
  jsonb_build_object(
    'name', site."name",
    'slug', site."slug",
    'connectionPhone', site."connectionPhone",
    'supportPhone', site."supportPhone",
    'publicationId', latest."publicationId"
  ) AS "snapshot",
  to_jsonb(array_remove(ARRAY[
    CASE WHEN latest.catalog #>> '{site,name}' IS DISTINCT FROM site."name" THEN 'name' END,
    CASE WHEN latest.catalog #>> '{site,slug}' IS DISTINCT FROM site."slug" THEN 'slug' END,
    CASE WHEN NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,connectionPhone}', '[^0-9]', '', 'g'), '') IS DISTINCT FROM site."connectionPhone" THEN 'connectionPhone' END,
    CASE WHEN NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,supportPhone}', '[^0-9]', '', 'g'), '') IS DISTINCT FROM site."supportPhone" THEN 'supportPhone' END
  ]::text[], NULL)) AS "changedFields",
  (CASE
    WHEN latest.catalog #>> '{site,name}' IS DISTINCT FROM site."name"
    THEN jsonb_build_object(
      'name', jsonb_build_object('before', latest.catalog #>> '{site,name}', 'after', site."name")
    )
    ELSE '{}'::jsonb
  END) ||
  (CASE
    WHEN latest.catalog #>> '{site,slug}' IS DISTINCT FROM site."slug"
    THEN jsonb_build_object(
      'slug', jsonb_build_object('before', latest.catalog #>> '{site,slug}', 'after', site."slug")
    )
    ELSE '{}'::jsonb
  END) ||
  (CASE
    WHEN NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,connectionPhone}', '[^0-9]', '', 'g'), '') IS DISTINCT FROM site."connectionPhone"
    THEN jsonb_build_object(
      'connectionPhone', jsonb_build_object(
        'before', NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,connectionPhone}', '[^0-9]', '', 'g'), ''),
        'after', site."connectionPhone"
      )
    )
    ELSE '{}'::jsonb
  END) ||
  (CASE
    WHEN NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,supportPhone}', '[^0-9]', '', 'g'), '') IS DISTINCT FROM site."supportPhone"
    THEN jsonb_build_object(
      'supportPhone', jsonb_build_object(
        'before', NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,supportPhone}', '[^0-9]', '', 'g'), ''),
        'after', site."supportPhone"
      )
    )
    ELSE '{}'::jsonb
  END) AS "changes"
FROM "Site" AS site
JOIN latest_succeeded AS latest ON latest."siteId" = site."id"
WHERE site."workingRevision" = site."publishedRevision"
  AND latest."siteRevision" = site."publishedRevision"
  AND NOT EXISTS (
    SELECT 1
    FROM "ContentRevision" AS prepared
    WHERE prepared."siteId" = site."id"
      AND prepared."siteRevision" > site."publishedRevision"
  )
  AND (
    latest.catalog #>> '{site,name}' IS DISTINCT FROM site."name"
    OR latest.catalog #>> '{site,slug}' IS DISTINCT FROM site."slug"
    OR NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,connectionPhone}', '[^0-9]', '', 'g'), '') IS DISTINCT FROM site."connectionPhone"
    OR NULLIF(REGEXP_REPLACE(latest.catalog #>> '{site,supportPhone}', '[^0-9]', '', 'g'), '') IS DISTINCT FROM site."supportPhone"
  );

UPDATE "Site" AS site
SET
  "workingRevision" = repair."nextRevision",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_site_publication_revision_repairs" AS repair
WHERE site."id" = repair."siteId";

INSERT INTO "ContentRevision" (
  "id", "siteId", "entityType", "entityId", "entityRevision", "siteRevision",
  "action", "previousSnapshot", "snapshot", "changedFields", "source", "actorId", "createdAt"
)
SELECT
  'migration_0039_revision_' || md5(repair."siteId"),
  repair."siteId",
  'SITE'::"ContentEntityType",
  repair."siteId",
  COALESCE((
    SELECT MAX(revision."entityRevision")
    FROM "ContentRevision" AS revision
    WHERE revision."entityType" = 'SITE'
      AND revision."entityId" = repair."siteId"
  ), 0) + 1,
  repair."nextRevision",
  'UPDATE'::"ContentRevisionAction",
  repair."previousSnapshot",
  repair."snapshot",
  repair."changedFields",
  'migration:0039_repair_site_publication_revision',
  NULL,
  CURRENT_TIMESTAMP
FROM "_site_publication_revision_repairs" AS repair;

INSERT INTO "AuditEvent" (
  "id", "siteId", "siteRevision", "entityType", "entityId", "action",
  "changedFields", "changes", "source", "actorId", "createdAt"
)
SELECT
  'migration_0039_audit_' || md5(repair."siteId"),
  repair."siteId",
  repair."nextRevision",
  'SITE'::"ContentEntityType",
  repair."siteId",
  'UPDATE'::"ContentRevisionAction",
  repair."changedFields",
  repair."changes",
  'migration:0039_repair_site_publication_revision',
  NULL,
  CURRENT_TIMESTAMP
FROM "_site_publication_revision_repairs" AS repair;

COMMIT;

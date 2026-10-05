BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE "SitePublication", "SiteRebuild" IN ACCESS EXCLUSIVE MODE;

-- A timed snapshot already handed to the publisher must finish before upgrading.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "SitePublication"
    WHERE "scheduledFor" IS NOT NULL AND "status" IN ('PENDING', 'RUNNING')
  ) OR EXISTS (
    SELECT 1 FROM "SiteRebuild" rebuild JOIN "SitePublication" publication
      ON publication.id IN (rebuild."requestedPublicationId", rebuild."processingPublicationId")
    WHERE publication.status = 'SCHEDULED'
      AND rebuild.status IN ('PENDING', 'QUEUED', 'RUNNING', 'RETRYING')
  ) THEN
    RAISE EXCEPTION 'Finish active timed publications and stop legacy workers before removing publication schedules';
  END IF;
END $$;

-- Keep historical evidence; never rewrite the catalog or advance a site revision.
UPDATE "SitePublication"
SET "providerResponse" =
    CASE WHEN jsonb_typeof("providerResponse") = 'object' THEN "providerResponse"
      WHEN "providerResponse" IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('previousProviderResponse', "providerResponse") END
    || jsonb_build_object('retiredSchedule', jsonb_build_object(
      'scheduledFor', "scheduledFor", 'cancelledAt', "cancelledAt", 'removedAt', CURRENT_TIMESTAMP)),
    "lastError" = CASE WHEN "status" = 'SCHEDULED' THEN 'Публикация по расписанию удалена владельцем; требуется ручной запуск' ELSE "lastError" END,
    "status" = CASE WHEN "status" = 'SCHEDULED' THEN 'CANCELLED'::"SitePublicationStatus" ELSE "status" END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "scheduledFor" IS NOT NULL OR "cancelledAt" IS NOT NULL OR "status" = 'SCHEDULED';

DROP INDEX "SitePublication_status_scheduledFor_idx";
ALTER TABLE "SitePublication" DROP COLUMN "scheduledFor", DROP COLUMN "cancelledAt";
ALTER TABLE "SitePublication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "SitePublicationStatus" RENAME TO "SitePublicationStatus_retired";
CREATE TYPE "SitePublicationStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
ALTER TABLE "SitePublication" ALTER COLUMN "status" TYPE "SitePublicationStatus"
  USING "status"::text::"SitePublicationStatus";
ALTER TABLE "SitePublication" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"SitePublicationStatus";
DROP TYPE "SitePublicationStatus_retired";
COMMIT;

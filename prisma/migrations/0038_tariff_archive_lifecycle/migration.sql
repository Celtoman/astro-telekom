CREATE TYPE "TariffAvailability" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "TariffArchiveReason" AS ENUM ('ABSENT_FROM_IMPORT', 'MANUAL');

ALTER TABLE "Tariff"
  ADD COLUMN "availability_new" "TariffAvailability" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "archiveReason" "TariffArchiveReason",
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "archivedByImportRunId" TEXT;

UPDATE "Tariff"
SET
  "availability_new" = CASE
    WHEN "availability" = FALSE OR "status" = 'ARCHIVED' THEN 'ARCHIVED'::"TariffAvailability"
    ELSE 'ACTIVE'::"TariffAvailability"
  END,
  "status" = CASE
    WHEN "availability" = FALSE OR "status" = 'ARCHIVED' THEN 'ARCHIVED'::"PublishStatus"
    ELSE "status"
  END,
  "archivedAt" = CASE
    WHEN "availability" = FALSE OR "status" = 'ARCHIVED' THEN "updatedAt"
    ELSE NULL
  END,
  "archiveReason" = CASE
    WHEN "availability" = FALSE OR "status" = 'ARCHIVED' THEN 'MANUAL'::"TariffArchiveReason"
    ELSE NULL
  END;

ALTER TABLE "Tariff" DROP COLUMN "availability";
ALTER TABLE "Tariff" RENAME COLUMN "availability_new" TO "availability";

ALTER TABLE "Tariff"
  ADD CONSTRAINT "Tariff_archivedByImportRunId_fkey"
  FOREIGN KEY ("archivedByImportRunId") REFERENCES "TariffImportRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Tariff_archive_lifecycle_check" CHECK (
    (
      "availability" = 'ACTIVE'
      AND "status" <> 'ARCHIVED'
      AND "archiveReason" IS NULL
      AND "archivedAt" IS NULL
      AND "archivedByImportRunId" IS NULL
    )
    OR
    (
      "availability" = 'ARCHIVED'
      AND "status" = 'ARCHIVED'
      AND "archiveReason" IS NOT NULL
      AND "archivedAt" IS NOT NULL
      AND (
        ("archiveReason" = 'ABSENT_FROM_IMPORT' AND "archivedByImportRunId" IS NOT NULL)
        OR ("archiveReason" = 'MANUAL' AND "archivedByImportRunId" IS NULL)
      )
    )
  );

CREATE INDEX "Tariff_availability_archivedAt_idx" ON "Tariff"("availability", "archivedAt");
CREATE INDEX "Tariff_archivedByImportRunId_idx" ON "Tariff"("archivedByImportRunId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Redirect"
    GROUP BY "siteId", CASE WHEN "sourcePath" = '/' THEN '/' ELSE regexp_replace("sourcePath", '/+$', '') END
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize Redirect.sourcePath: slash and no-slash duplicates exist';
  END IF;
END $$;

UPDATE "Redirect"
SET "sourcePath" = regexp_replace("sourcePath", '/+$', '')
WHERE "sourcePath" <> '/' AND "sourcePath" ~ '/+$';

UPDATE "Redirect"
SET "targetPath" = regexp_replace("targetPath", '/+$', '')
WHERE "targetPath" <> '/' AND "targetPath" ~ '/+$';

ALTER TABLE "Redirect" ADD COLUMN "managedTariffId" TEXT;

CREATE INDEX "Redirect_managedTariffId_idx" ON "Redirect"("managedTariffId");

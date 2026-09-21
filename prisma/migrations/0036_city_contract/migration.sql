CREATE TYPE "CityOfficeState" AS ENUM ('HAS_OFFICE', 'NO_OFFICE');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "City"
    WHERE ("officeAddress" IS NULL) <> ("officeHours" IS NULL)
  ) THEN
    RAISE EXCEPTION 'City office data is incomplete: address and hours must be provided together';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "City"
    WHERE ("seo" IS NOT NULL AND "seo" <> '{}'::jsonb)
       OR ("content" IS NOT NULL AND "content" <> '{}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'City contains non-empty SEO/content overrides; migrate them before dropping legacy fields';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Region"
    WHERE ("content" IS NOT NULL AND "content" <> '{}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'Region contains non-empty content overrides; migrate them before dropping legacy fields';
  END IF;
END $$;

ALTER TABLE "City"
  ADD COLUMN "officeState" "CityOfficeState" NOT NULL DEFAULT 'NO_OFFICE',
  ADD COLUMN "subscriberProfileKey" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "City"
SET "officeState" = CASE
  WHEN "officeAddress" IS NOT NULL AND "officeHours" IS NOT NULL THEN 'HAS_OFFICE'::"CityOfficeState"
  ELSE 'NO_OFFICE'::"CityOfficeState"
END;

ALTER TABLE "City"
  ADD CONSTRAINT "City_office_contract" CHECK (
    ("officeState" = 'NO_OFFICE' AND "officeAddress" IS NULL AND "officeHours" IS NULL)
    OR
    ("officeState" = 'HAS_OFFICE' AND NULLIF(BTRIM("officeAddress"), '') IS NOT NULL AND NULLIF(BTRIM("officeHours"), '') IS NOT NULL)
  ),
  DROP COLUMN "nameInstrumental",
  DROP COLUMN "seo",
  DROP COLUMN "content";

ALTER TABLE "Region"
  DROP COLUMN "phone",
  DROP COLUMN "content";

CREATE INDEX "City_siteId_status_updatedAt_id_idx" ON "City"("siteId", "status", "updatedAt", "id");
CREATE INDEX "City_regionId_status_name_id_idx" ON "City"("regionId", "status", "name", "id");

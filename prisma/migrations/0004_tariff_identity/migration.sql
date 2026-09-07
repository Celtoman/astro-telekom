ALTER TABLE "Tariff" ADD COLUMN "identityKey" TEXT;

UPDATE "Tariff"
SET "identityKey" = "cityId" || ':' || lower("slug") || ':' || lower("serviceType"::text)
WHERE "identityKey" IS NULL;

CREATE UNIQUE INDEX "Tariff_cityId_identityKey_key" ON "Tariff"("cityId", "identityKey");

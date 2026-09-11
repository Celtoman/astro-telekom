ALTER TABLE "City" ADD COLUMN "supportPhone" TEXT;

UPDATE "City"
SET "supportPhone" = '8 (800) 250-77-77'
WHERE "siteId" IN (
  SELECT "id" FROM "Site" WHERE "slug" = 'domru-kazan'
)
  AND "slug" = 'kazan'
  AND "supportPhone" IS NULL;

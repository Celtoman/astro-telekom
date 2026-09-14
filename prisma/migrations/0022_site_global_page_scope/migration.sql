ALTER TABLE "Page" ALTER COLUMN "cityId" DROP NOT NULL;

ALTER TABLE "Page"
ADD CONSTRAINT "Page_global_scope_check"
CHECK (
  ("type" IN ('COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT') AND "cityId" IS NULL)
  OR
  ("type" NOT IN ('COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT') AND "cityId" IS NOT NULL)
);

CREATE UNIQUE INDEX "Page_siteId_slug_global_key"
ON "Page"("siteId", "slug")
WHERE "cityId" IS NULL;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE "Page", "Tariff", "PageTemplate" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Page" WHERE "seo" IS NOT NULL AND "seo" NOT IN ('{}'::jsonb, 'null'::jsonb))
    OR EXISTS (SELECT 1 FROM "Tariff" WHERE "seo" IS NOT NULL AND "seo" NOT IN ('{}'::jsonb, 'null'::jsonb))
    OR EXISTS (SELECT 1 FROM "PageTemplate" WHERE "seo" IS NOT NULL AND "seo" NOT IN ('{}'::jsonb, 'null'::jsonb)) THEN
    RAISE EXCEPTION 'Legacy SEO overrides remain; map them to SeoTemplate before dropping columns';
  END IF;
END $$;

ALTER TABLE "Page" DROP COLUMN "seo";
ALTER TABLE "Tariff" DROP COLUMN "seo";
ALTER TABLE "PageTemplate" DROP COLUMN "seo";

COMMIT;

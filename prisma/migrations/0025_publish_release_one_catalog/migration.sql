ALTER TABLE "Page" DROP CONSTRAINT "Page_global_scope_check";

ALTER TABLE "Page"
ADD CONSTRAINT "Page_global_scope_check"
CHECK (
  ("type" IN ('COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY') AND "cityId" IS NULL)
  OR
  ("type" NOT IN ('COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY') AND "cityId" IS NOT NULL)
);

INSERT INTO "Page" (
  "id", "siteId", "cityId", "type", "title", "slug", "status", "seo", "content", "createdAt", "updatedAt"
)
SELECT
  'r1_' || md5(site."id" || 'COOKIE_POLICY'),
  site."id",
  NULL,
  'COOKIE_POLICY'::"PageType",
  'Политика обработки файлов cookie',
  'politika-obrabotki-faylov-kuki',
  'PUBLISHED'::"PublishStatus",
  '{}'::jsonb,
  jsonb_build_object('legalTemplate', 'cookies-2026-09-14'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Site" AS site
WHERE NOT EXISTS (
  SELECT 1 FROM "Page" AS existing
  WHERE existing."siteId" = site."id"
    AND existing."cityId" IS NULL
    AND existing."type" = 'COOKIE_POLICY'
);

UPDATE "Page"
SET
  "status" = 'PUBLISHED',
  "content" = CASE "type"
    WHEN 'COVERAGE' THEN jsonb_build_object('text', 'Выберите город и проверьте возможность подключения Дом.ру по точному адресу.')
    WHEN 'CITIES' THEN jsonb_build_object('text', 'Полный список городов из опубликованного каталога сайта.')
    WHEN 'PRIVACY' THEN jsonb_build_object('legalTemplate', 'privacy-2026-09-14')
    WHEN 'PERSONAL_DATA_CONSENT' THEN jsonb_build_object('legalTemplate', 'consent-2026-09-14')
    WHEN 'COOKIE_POLICY' THEN jsonb_build_object('legalTemplate', 'cookies-2026-09-14')
    ELSE "content"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "cityId" IS NULL
  AND "type" IN ('COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY');

UPDATE "City"
SET "status" = 'PUBLISHED'
WHERE "status" <> 'PUBLISHED';

INSERT INTO "Page" (
  "id", "siteId", "cityId", "type", "title", "slug", "status", "seo", "content", "createdAt", "updatedAt"
)
SELECT
  'r1_home_' || md5(city."id"),
  city."siteId",
  city."id",
  'HOME'::"PageType",
  'Домашний интернет в ' || COALESCE(city."namePrepositional", city."name"),
  '',
  'PUBLISHED'::"PublishStatus",
  '{}'::jsonb,
  '{}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "City" AS city
WHERE NOT EXISTS (
  SELECT 1 FROM "Page" AS existing
  WHERE existing."cityId" = city."id" AND existing."slug" = ''
);

UPDATE "Page"
SET "status" = 'PUBLISHED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'HOME' AND "cityId" IS NOT NULL;

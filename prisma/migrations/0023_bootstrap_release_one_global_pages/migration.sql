INSERT INTO "Page" (
  "id", "siteId", "cityId", "type", "title", "slug", "status", "seo", "content", "createdAt", "updatedAt"
)
SELECT
  'r1_' || md5(site."id" || page."type"),
  site."id",
  NULL,
  page."type"::"PageType",
  page."title",
  page."slug",
  'DRAFT'::"PublishStatus",
  '{}'::jsonb,
  jsonb_build_object('releaseBlocker', 'Требуется утвержденный контент перед публикацией'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Site" AS site
CROSS JOIN (
  VALUES
    ('COVERAGE', 'Карта покрытия', 'karta-pokrytiya-provaydera'),
    ('CITIES', 'Города обслуживания', 'goroda-obsluzhivaniya'),
    ('PRIVACY', 'Политика конфиденциальности', 'politika-konfidencialnosti'),
    ('PERSONAL_DATA_CONSENT', 'Согласие на обработку персональных данных', 'soglasie-na-obrabotku-personalnyh-dannyh')
) AS page("type", "title", "slug")
WHERE NOT EXISTS (
  SELECT 1
  FROM "Page" AS existing
  WHERE existing."siteId" = site."id"
    AND existing."cityId" IS NULL
    AND existing."slug" = page."slug"
);

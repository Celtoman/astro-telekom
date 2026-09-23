CREATE TYPE "SeoTemplateKind" AS ENUM (
  'HOME', 'COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT',
  'COOKIE_POLICY', 'CITY_HOME', 'CITY_TARIFF_DETAIL'
);

CREATE TYPE "SeoIndexState" AS ENUM ('INDEX', 'NOINDEX');

CREATE TABLE "SeoTemplate" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "kind" "SeoTemplateKind" NOT NULL,
  "titleTemplate" TEXT NOT NULL,
  "descriptionTemplate" TEXT NOT NULL,
  "indexState" "SeoIndexState" NOT NULL DEFAULT 'INDEX',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeoTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoTemplate_siteId_kind_key" ON "SeoTemplate"("siteId", "kind");

ALTER TABLE "SeoTemplate" ADD CONSTRAINT "SeoTemplate_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill adds one source per Release 1 route kind. Legacy Page/Tariff SEO JSON
-- remains untouched for the separate audited cleanup in #200.
INSERT INTO "SeoTemplate" (
  "id", "siteId", "kind", "titleTemplate", "descriptionTemplate", "indexState", "updatedAt"
)
SELECT
  gen_random_uuid()::text, site."id", defaults.kind::"SeoTemplateKind",
  defaults.title_template, defaults.description_template, 'INDEX'::"SeoIndexState", CURRENT_TIMESTAMP
FROM "Site" AS site
CROSS JOIN (VALUES
  ('HOME', 'Домашний интернет и телевидение {PROVIDER_NAME}', 'Выберите город, чтобы посмотреть тарифы домашнего интернета и телевидения.'),
  ('COVERAGE', 'Карта покрытия {PROVIDER_NAME}', 'Выберите город и проверьте возможность подключения {PROVIDER_NAME} по адресу.'),
  ('CITIES', 'Города обслуживания {PROVIDER_NAME}', 'Опубликованные города, в которых можно проверить подключение {PROVIDER_NAME}.'),
  ('PRIVACY', 'Политика конфиденциальности', 'Политика конфиденциальности сайта партнёра {PROVIDER_NAME}.'),
  ('PERSONAL_DATA_CONSENT', 'Согласие на обработку персональных данных', 'Согласие на обработку персональных данных на сайте партнёра {PROVIDER_NAME}.'),
  ('COOKIE_POLICY', 'Политика обработки файлов cookie', 'Правила использования файлов cookie на сайте партнёра {PROVIDER_NAME}.'),
  ('CITY_HOME', 'Домашний интернет в {CITY_NAME_PREPOSITIONAL}', 'Тарифы домашнего интернета, телевидения и подключения в {CITY_NAME_PREPOSITIONAL}.'),
  ('CITY_TARIFF_DETAIL', '{TARIFF_NAME} в {CITY_NAME_PREPOSITIONAL} — подключить {PROVIDER_NAME}', 'Тариф {TARIFF_NAME} в {CITY_NAME_PREPOSITIONAL}. Проверьте возможность подключения по адресу.')
) AS defaults(kind, title_template, description_template)
ON CONFLICT ("siteId", "kind") DO NOTHING;

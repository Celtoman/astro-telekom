-- Upgrade only the two canonical Kazan prototype pages that were created by
-- the legacy bootstrap seed. Existing tariffs, leads and all other pages stay
-- outside this migration.

WITH target_page AS (
  SELECT page."id"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  JOIN "Site" AS site ON site."id" = page."siteId"
  WHERE site."slug" = 'domru-kazan'
    AND city."slug" = 'kazan'
    AND page."slug" = ''
)
UPDATE "PageBlock" AS block
SET
  "position" = 10,
  "data" = '{"eyebrow":"Дом.ру в Казани","title":"Домашний интернет и телевидение в Казани","text":"Сравните опубликованные тарифы, проверьте возможность подключения по адресу и оставьте заявку на консультацию."}'::jsonb,
  "source" = 'migration:0019:kazan-home:hero'
FROM target_page
WHERE block."pageId" = target_page."id"
  AND block."blockType" = 'hero'
  AND block."source" IS NULL
  AND block."data"->>'title' = 'Домашний интернет и телевидение в Казани';

WITH target_page AS (
  SELECT page."id"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  JOIN "Site" AS site ON site."id" = page."siteId"
  WHERE site."slug" = 'domru-kazan'
    AND city."slug" = 'kazan'
    AND page."slug" = ''
)
UPDATE "PageBlock" AS block
SET
  "position" = 30,
  "data" = '{"title":"Популярные тарифы с интернетом и ТВ","serviceType":"INTERNET_TV","limit":6,"morePageType":"INTERNET_TV"}'::jsonb,
  "source" = 'migration:0019:kazan-home:tariffs'
FROM target_page
WHERE block."pageId" = target_page."id"
  AND block."blockType" = 'tariff_grid'
  AND block."source" IS NULL
  AND block."data"->>'title' = 'Популярные тарифы';

WITH target_page AS (
  SELECT page."id"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  JOIN "Site" AS site ON site."id" = page."siteId"
  WHERE site."slug" = 'domru-kazan'
    AND city."slug" = 'kazan'
    AND page."slug" = ''
), canonical_blocks("id", "blockType", "position", "data", "source") AS (
  VALUES
    (
      'migration-0019-kazan-home-services',
      'service_grid',
      20,
      '{"title":"Выберите подходящую услугу","items":[{"pageType":"INTERNET","title":"Домашний интернет","text":"Тарифы для квартиры или дома с проверкой подключения по адресу."},{"pageType":"INTERNET_TV","title":"Интернет и ТВ","text":"Домашний интернет и телевидение в одной заявке."},{"pageType":"TV","title":"Телевидение","text":"Доступные варианты телевидения для дома."}]}'::jsonb,
      'migration:0019:kazan-home:service-grid'
    ),
    (
      'migration-0019-kazan-home-steps',
      'steps',
      40,
      '{"title":"Как проходит подключение","items":[{"title":"Проверка адреса","text":"Введите город, улицу и дом, затем выберите точный вариант из подсказок."},{"title":"Заявка оператору","text":"Оставьте телефон после успешной проверки технической доступности."},{"title":"Согласование условий","text":"Оператор подтвердит тариф, оборудование, стоимость и удобное время."},{"title":"Подключение","text":"Специалист выполнит работы и проверит доступ к выбранным услугам."}]}'::jsonb,
      'migration:0019:kazan-home:steps'
    ),
    (
      'migration-0019-kazan-home-equipment',
      'feature_grid',
      50,
      '{"title":"Оборудование для интернета и ТВ","items":[{"title":"Wi-Fi-роутер","text":"Модель, стоимость и условия предоставления зависят от выбранного тарифа и подтверждаются оператором."},{"title":"ТВ-приставка","text":"Для тарифов с телевидением оператор уточнит совместимое оборудование и доступные функции."}]}'::jsonb,
      'migration:0019:kazan-home:equipment'
    ),
    (
      'migration-0019-kazan-home-benefits',
      'feature_grid',
      60,
      '{"title":"Что важно при выборе","items":[{"title":"Скорость под ваши задачи","text":"Сравните скорость для работы, учебы, видео и домашних устройств в карточках тарифов."},{"title":"Интернет или интернет с ТВ","text":"Перейдите в нужный раздел и сравните только предложения выбранного типа."},{"title":"Проверка до заявки","text":"Система сначала уточняет техническую доступность услуги по точному адресу."},{"title":"Условия без догадок","text":"Цена, скорость и стоимость подключения берутся из опубликованных данных платформы."}]}'::jsonb,
      'migration:0019:kazan-home:benefits'
    ),
    (
      'migration-0019-kazan-home-faq',
      'faq',
      70,
      '{"title":"Популярные вопросы","items":[{"question":"Как проверить возможность подключения Дом.ру?","answer":"Введите адрес в форме на первом экране и выберите точную подсказку. Система проверит техническую доступность автоматически."},{"question":"Как выбрать тариф для дома?","answer":"Сравните тип услуги, скорость, ежемесячную цену и стоимость подключения в карточках опубликованных тарифов."},{"question":"Когда подтвердят оборудование и дату подключения?","answer":"Оператор уточнит оборудование, итоговые условия и доступное время после проверки адреса и получения заявки."},{"question":"Можно ли оставить заявку на этой странице?","answer":"Да. После успешной проверки адреса форма предложит указать телефон и отправит заявку оператору."}]}'::jsonb,
      'migration:0019:kazan-home:faq'
    )
)
INSERT INTO "PageBlock" ("id", "pageId", "blockType", "position", "visible", "data", "source")
SELECT canonical_blocks."id", target_page."id", canonical_blocks."blockType", canonical_blocks."position", true, canonical_blocks."data", canonical_blocks."source"
FROM target_page
CROSS JOIN canonical_blocks
WHERE NOT EXISTS (
  SELECT 1
  FROM "PageBlock" AS existing
  WHERE existing."pageId" = target_page."id"
    AND existing."blockType" = canonical_blocks."blockType"
    AND existing."position" = canonical_blocks."position"
)
ON CONFLICT ("id") DO NOTHING;

WITH target_page AS (
  SELECT page."id"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  JOIN "Site" AS site ON site."id" = page."siteId"
  WHERE site."slug" = 'domru-kazan'
    AND city."slug" = 'kazan'
    AND page."slug" = 'internet'
)
UPDATE "PageBlock" AS block
SET
  "position" = 10,
  "data" = '{"eyebrow":"Дом.ру в Казани","title":"Домашний интернет","text":"Выберите подходящую скорость и проверьте возможность подключения по вашему адресу.","ctaText":"Оставить заявку","ctaHref":"#request"}'::jsonb,
  "source" = 'migration:0019:kazan-internet:hero'
FROM target_page
WHERE block."pageId" = target_page."id"
  AND block."blockType" = 'hero'
  AND block."source" IS NULL
  AND block."data"->>'title' = 'Домашний интернет';

WITH target_page AS (
  SELECT page."id"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  JOIN "Site" AS site ON site."id" = page."siteId"
  WHERE site."slug" = 'domru-kazan'
    AND city."slug" = 'kazan'
    AND page."slug" = 'internet'
)
UPDATE "PageBlock" AS block
SET
  "position" = 20,
  "data" = '{"title":"Тарифы домашнего интернета"}'::jsonb,
  "source" = 'migration:0019:kazan-internet:tariffs'
FROM target_page
WHERE block."pageId" = target_page."id"
  AND block."blockType" = 'tariff_grid'
  AND block."source" IS NULL
  AND block."data"->>'title' = 'Тарифы интернета';

WITH target_page AS (
  SELECT page."id"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  JOIN "Site" AS site ON site."id" = page."siteId"
  WHERE site."slug" = 'domru-kazan'
    AND city."slug" = 'kazan'
    AND page."slug" = 'internet'
), canonical_blocks("id", "blockType", "position", "data", "source") AS (
  VALUES
    (
      'migration-0019-kazan-internet-features',
      'feature_grid',
      30,
      '{"title":"Все необходимое для выбора","items":[{"title":"Проверка по адресу","text":"До оформления заявки система уточняет техническую возможность подключения."},{"title":"Понятные условия","text":"На карточке видны скорость, ежемесячная цена и стоимость подключения."},{"title":"Реальные тарифы","text":"Страница показывает только опубликованные предложения домашнего интернета для города."}]}'::jsonb,
      'migration:0019:kazan-internet:features'
    ),
    (
      'migration-0019-kazan-internet-steps',
      'steps',
      40,
      '{"title":"Как подключиться","items":[{"title":"Укажите адрес","text":"Начните вводить адрес и выберите точный вариант из подсказок."},{"title":"Оставьте телефон","text":"Мы сохраним заявку только после заполнения контактного номера."},{"title":"Уточните условия","text":"Оператор свяжется с вами и подтвердит доступные условия подключения."}]}'::jsonb,
      'migration:0019:kazan-internet:steps'
    ),
    (
      'migration-0019-kazan-internet-faq',
      'faq',
      50,
      '{"title":"Вопросы о подключении","items":[{"question":"Как узнать, доступен ли интернет по моему адресу?","answer":"Введите адрес в форме заявки и выберите точную подсказку. Система проверит доступность автоматически."},{"question":"Какие тарифы показаны на странице?","answer":"Здесь отображаются опубликованные тарифы домашнего интернета, доступные для выбранного города."},{"question":"Когда будут известны точные условия подключения?","answer":"Оператор подтвердит возможность, стоимость и дату подключения после проверки вашего адреса."}]}'::jsonb,
      'migration:0019:kazan-internet:faq'
    )
)
INSERT INTO "PageBlock" ("id", "pageId", "blockType", "position", "visible", "data", "source")
SELECT canonical_blocks."id", target_page."id", canonical_blocks."blockType", canonical_blocks."position", true, canonical_blocks."data", canonical_blocks."source"
FROM target_page
CROSS JOIN canonical_blocks
WHERE NOT EXISTS (
  SELECT 1
  FROM "PageBlock" AS existing
  WHERE existing."pageId" = target_page."id"
    AND existing."blockType" = canonical_blocks."blockType"
    AND existing."position" = canonical_blocks."position"
)
ON CONFLICT ("id") DO NOTHING;

-- Fresh databases can reach this migration without legacy rows if the seed has
-- not run yet. Keep the canonical hero and tariff rows additive in that case.
WITH target_page AS (
  SELECT page."id", page."slug"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  JOIN "Site" AS site ON site."id" = page."siteId"
  WHERE site."slug" = 'domru-kazan'
    AND city."slug" = 'kazan'
    AND page."slug" IN ('', 'internet')
), canonical_blocks("id", "pageSlug", "blockType", "position", "data", "source") AS (
  VALUES
    ('migration-0019-kazan-home-hero', '', 'hero', 10, '{"eyebrow":"Дом.ру в Казани","title":"Домашний интернет и телевидение в Казани","text":"Сравните опубликованные тарифы, проверьте возможность подключения по адресу и оставьте заявку на консультацию."}'::jsonb, 'migration:0019:kazan-home:hero'),
    ('migration-0019-kazan-home-tariffs', '', 'tariff_grid', 30, '{"title":"Популярные тарифы с интернетом и ТВ","serviceType":"INTERNET_TV","limit":6,"morePageType":"INTERNET_TV"}'::jsonb, 'migration:0019:kazan-home:tariffs'),
    ('migration-0019-kazan-internet-hero', 'internet', 'hero', 10, '{"eyebrow":"Дом.ру в Казани","title":"Домашний интернет","text":"Выберите подходящую скорость и проверьте возможность подключения по вашему адресу.","ctaText":"Оставить заявку","ctaHref":"#request"}'::jsonb, 'migration:0019:kazan-internet:hero'),
    ('migration-0019-kazan-internet-tariffs', 'internet', 'tariff_grid', 20, '{"title":"Тарифы домашнего интернета"}'::jsonb, 'migration:0019:kazan-internet:tariffs')
)
INSERT INTO "PageBlock" ("id", "pageId", "blockType", "position", "visible", "data", "source")
SELECT canonical_blocks."id", target_page."id", canonical_blocks."blockType", canonical_blocks."position", true, canonical_blocks."data", canonical_blocks."source"
FROM target_page
JOIN canonical_blocks ON canonical_blocks."pageSlug" = target_page."slug"
WHERE NOT EXISTS (
  SELECT 1
  FROM "PageBlock" AS existing
  WHERE existing."pageId" = target_page."id"
    AND existing."blockType" = canonical_blocks."blockType"
)
ON CONFLICT ("id") DO NOTHING;

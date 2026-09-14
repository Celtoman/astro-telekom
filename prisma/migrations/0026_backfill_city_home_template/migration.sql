-- Give every empty published city HOME the same canonical Release 1 composition.
-- Existing block compositions (including Kazan and future manual edits) are preserved.
WITH target_pages AS (
  SELECT
    page."id" AS "pageId",
    city."name",
    COALESCE(NULLIF(BTRIM(city."namePrepositional"), ''), city."name") AS "cityIn"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  WHERE page."type" = 'HOME'
    AND page."status" = 'PUBLISHED'
    AND city."status" = 'PUBLISHED'
    AND NOT EXISTS (
      SELECT 1 FROM "PageBlock" AS existing
      WHERE existing."pageId" = page."id"
    )
), canonical_blocks AS (
  SELECT
    target_pages."pageId",
    template."blockType",
    template."position",
    template."data"
  FROM target_pages
  CROSS JOIN LATERAL (
    VALUES
      (
        'hero',
        10,
        jsonb_build_object(
          'eyebrow', 'Дом.ру в ' || target_pages."cityIn",
          'title', 'Домашний интернет и телевидение в ' || target_pages."cityIn",
          'text', 'Сравните опубликованные тарифы, проверьте возможность подключения по адресу и оставьте заявку на консультацию.'
        )
      ),
      (
        'service_grid',
        20,
        jsonb_build_object(
          'title', 'Выберите подходящую услугу',
          'items', jsonb_build_array(
            jsonb_build_object('pageType', 'INTERNET', 'title', 'Домашний интернет', 'text', 'Тарифы для квартиры или дома с проверкой подключения по адресу.'),
            jsonb_build_object('pageType', 'INTERNET_TV', 'title', 'Интернет и ТВ', 'text', 'Домашний интернет и телевидение в одной заявке.'),
            jsonb_build_object('pageType', 'TV', 'title', 'Телевидение', 'text', 'Доступные варианты телевидения для дома.')
          )
        )
      ),
      (
        'tariff_grid',
        30,
        jsonb_build_object('title', 'Популярные тарифы с интернетом и ТВ', 'serviceType', 'INTERNET_TV', 'limit', 6, 'morePageType', 'INTERNET_TV')
      ),
      (
        'steps',
        40,
        jsonb_build_object(
          'title', 'Как проходит подключение',
          'items', jsonb_build_array(
            jsonb_build_object('title', 'Проверка адреса', 'text', 'Введите город, улицу и дом, затем выберите точный вариант из подсказок.'),
            jsonb_build_object('title', 'Заявка оператору', 'text', 'Оставьте телефон после успешной проверки технической доступности.'),
            jsonb_build_object('title', 'Согласование условий', 'text', 'Оператор подтвердит тариф, оборудование, стоимость и удобное время.'),
            jsonb_build_object('title', 'Подключение', 'text', 'Специалист выполнит работы и проверит доступ к выбранным услугам.')
          )
        )
      ),
      (
        'feature_grid',
        50,
        jsonb_build_object(
          'title', 'Оборудование для интернета и ТВ',
          'items', jsonb_build_array(
            jsonb_build_object('title', 'Wi-Fi-роутер', 'text', 'Модель, стоимость и условия предоставления зависят от выбранного тарифа и подтверждаются оператором.'),
            jsonb_build_object('title', 'ТВ-приставка', 'text', 'Для тарифов с телевидением оператор уточнит совместимое оборудование и доступные функции.')
          )
        )
      ),
      (
        'feature_grid',
        60,
        jsonb_build_object(
          'title', 'Что важно при выборе',
          'items', jsonb_build_array(
            jsonb_build_object('title', 'Скорость под ваши задачи', 'text', 'Сравните скорость для работы, учебы, видео и домашних устройств в карточках тарифов.'),
            jsonb_build_object('title', 'Интернет или интернет с ТВ', 'text', 'Перейдите в нужный раздел и сравните только предложения выбранного типа.'),
            jsonb_build_object('title', 'Проверка до заявки', 'text', 'Система сначала уточняет техническую доступность услуги по точному адресу.'),
            jsonb_build_object('title', 'Условия без догадок', 'text', 'Цена, скорость и стоимость подключения берутся из опубликованных данных платформы.')
          )
        )
      ),
      (
        'faq',
        70,
        jsonb_build_object(
          'title', 'Популярные вопросы',
          'items', jsonb_build_array(
            jsonb_build_object('question', 'Как проверить возможность подключения Дом.ру?', 'answer', 'Введите адрес в форме на первом экране и выберите точную подсказку. Система проверит техническую доступность автоматически.'),
            jsonb_build_object('question', 'Как выбрать тариф для дома?', 'answer', 'Сравните тип услуги, скорость, ежемесячную цену и стоимость подключения в карточках опубликованных тарифов.'),
            jsonb_build_object('question', 'Когда подтвердят оборудование и дату подключения?', 'answer', 'Оператор уточнит оборудование, итоговые условия и доступное время после проверки адреса и получения заявки.'),
            jsonb_build_object('question', 'Можно ли оставить заявку на этой странице?', 'answer', 'Да. После успешной проверки адреса форма предложит указать телефон и отправит заявку оператору.')
          )
        )
      )
  ) AS template("blockType", "position", "data")
)
INSERT INTO "PageBlock" ("id", "pageId", "blockType", "position", "visible", "data", "source")
SELECT
  'city_home_' || md5(canonical_blocks."pageId" || ':' || canonical_blocks."position"::text),
  canonical_blocks."pageId",
  canonical_blocks."blockType",
  canonical_blocks."position",
  true,
  canonical_blocks."data",
  'template:city-home:v1'
FROM canonical_blocks;

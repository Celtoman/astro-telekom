-- Owner-approved CITY_HOME Q1-Q38. Only working data changes; immutable publications remain untouched.
BEGIN;
LOCK TABLE "Provider", "Site", "PageTemplate", "PageTemplateBlock", "ContentRevision", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE "_city_home_targets" ON COMMIT DROP AS
SELECT t."id", t."siteId", t."content",
  to_jsonb(t) || jsonb_build_object('blocks', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")) AS before
FROM "PageTemplate" t JOIN "Site" s ON s."id"=t."siteId" JOIN "Provider" p ON p."id"=s."providerId"
WHERE t."kind"='CITY_HOME' AND p."slug"='domru';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Site" s JOIN "Provider" p ON p."id"=s."providerId" WHERE p."slug"='domru' AND
    (s."settings" IS NOT NULL AND jsonb_typeof(s."settings") <> 'object'
      OR coalesce(s."settings" ? 'publicDisplay',false) AND
        (coalesce(s."settings"->'publicDisplay'->>'version','') <> '1.0.0' OR jsonb_typeof(s."settings"->'publicDisplay') <> 'object')))
  THEN RAISE EXCEPTION 'CITY_HOME upgrade requires supported Site settings; existing values must not be replaced'; END IF;
  IF EXISTS (SELECT 1 FROM "_city_home_targets" t WHERE coalesce(t."content"->>'homeCompositionVersion','') NOT IN ('2.0.0','3.0.0')
    OR coalesce(t."content"->>'firstScreenPassportVersion','') <> '1.0.0'
    OR coalesce(t."content"->>'tariffCollectionPassportVersion','') <> '1.0.0')
  THEN RAISE EXCEPTION 'CITY_HOME upgrade requires known composition and Hero/catalog passports'; END IF;
  IF EXISTS (SELECT 1 FROM "_city_home_targets" t WHERE t."content"->>'homeCompositionVersion'='2.0.0' AND (
    (SELECT array_agg(b."blockType" ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND b."visible") IS DISTINCT FROM ARRAY['hero','tariff_grid']::text[]
    OR EXISTS (SELECT 1 FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND
      (b."position" < 0 OR b."position" >= 1000 OR NOT b."visible" AND b."blockType" NOT IN ('service_grid','steps','feature_grid','faq')))))
  THEN RAISE EXCEPTION 'CITY_HOME v2 must have the exact supported two visible blocks and known preserved legacy rows'; END IF;
  IF EXISTS (SELECT 1 FROM "_city_home_targets" t WHERE t."content"->>'homeCompositionVersion'='3.0.0' AND (
    coalesce(t."content"->>'cityHomeImplementationVersion','') <> 'city-home-v3'
    OR (SELECT array_agg(b."blockType" ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND b."visible") IS DISTINCT FROM ARRAY['hero','tariff_grid','city.comparison','city.help','city.benefits','city.connection_steps','city.movix','city.regional_cities','city.faq','city.contacts']::text[]
    OR (SELECT array_agg(b."position" ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND b."visible") IS DISTINCT FROM ARRAY[10,20,30,40,50,60,70,80,90,100]
    OR EXISTS (SELECT 1 FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND NOT b."visible" AND (b."position" < 1000 OR b."blockType" NOT IN ('service_grid','steps','feature_grid','faq')))))
  THEN RAISE EXCEPTION 'CITY_HOME v3 must retain its supported composition and system positions'; END IF;
  IF EXISTS (SELECT 1 FROM "Site" s JOIN "Provider" p ON p."id"=s."providerId"
    JOIN "PageTemplate" t ON t."siteId"=s."id" AND t."kind"='HOME'
    JOIN "PageTemplateBlock" b ON b."templateId"=t."id" AND b."blockType"='home.benefits' AND b."visible"
    WHERE p."slug"='domru' AND NOT coalesce(s."settings" ? 'publicDisplay',false)
    GROUP BY t."id" HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'HOME benefit facts have multiple owners; no automatic choice is allowed'; END IF;
  IF EXISTS (SELECT 1 FROM "Site" s JOIN "Provider" p ON p."id"=s."providerId"
    JOIN "PageTemplate" t ON t."siteId"=s."id" AND t."kind"='HOME'
    JOIN "PageTemplateBlock" b ON b."templateId"=t."id" AND b."blockType"='home.benefits' AND b."visible"
    CROSS JOIN LATERAL (VALUES (b."data"#>'{items,fiber,factText}'),(b."data"#>'{items,wifi6,factText}'),(b."data"#>'{items,movix,factText}'),(b."data"#>'{items,connection,factText}')) AS fact(value)
    WHERE p."slug"='domru' AND NOT coalesce(s."settings" ? 'publicDisplay',false) AND
      (coalesce(t."content"->>'generalHomeCompositionVersion','') <> '1.0.0' OR coalesce(jsonb_typeof(fact.value),'') <> 'string'
       OR length(fact.value#>>'{}') > 200 OR (fact.value#>>'{}') ~ '[{}<>]'))
  THEN RAISE EXCEPTION 'Resolve unsupported HOME fact templates before centralizing their values; existing owner text must not be replaced'; END IF;
END $$;
CREATE TEMP TABLE "_city_home_upgrade" ON COMMIT DROP AS
SELECT * FROM "_city_home_targets" WHERE "content"->>'homeCompositionVersion'='2.0.0';
CREATE TEMP TABLE "_city_home_sites" ON COMMIT DROP AS
SELECT s."id", s."workingRevision"+1 AS revision, to_jsonb(s) AS before,
  NOT coalesce(s."settings" ? 'publicDisplay',false) AS initialize_settings
FROM "Site" s JOIN "Provider" p ON p."id"=s."providerId"
WHERE p."slug"='domru' AND (NOT coalesce(s."settings" ? 'publicDisplay',false) OR EXISTS (SELECT 1 FROM "_city_home_upgrade" t WHERE t."siteId"=s."id"));
CREATE TEMP TABLE "_city_home_owner_facts" ON COMMIT DROP AS
SELECT c."id" AS "siteId", jsonb_strip_nulls(jsonb_build_object(
  'technologyFact',CASE WHEN btrim(b."data"#>>'{items,fiber,factText}') <> '' THEN b."data"#>>'{items,fiber,factText}' END,
  'wifiFact',CASE WHEN btrim(b."data"#>>'{items,wifi6,factText}') <> '' THEN b."data"#>>'{items,wifi6,factText}' END,
  'movixFact',CASE WHEN btrim(b."data"#>>'{items,movix,factText}') <> '' THEN b."data"#>>'{items,movix,factText}' END,
  'applicationFact',CASE WHEN btrim(b."data"#>>'{items,connection,factText}') <> '' THEN b."data"#>>'{items,connection,factText}' END)) AS facts
FROM "_city_home_sites" c JOIN "PageTemplate" t ON t."siteId"=c."id" AND t."kind"='HOME'
JOIN "PageTemplateBlock" b ON b."templateId"=t."id" AND b."blockType"='home.benefits' AND b."visible"
WHERE c.initialize_settings;
-- Reserve positions before returning Hero/catalog to 10/20; hidden rows keep IDs, content and source.
UPDATE "PageTemplateBlock" b SET "position"=10000+b."position" FROM "_city_home_upgrade" t WHERE b."templateId"=t."id";
UPDATE "PageTemplateBlock" b SET "position"=CASE b."blockType" WHEN 'hero' THEN 10 ELSE 20 END
FROM "_city_home_upgrade" t WHERE b."templateId"=t."id" AND b."blockType" IN ('hero','tariff_grid') AND b."visible";
INSERT INTO "PageTemplateBlock" ("id","templateId","blockType","position","visible","data","source")
SELECT 'city_home_v3_block_' || md5(t."id" || '/' || (added.block->>'blockType')), t."id", added.block->>'blockType', ((added.ord+2)*10)::integer, true, added.block->'data', 'migration:0062:city-home-composition'
FROM "_city_home_upgrade" t CROSS JOIN LATERAL jsonb_array_elements($city_home_data$[
  {
    "blockType": "city.comparison",
    "data": {
      "title": "Сравните тарифы Дом.ру",
      "text": "Сравните стоимость, скорость интернета и возможности телевидения.",
      "connectButtonText": "Подключить"
    }
  },
  {
    "blockType": "city.help",
    "data": {
      "title": "Поможем выбрать тариф и подключить Дом.ру",
      "intro": "Специалист поможет подобрать тариф, объяснит стоимость и условия подключения.",
      "formTitle": "Перезвоним вам",
      "phoneLabel": "Телефон для обратного звонка",
      "phonePlaceholder": "+7 (___) ___-__-__",
      "submitButtonText": "Заказать звонок"
    }
  },
  {
    "blockType": "city.benefits",
    "data": {
      "title": "Основные преимущества подключения Дом.ру",
      "items": {
        "speed": {
          "title": "Высокая скорость интернета",
          "text": "Смотрите видео в 4K, работайте из дома и загружайте большие файлы. Выбирайте скорость под свои задачи."
        },
        "fiber": {
          "title": "Оптоволоконная сеть",
          "text": "Дом.ру использует проводную оптоволоконную инфраструктуру для подключения жилых домов. Технология доступа зависит от адреса."
        },
        "wifi6": {
          "title": "Домашний Wi-Fi 6",
          "text": "Роутеры Дом.ру Wave помогают организовать беспроводную сеть для смартфонов, ноутбуков, телевизоров и умных устройств."
        },
        "movix": {
          "title": "Фильмы и сериалы в Movix",
          "text": "Смотрите телеканалы, фильмы и сериалы в одном сервисе. Выбирайте подписки с учетом своих интересов."
        },
        "connection": {
          "title": "Удобное оформление подключения",
          "text": "Выберите тариф, проверьте возможность подключения по адресу и согласуйте удобное время визита мастера."
        },
        "support": {
          "title": "Поддержка абонентов 24/7",
          "text": "Обращайтесь за помощью по вопросам домашнего интернета, телевидения и оборудования в любое время суток."
        }
      }
    }
  },
  {
    "blockType": "city.connection_steps",
    "data": {
      "title": "Как подключить Дом.ру",
      "intro": "Четыре понятных шага от обращения до работающего интернета.",
      "steps": {
        "request": {
          "title": "Оставьте заявку",
          "text": "Позвоните в отдел подключений или оставьте заявку на сайте."
        },
        "appointment": {
          "title": "Согласование визита",
          "text": "Согласуйте с оператором удобное время приезда мастера."
        },
        "installation": {
          "title": "Подключение и настройка",
          "text": "Мастер подключит услуги и настроит оборудование."
        },
        "confirmation": {
          "title": "Оформление и проверка",
          "text": "Специалист оформит договор и проверит работу услуг."
        }
      },
      "applyButtonText": "Оставить заявку"
    }
  },
  {
    "blockType": "city.movix",
    "data": {
      "title": "Movix — один сервис для кино, сериалов и ТВ",
      "intro": "Любимые телеканалы и онлайн-кинотеатры всегда под рукой — на телевизоре, смартфоне или компьютере.",
      "features": {
        "television": {
          "title": "Телеканалы на любой вкус",
          "text": "Новости, спорт, кино, детские и развлекательные каналы — смотрите прямой эфир и выбирайте контент под настроение."
        },
        "search": {
          "title": "Удобный поиск",
          "text": "Находите фильмы и сериалы среди подключенных онлайн-кинотеатров в одном интерфейсе — без лишних переключений между приложениями."
        },
        "devices": {
          "title": "До 5 устройств",
          "text": "Смотрите Movix на телевизоре, смартфоне, планшете и компьютере — дома или там, где вам удобно."
        }
      },
      "image": "/images/general-home/movix-devices.png",
      "imageAlt": "Устройства для просмотра Movix",
      "cinemasLabel": "Онлайн-кинотеатры в Movix",
      "cinemas": {
        "kinopoisk": {
          "image": "/images/general-home/cinema-kinopoisk.png",
          "alt": "Кинопоиск"
        },
        "ivi": {
          "image": "/images/general-home/cinema-ivi.svg",
          "alt": "Иви"
        },
        "okko": {
          "image": "/images/general-home/cinema-okko.svg",
          "alt": "Okko"
        },
        "premier": {
          "image": "/images/general-home/cinema-premier.svg",
          "alt": "PREMIER"
        },
        "start": {
          "image": "/images/general-home/cinema-start.png",
          "alt": "START"
        },
        "amediateka": {
          "image": "/images/general-home/cinema-amediateka.svg",
          "alt": "Amediateka"
        }
      },
      "tariffButtonText": "Выбрать тариф",
      "detailsLinkText": "О Movix",
      "disclaimerText": "Какие онлайн-кинотеатры доступны,\nзависит от выбранного тарифа"
    }
  },
  {
    "blockType": "city.regional_cities",
    "data": {
      "title": "Города вашего региона",
      "intro": "Выберите город, чтобы посмотреть тарифы.",
      "allCitiesLinkText": "Все города обслуживания"
    }
  },
  {
    "blockType": "city.faq",
    "data": {
      "title": "Популярные вопросы",
      "items": [
        {
          "question": "Куда звонить для подключения интернета и ТВ Дом.ру в {CITY_NAME_PREPOSITIONAL}?",
          "answer": "Для подключения позвоните по номеру {CONNECTION_PHONE}. Приём звонков: {CONNECTION_HOURS}. Если вы уже пользуетесь услугами и нужна помощь, обратитесь в поддержку: {SUPPORT_PHONE}."
        },
        {
          "question": "Как оставить заявку на подключение Дом.ру?",
          "answer": "Нажмите «Оставить заявку» или «Подключить» у выбранного тарифа и укажите телефон. Онлайн-заявки принимаются: {ONLINE_APPLICATIONS_HOURS}. Срок обратного звонка — {CALLBACK_WITHIN_MINUTES} минут. Чтобы отдельно проверить дом, воспользуйтесь проверкой адреса."
        },
        {
          "question": "Можно ли подключить только интернет?",
          "answer": "Выберите в каталоге категорию «Домашний интернет»: она показывает предложения без телевидения. Доступность подключения по вашему адресу можно проверить отдельно; условия выбранного предложения уточнит оператор."
        },
        {
          "question": "Какой самый доступный тариф в {CITY_NAME_PREPOSITIONAL}?",
          "answer": "Минимальная стоимость среди опубликованных тарифов города — {CITY_MIN_PRICE} ₽ в месяц. Посмотрите состав предложения, срок акции и последующую цену в карточке тарифа."
        },
        {
          "question": "Какая максимальная скорость доступна в тарифах Дом.ру?",
          "answer": "В опубликованных тарифах города максимальная заявленная скорость — {CITY_MAX_SPEED} Мбит/с. Доступность конкретного тарифа зависит от адреса подключения."
        },
        {
          "question": "Сколько цифровых каналов входит в пакеты с ТВ?",
          "answer": "В опубликованных пакетах города с телевидением — до {CITY_MAX_CHANNELS} каналов. Точное количество и состав включённых подписок указаны в карточке выбранного тарифа."
        }
      ]
    }
  },
  {
    "blockType": "city.contacts",
    "data": {
      "title": "Контакты Дом.ру в {CITY_NAME_PREPOSITIONAL}",
      "salesTitle": "Подключение",
      "salesAudience": "Для новых абонентов",
      "callbackButtonText": "Оставить заявку",
      "supportTitle": "Поддержка Дом.ру",
      "supportAudience": "Для действующих абонентов",
      "supportCost": "Бесплатный звонок по России",
      "supportTopics": "Не работает интернет или ТВ? Есть вопросы по оплате или настройке оборудования? Обратитесь в поддержку Дом.ру."
    }
  }
]$city_home_data$::jsonb) WITH ORDINALITY AS added(block,ord);
UPDATE "PageTemplate" t SET "content"=coalesce(t."content",'{}'::jsonb) || '{"homeCompositionVersion":"3.0.0","cityHomeImplementationVersion":"city-home-v3"}'::jsonb, "updatedAt"=CURRENT_TIMESTAMP
FROM "_city_home_upgrade" c WHERE t."id"=c."id";
UPDATE "Site" s SET "settings"=CASE WHEN c.initialize_settings THEN coalesce(s."settings",'{}'::jsonb) || jsonb_build_object('publicDisplay',$site_display_data${
  "version": "1.0.0",
  "connectionHours": "Ежедневно с 8:00 до 22:00",
  "supportHours": "Круглосуточно",
  "onlineApplicationsHours": "Круглосуточно",
  "callbackWithinMinutes": 15,
  "technologyFact": "FTTB и GPON",
  "wifiFact": "До 50–100 устройств",
  "movixFact": "100 000+ фильмов и сериалов",
  "applicationFact": "Заявка онлайн",
  "footerLegalText": "© 2020–2026 tarify-dom.ru — сайт ИП Кочергина Александра Андреевича (ИНН 165038398334, ОГРНИП 323169000159136) и не относится к официальным ресурсам Дом.ру. Официальный сайт: dom.ru.",
  "footerCtaText": "Оставить заявку"
}$site_display_data$::jsonb || coalesce((SELECT f.facts FROM "_city_home_owner_facts" f WHERE f."siteId"=s."id"),'{}'::jsonb)) ELSE s."settings" END,
  "workingRevision"=c.revision,"updatedAt"=CURRENT_TIMESTAMP FROM "_city_home_sites" c WHERE s."id"=c."id";
-- Align readonly legacy copies once. Title/text, IDs and all other HOME blocks are preserved.
CREATE TEMP TABLE "_city_home_legacy_fact_updates" ON COMMIT DROP AS
SELECT t."id",t."siteId",b."id" AS "blockId",replacement.data,
  to_jsonb(t) || jsonb_build_object('blocks',(SELECT jsonb_agg(to_jsonb(old) ORDER BY old."position") FROM "PageTemplateBlock" old WHERE old."templateId"=t."id")) AS before
FROM "_city_home_sites" c JOIN "Site" s ON s."id"=c."id"
JOIN "PageTemplate" t ON t."siteId"=s."id" AND t."kind"='HOME'
JOIN "PageTemplateBlock" b ON b."templateId"=t."id" AND b."blockType"='home.benefits' AND b."visible"
CROSS JOIN LATERAL (SELECT b."data" || jsonb_build_object('items',b."data"->'items' || jsonb_build_object(
  'speed',b."data"#>'{items,speed}' || jsonb_build_object('factText','До 1 Гбит/с'),
  'fiber',b."data"#>'{items,fiber}' || jsonb_build_object('factText',s."settings"#>>'{publicDisplay,technologyFact}'),
  'wifi6',b."data"#>'{items,wifi6}' || jsonb_build_object('factText',s."settings"#>>'{publicDisplay,wifiFact}'),
  'movix',b."data"#>'{items,movix}' || jsonb_build_object('factText',s."settings"#>>'{publicDisplay,movixFact}'),
  'connection',b."data"#>'{items,connection}' || jsonb_build_object('factText',s."settings"#>>'{publicDisplay,applicationFact}'),
  'support',b."data"#>'{items,support}' || jsonb_build_object('factText',s."settings"#>>'{publicDisplay,supportHours}'))
  ) AS data) replacement
WHERE c.initialize_settings AND replacement.data IS DISTINCT FROM b."data";
UPDATE "PageTemplateBlock" b SET "data"=c.data,"source"='migration:0062:city-home-composition'
FROM "_city_home_legacy_fact_updates" c WHERE b."id"=c."blockId";
UPDATE "PageTemplate" t SET "updatedAt"=CURRENT_TIMESTAMP FROM "_city_home_legacy_fact_updates" c WHERE t."id"=c."id";
INSERT INTO "ContentRevision" ("id","siteId","entityType","entityId","entityRevision","siteRevision","action","previousSnapshot","snapshot","changedFields","source","createdAt")
SELECT 'city_home_v3_template_revision_' || md5(c."id"),c."siteId",'PAGE_TEMPLATE',c."id",
  (SELECT coalesce(max(r."entityRevision"),0)+1 FROM "ContentRevision" r WHERE r."entityType"='PAGE_TEMPLATE' AND r."entityId"=c."id"),s.revision,'UPDATE'::"ContentRevisionAction",c.before,
  to_jsonb(t) || jsonb_build_object('blocks',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")),
  '["content.homeCompositionVersion","content.cityHomeImplementationVersion","blocks"]'::jsonb,'migration:0062:city-home-composition',CURRENT_TIMESTAMP
FROM "_city_home_upgrade" c JOIN "PageTemplate" t ON t."id"=c."id" JOIN "_city_home_sites" s ON s."id"=c."siteId";
INSERT INTO "ContentRevision" ("id","siteId","entityType","entityId","entityRevision","siteRevision","action","previousSnapshot","snapshot","changedFields","source","createdAt")
SELECT 'city_home_v3_settings_revision_' || md5(c."id"),c."id",'SITE',c."id",
  (SELECT coalesce(max(r."entityRevision"),0)+1 FROM "ContentRevision" r WHERE r."entityType"='SITE' AND r."entityId"=c."id"),c.revision,'UPDATE'::"ContentRevisionAction",c.before,to_jsonb(s),
  '["settings.publicDisplay"]'::jsonb,'migration:0062:city-home-composition',CURRENT_TIMESTAMP
FROM "_city_home_sites" c JOIN "Site" s ON s."id"=c."id" WHERE c.initialize_settings;
INSERT INTO "ContentRevision" ("id","siteId","entityType","entityId","entityRevision","siteRevision","action","previousSnapshot","snapshot","changedFields","source","createdAt")
SELECT 'city_home_v3_home_facts_revision_' || md5(c."id"),c."siteId",'PAGE_TEMPLATE',c."id",
  (SELECT coalesce(max(r."entityRevision"),0)+1 FROM "ContentRevision" r WHERE r."entityType"='PAGE_TEMPLATE' AND r."entityId"=c."id"),s.revision,'UPDATE'::"ContentRevisionAction",c.before,
  to_jsonb(t) || jsonb_build_object('blocks',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")),
  '["blocks.data.items.factText"]'::jsonb,'migration:0062:city-home-composition',CURRENT_TIMESTAMP
FROM "_city_home_legacy_fact_updates" c JOIN "PageTemplate" t ON t."id"=c."id" JOIN "_city_home_sites" s ON s."id"=c."siteId";
INSERT INTO "AuditEvent" ("id","siteId","siteRevision","entityType","entityId","action","changedFields","changes","source","createdAt")
SELECT 'city_home_v3_audit_' || md5(c."id"),c."siteId",s.revision,'PAGE_TEMPLATE',c."id",'UPDATE'::"ContentRevisionAction",
  '["content.homeCompositionVersion","blocks"]'::jsonb,'{"compositionVersion":"3.0.0","addedBlocks":8,"preservedHeroAndCatalog":true}'::jsonb,'migration:0062:city-home-composition',CURRENT_TIMESTAMP
FROM "_city_home_upgrade" c JOIN "_city_home_sites" s ON s."id"=c."siteId";
INSERT INTO "AuditEvent" ("id","siteId","siteRevision","entityType","entityId","action","changedFields","changes","source","createdAt")
SELECT 'city_home_v3_settings_audit_' || md5(c."id"),c."id",c.revision,'SITE',c."id",'UPDATE'::"ContentRevisionAction",
  '["settings.publicDisplay"]'::jsonb,'{"centralizedPublicDisplay":true}'::jsonb,'migration:0062:city-home-composition',CURRENT_TIMESTAMP
FROM "_city_home_sites" c WHERE c.initialize_settings;
INSERT INTO "AuditEvent" ("id","siteId","siteRevision","entityType","entityId","action","changedFields","changes","source","createdAt")
SELECT 'city_home_v3_home_facts_audit_' || md5(c."id"),c."siteId",s.revision,'PAGE_TEMPLATE',c."id",'UPDATE'::"ContentRevisionAction",
  '["blocks.data.items.factText"]'::jsonb,'{"readonlyHomeFactsAligned":true,"ownerFactsPreserved":true}'::jsonb,'migration:0062:city-home-composition',CURRENT_TIMESTAMP
FROM "_city_home_legacy_fact_updates" c JOIN "_city_home_sites" s ON s."id"=c."siteId";
COMMIT;

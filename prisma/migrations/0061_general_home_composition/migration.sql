-- Owner-approved Dom.ru HOME content. Only working templates change; published snapshots remain immutable.
BEGIN;
LOCK TABLE "Provider", "Site", "PageTemplate", "PageTemplateBlock", "ContentRevision", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE "_general_home_targets" ON COMMIT DROP AS
SELECT t."id", t."siteId", t."content", s."workingRevision" + 1 AS revision,
  to_jsonb(t) || jsonb_build_object('blocks', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")) AS before
FROM "PageTemplate" t JOIN "Site" s ON s."id"=t."siteId" JOIN "Provider" p ON p."id"=s."providerId"
WHERE t."kind"='HOME' AND p."slug"='domru';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "_general_home_targets" c WHERE
    coalesce(c."content"->>'firstScreenPassportVersion','') <> '2.0.0'
    OR CASE WHEN coalesce(c."content" ? 'generalHomeCompositionVersion',false) THEN
      coalesce(c."content"->>'generalHomeCompositionVersion','') <> '1.0.0'
      OR coalesce(c."content"->>'generalHomeImplementationVersion','') <> 'general-home-v1'
      OR (SELECT array_agg(b."blockType" ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=c."id" AND b."visible") IS DISTINCT FROM ARRAY['home.hero','home.address_check','home.provider_about','home.benefits','home.connection_steps','home.movix','home.more_possibilities','home.connection_help','home.city_directory','home.faq']::text[]
      OR EXISTS (SELECT 1 FROM "PageTemplateBlock" b WHERE b."templateId"=c."id" AND b."visible" AND b."position" <> array_position(ARRAY['home.hero','home.address_check','home.provider_about','home.benefits','home.connection_steps','home.movix','home.more_possibilities','home.connection_help','home.city_directory','home.faq']::text[], b."blockType") * 10)
    ELSE
      (SELECT count(*) FROM "PageTemplateBlock" b WHERE b."templateId"=c."id") <> 1
      OR NOT EXISTS (SELECT 1 FROM "PageTemplateBlock" b WHERE b."templateId"=c."id" AND b."blockType"='home.hero' AND b."position"=10 AND b."visible")
    END
  ) THEN RAISE EXCEPTION 'General HOME upgrade requires known Hero 2.0.0 or the exact supported composition; no partial migration is allowed'; END IF;
END $$;

CREATE TEMP TABLE "_general_home_upgrade" ON COMMIT DROP AS
SELECT * FROM "_general_home_targets" WHERE NOT coalesce("content" ? 'generalHomeCompositionVersion', false);

INSERT INTO "PageTemplateBlock" ("id","templateId","blockType","position","visible","data","source")
SELECT 'general_home_block_' || md5(c."id" || '/' || (added.block->>'blockType')), c."id", added.block->>'blockType', ((added.ord+1)*10)::integer, true, added.block->'data', 'migration:0061:general-home-composition'
FROM "_general_home_upgrade" c CROSS JOIN LATERAL jsonb_array_elements($general_home_data$[
  {
    "blockType": "home.address_check",
    "data": {
      "eyebrow": "ПРОВЕРКА ПОДКЛЮЧЕНИЯ",
      "title": "Проверьте подключение Дом.ру по адресу",
      "intro": "Укажите город, улицу и дом — проверим возможность подключения Дом.ру по вашему адресу.",
      "addressLabel": "Адрес подключения",
      "addressPlaceholder": "Город, улица, дом",
      "checkButtonText": "Проверить адрес",
      "reassuranceText": "Проверка бесплатная и ни к чему не обязывает.",
      "image": "/images/general-home/address-house.png",
      "imageAlt": "Дом и отметка проверки подключения на карте",
      "imageBadgeText": "Проверим\nза пару секунд",
      "helpEyebrow": "ПОМОЖЕМ С ПОДКЛЮЧЕНИЕМ",
      "helpTitle": "Подберем тариф\nи объясним условия",
      "callbackButtonText": "Заказать звонок"
    }
  },
  {
    "blockType": "home.provider_about",
    "data": {
      "title": "О провайдере Дом.ру",
      "intro": "Дом.ру — федеральный провайдер домашнего интернета и цифрового телевидения, бренд компании «ЭР-Телеком Холдинг». Оператор развивает собственную телекоммуникационную инфраструктуру, создает оборудование и внедряет технологии связи. Качество его сети подтверждалось независимыми исследованиями.",
      "metrics": {
        "brand_history": {
          "value": "2004",
          "label": "год — начало истории бренда Дом.ру"
        },
        "network_length": {
          "value": "105 000",
          "label": "км оптоволоконных линий ЭР‑Телеком"
        },
        "city_wifi": {
          "value": "40 000+",
          "label": "точек городского Wi-Fi в России"
        },
        "network_uptime": {
          "value": "99,9%",
          "label": "заявленный показатель работы сети"
        }
      },
      "evidence": {
        "infrastructure": {
          "title": "Собственная сетевая инфраструктура",
          "text": "ЭР-Телеком строит и развивает сети связи в России. Компания управляет собственной инфраструктурой передачи данных, модернизирует магистральные линии и расширяет технические возможности сети."
        },
        "development": {
          "title": "Собственные разработки",
          "text": "Дом.ру развивает оборудование собственной разработки: от домашних маршрутизаторов до умных домофонных панелей. В 2026 году компания сообщила о запуске их серийного производства в России."
        },
        "research": {
          "title": "Лидер по стабильности соединения",
          "text": "По результатам исследования TelecomDaily за 2022 год Дом.ру занял первое место по стабильности соединения во всех 40 городах, где проводились замеры среди операторов фиксированной связи.",
          "sourceLabel": "Исследование TelecomDaily, 2022 ↗",
          "sourceUrl": "https://interzet.dom.ru/news/issledovanie-telecomdaily-domru-lider-po-skorosti-i-stabilnosti-soedineniya-v-rossii"
        }
      }
    }
  },
  {
    "blockType": "home.benefits",
    "data": {
      "title": "Основные преимущества подключения Дом.ру",
      "items": {
        "speed": {
          "title": "Высокая скорость интернета",
          "text": "Смотрите видео в 4K, работайте из дома и загружайте большие файлы. Выбирайте скорость под свои задачи.",
          "factText": "До 1 Гбит/с"
        },
        "fiber": {
          "title": "Оптоволоконная сеть",
          "text": "Дом.ру использует проводную оптоволоконную инфраструктуру для подключения жилых домов. Технология доступа зависит от адреса.",
          "factText": "FTTB и GPON"
        },
        "wifi6": {
          "title": "Домашний Wi-Fi 6",
          "text": "Роутеры Дом.ру Wave помогают организовать беспроводную сеть для смартфонов, ноутбуков, телевизоров и умных устройств.",
          "factText": "До 50–100 устройств"
        },
        "movix": {
          "title": "Фильмы и сериалы в Movix",
          "text": "Смотрите телеканалы, фильмы и сериалы в одном сервисе. Выбирайте подписки с учетом своих интересов.",
          "factText": "100 000+ фильмов и сериалов"
        },
        "connection": {
          "title": "Удобное оформление подключения",
          "text": "Выберите тариф, проверьте возможность подключения по адресу и согласуйте удобное время визита мастера.",
          "factText": "Заявка онлайн"
        },
        "support": {
          "title": "Поддержка абонентов 24/7",
          "text": "Обращайтесь за помощью по вопросам домашнего интернета, телевидения и оборудования в любое время суток.",
          "factText": "Круглосуточно"
        }
      }
    }
  },
  {
    "blockType": "home.connection_steps",
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
    "blockType": "home.movix",
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
    "blockType": "home.more_possibilities",
    "data": {
      "title": "Больше возможностей с Дом.ру",
      "intro": "Дом.ру — это не только домашний интернет и телевидение. Пользуйтесь бонусами, управляйте услугами онлайн и подключайте дополнительные сервисы для дома.",
      "groups": {
        "payments": {
          "title": "Бонусы и удобная оплата",
          "items": {
            "bonus": {
              "title": "Программа «Дом.ру Бонус»",
              "text": "Получайте бонусы за оплату услуг и участие в акциях. Накопленные бонусы можно использовать для оплаты домашнего интернета и телевидения по правилам программы."
            },
            "promised_payment": {
              "title": "Обещанный платеж",
              "text": "Не успели вовремя пополнить счет? Подключите обещанный платеж, чтобы временно сохранить доступ к интернету до внесения оплаты."
            },
            "autopay": {
              "title": "Автоплатеж",
              "text": "Настройте автоматическую оплату услуг с банковской карты. Деньги будут поступать на счет без необходимости каждый месяц вносить платеж вручную."
            }
          }
        },
        "management": {
          "title": "Свобода и управление услугами",
          "items": {
            "app": {
              "title": "Приложение «Мой Дом.ру»",
              "text": "Проверяйте баланс, меняйте тариф, управляйте домашней сетью и дополнительными услугами со смартфона. Основные настройки доступны в одном приложении."
            },
            "pause": {
              "title": "Приостановка услуг на время отъезда",
              "text": "Уезжаете в отпуск или на дачу? Временно приостановите интернет, чтобы не платить полную абонентскую плату за время отсутствия. Услуга предоставляется на специальных условиях."
            },
            "tariff_builder": {
              "title": "Тариф-конструктор",
              "text": "Соберите пакет услуг под свои потребности: выберите скорость домашнего интернета, телевидение и дополнительные подписки. Платите за выбранный набор услуг."
            }
          }
        },
        "smart_home": {
          "title": "Цифровые сервисы для дома",
          "items": {
            "intercom": {
              "title": "Умный домофон",
              "text": "Смотрите, кто пришел, отвечайте на вызовы и открывайте дверь подъезда со смартфона. Управлять доступом можно даже находясь вне дома."
            },
            "cameras": {
              "title": "Домашнее видеонаблюдение",
              "text": "Следите за квартирой или домом через камеры видеонаблюдения. Просматривайте изображение удаленно и получайте уведомления о движении при использовании совместимого оборудования."
            },
            "city_wifi": {
              "title": "Городской Wi-Fi",
              "text": "Пользуйтесь интернетом Дом.ру за пределами квартиры — в кафе, торговых центрах и других местах с точками доступа. Найти ближайшую сеть можно через приложение «Мой Дом.ру»."
            }
          }
        }
      }
    }
  },
  {
    "blockType": "home.connection_help",
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
    "blockType": "home.city_directory",
    "data": {
      "title": "Выберите свой город",
      "intro": "Посмотрите тарифы и условия подключения в вашем городе.",
      "searchPlaceholder": "Найти город",
      "showMoreText": "Показать ещё"
    }
  },
  {
    "blockType": "home.faq",
    "data": {
      "title": "Популярные вопросы",
      "items": []
    }
  }
]$general_home_data$::jsonb) WITH ORDINALITY AS added(block,ord);

UPDATE "PageTemplate" t SET "content"=coalesce(t."content",'{}'::jsonb) || '{"generalHomeCompositionVersion":"1.0.0","generalHomeImplementationVersion":"general-home-v1"}'::jsonb, "updatedAt"=CURRENT_TIMESTAMP
FROM "_general_home_upgrade" c WHERE t."id"=c."id";
UPDATE "Site" s SET "workingRevision"=c.revision,"updatedAt"=CURRENT_TIMESTAMP FROM "_general_home_upgrade" c WHERE s."id"=c."siteId";

INSERT INTO "ContentRevision" ("id","siteId","entityType","entityId","entityRevision","siteRevision","action","previousSnapshot","snapshot","changedFields","source","createdAt")
SELECT 'general_home_revision_' || md5(c."id"),c."siteId",'PAGE_TEMPLATE',c."id",
  (SELECT coalesce(max(r."entityRevision"),0)+1 FROM "ContentRevision" r WHERE r."entityType"='PAGE_TEMPLATE' AND r."entityId"=c."id"),c.revision,'UPDATE'::"ContentRevisionAction",c.before,
  to_jsonb(t) || jsonb_build_object('blocks',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")),
  '["content.generalHomeCompositionVersion","content.generalHomeImplementationVersion","blocks"]'::jsonb,'migration:0061:general-home-composition',CURRENT_TIMESTAMP
FROM "_general_home_upgrade" c JOIN "PageTemplate" t ON t."id"=c."id";
INSERT INTO "AuditEvent" ("id","siteId","siteRevision","entityType","entityId","action","changedFields","changes","source","createdAt")
SELECT 'general_home_audit_' || md5(c."id"),c."siteId",c.revision,'PAGE_TEMPLATE',c."id",'UPDATE'::"ContentRevisionAction",
  '["content.generalHomeCompositionVersion","content.generalHomeImplementationVersion","blocks"]'::jsonb,
  '{"compositionVersion":"1.0.0","addedBlocks":9,"faqNeedsRealContent":true}'::jsonb,'migration:0061:general-home-composition',CURRENT_TIMESTAMP FROM "_general_home_upgrade" c;
COMMIT;

-- Initialize only working OFFICIAL_SITE data; immutable snapshots and serving activation stay unchanged.
BEGIN;
LOCK TABLE "Site", "Page", "SeoTemplate", "ContentRevision", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "Page" DROP CONSTRAINT "Page_global_scope_check";
ALTER TABLE "Page" ADD CONSTRAINT "Page_global_scope_check" CHECK (
 ("type" IN ('COVERAGE','CITIES','PRIVACY','PERSONAL_DATA_CONSENT','COOKIE_POLICY','ACCOUNT','OFFICIAL_SITE') AND "cityId" IS NULL)
 OR ("type" NOT IN ('COVERAGE','CITIES','PRIVACY','PERSONAL_DATA_CONSENT','COOKIE_POLICY','ACCOUNT','OFFICIAL_SITE') AND "cityId" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Page_official_site_site_key" ON "Page" ("siteId") WHERE "type"='OFFICIAL_SITE' AND "cityId" IS NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Page_official_site_scope_check' AND conrelid='"Page"'::regclass) THEN
  ALTER TABLE "Page" ADD CONSTRAINT "Page_official_site_scope_check" CHECK ("type"<>'OFFICIAL_SITE' OR ("cityId" IS NULL AND "slug"='official-site-domru'));
 END IF;
END $$;
CREATE TEMP TABLE _official_site_sites ON COMMIT DROP AS
SELECT s."id",s."workingRevision"+1 AS revision FROM "Site" s JOIN "Provider" p ON p."id"=s."providerId"
WHERE p."slug"='domru' AND NOT EXISTS (SELECT 1 FROM "Page" a WHERE a."siteId"=s."id" AND a."type"='OFFICIAL_SITE');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "City" c JOIN _official_site_sites s ON s."id"=c."siteId" WHERE c.slug='official-site-domru')
 OR EXISTS (SELECT 1 FROM "Page" p JOIN _official_site_sites s ON s."id"=p."siteId" WHERE p."cityId" IS NULL AND p.slug='official-site-domru')
 OR EXISTS (SELECT 1 FROM "Redirect" r JOIN _official_site_sites s ON s."id"=r."siteId" WHERE r."sourcePath"='/official-site-domru')
 THEN RAISE EXCEPTION 'OFFICIAL_SITE canonical URL is occupied; preserve authored content and resolve collision'; END IF;
END $$;
INSERT INTO "Page" (id,"siteId",type,slug,status,title,content,"createdAt","updatedAt")
SELECT 'official_site_page_'||md5(s.id),s.id,'OFFICIAL_SITE','official-site-domru','PUBLISHED','Официальный сайт Дом.ру',$official_site$
{
  "version": "1.0.0",
  "hero": {
    "h1": "Официальный сайт провайдера Дом.ру",
    "intro": "Официальный сайт Дом.ру — это современный и технологичный портал, на котором представлена полная информация для действующих и будущих клиентов интернет-провайдера.\n\nВся информация разбита на разделы, поэтому в ней легко ориентироваться. Например — телевидение, интернет, тарифы, акции, помощь, оплата и другие.\n\nПользоваться официальным порталом Дом.ру одинаково удобно и с компьютера, и со смартфона. Все страницы оптимизированы под любые устройства и смартфоны.\n\nОсновная задача сайта — рассказать о том, как быстро подключить интернет и цифровое телевидение в вашем городе."
  },
  "officialUrl": "https://dom.ru/",
  "images": {
    "hero": {
      "src": "/images/official-site/v1/hero-16c4c3a2c8d854e0.png",
      "alt": "Ноутбук и смартфон с интерфейсом Дом.ру",
      "caption": "интернет-провайдер Дом.ru"
    },
    "menu": {
      "src": "/images/official-site/v1/menu-c7a9ad412cfdd31c.png",
      "alt": "Главное меню",
      "caption": "Главное меню"
    },
    "overview": {
      "src": "/images/official-site/v1/overview-c5da044f96e4e279.png",
      "alt": "Главная страница сайта Дом ру",
      "caption": "Главная страница сайта Дом ру"
    },
    "constructor": {
      "src": "/images/official-site/v1/constructor-2b2bfe8c4ac08b68.png",
      "alt": "Собери уникальный тариф",
      "caption": "Иллюстрация: «Собери уникальный тариф»"
    },
    "regional": {
      "src": "/images/official-site/v1/regional-281a0a4554144631.png",
      "alt": "Иллюстрация: «Тарифы и фильтры» · горизонтальный просмотр",
      "caption": "Иллюстрация: «Карточки тарифов» · горизонтальный просмотр"
    },
    "equipment": {
      "src": "/images/official-site/v1/equipment-6590634011bb2127.png",
      "alt": "Иллюстрация: «Оборудование Домру» · горизонтальный просмотр",
      "caption": "Иллюстрация: «Оборудование Домру» · горизонтальный просмотр"
    },
    "additional": {
      "src": "/images/official-site/v1/additional-ed816a01ede6c88a.png",
      "alt": "Иллюстрация: «Карточки услуг»",
      "caption": "Иллюстрация: «Карточки услуг»"
    }
  },
  "faq": {
    "items": [
      {
        "question": "Как позвонить в Дом.ру?",
        "answer": "Телефоны горячей линии Дом.ру:\n\n1. Подключение новых абонентов: 8-800-555-72-44\n\n2. Служба технической поддержки: 8-800-250-77-77\n\n3. Поддержка корпоративных клиентов: 8-800-222-86-34\n\nЗвонок бесплатный с любых телефонов на территории России, горячая линия работает круглосуточно."
      },
      {
        "question": "В каких регионах работает провайдер Дом.ру?",
        "answer": "Дом.ру предоставляет услуги в более чем 560 населенных пунктах в 61 регионе России. Основные города присутствия: Москва, Санкт-Петербург, Екатеринбург, Новосибирск, Нижний Новгород, Казань, Саратов, Волгоград, Иркутск и др."
      },
      {
        "question": "Как проверить подключение дома к Дом.ру?",
        "answer": "Для проверки возможности подключения к Дом.ру:\n\n1. Оставьте заявку на нашем сайте — проверим возможность подключения и свяжемся с вами.\n\n2. Позвоните на номер отдела подключений 8-800-555-72-44 (Бесплатный звонок). Оператор моментально проверит возможность подключения."
      },
      {
        "question": "Как оплатить Дом.ру?",
        "answer": "Вы можете оплатить услуги провайдера любым удобным для вас способом.\n\n— Дебетовой или кредитной картой\n— Переводом со счета мобильного телефона\n— SberPay\n— Яндекс Кошелек\n— Перевод через СБП\n— Через банкомат\n— Автоплатеж в приложении\n— Автоплатеж в личном кабинете"
      },
      {
        "question": "Как оставить заявку на подключение к Дом.ру?",
        "answer": "Для подключения интернета и телевидения Дом.ру:\n\n1. Позвонить на номер отдела подключений 8-800-555-72-44 (Бесплатный звонок).\n\n2. Оставить заявку на нашем сайте.\n\n3. Посетить ближайший офис продажи и обслуживания."
      },
      {
        "question": "Как отключить Дом.ру и расторгнуть договор?",
        "answer": "Для отключения услуг и расторжения договора:\n\n— Контакт с поддержкой: Позвонить по номеру 8-800-250-77-77 или посетить офис компании.\n— Заполнение заявления: Подготовить и отправить заявление на расторжение договора.\n— Возврат оборудования: Вернуть арендованное оборудование в офис компании.\n— Подтверждение: Дождаться подтверждения расторжения договора и отключения услуг."
      },
      {
        "question": "Как и где узнать об акциях Дом.ру?",
        "answer": "Информацию о текущих акциях и специальных предложениях можно узнать:\n\n— В отделе подключений, позвонив по номеру 8-800-555-72-44\n— В разделе акций на официальном сайте Дом.ру\n— В специальном разделе приложения Мой Дом.ру\n— На страницах Дом.ру в социальных сетях\n— Уточнить акции можно у консультантов в офисах компании"
      },
      {
        "question": "Как узнать свой тариф Дом.ру?",
        "answer": "Узнать свой действующий тариф Дом.ру можно следующим образом:\n\n— В личном кабинете на официальном сайте Дом.ру. Информация о вашем тарифе будет указана в разделе «Услуги».\n— На главном экране в мобильном приложении Дом.ру.\n— Позвоните по номеру горячей линии 8-800-250-77-77 и запросите информацию у оператора.\n— Узнать тариф можно лично, у консультантов в ближайшем офисе Дом.ру."
      }
    ]
  }
}
$official_site$::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM _official_site_sites s;
INSERT INTO "SeoTemplate" (id,"siteId",kind,"titleTemplate","descriptionTemplate","indexState","createdAt","updatedAt")
SELECT 'official_site_seo_'||md5(s.id),s.id,'OFFICIAL_SITE','Официальный сайт Дом.ру — обзор и навигация','Обзор официального сайта Дом.ру: услуги, тарифы, оборудование и ответы на вопросы.','INDEX',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM _official_site_sites s ON CONFLICT ("siteId",kind) DO NOTHING;
UPDATE "Site" s SET "workingRevision"=a.revision,"updatedAt"=CURRENT_TIMESTAMP FROM _official_site_sites a WHERE a.id=s.id;
INSERT INTO "ContentRevision" (id,"siteId","entityType","entityId","entityRevision","siteRevision",action,snapshot,"changedFields",source,"createdAt")
SELECT 'official_site_revision_'||md5(p.id),p."siteId",'PAGE',p.id,1,a.revision,'CREATE',to_jsonb(p),'["content","slug","status"]'::jsonb,'migration:0072:official_site',CURRENT_TIMESTAMP FROM "Page" p JOIN _official_site_sites a ON a.id=p."siteId" WHERE p.type='OFFICIAL_SITE';
INSERT INTO "AuditEvent" (id,"siteId","siteRevision","entityType","entityId",action,"changedFields",changes,source,"createdAt")
SELECT 'official_site_audit_'||md5(a.id),a.id,a.revision,'SITE',a.id,'UPDATE','["pages","seoTemplates"]'::jsonb,'{"initializedOfficialSite":true,"preservedPublishedSnapshots":true}'::jsonb,'migration:0072:official_site',CURRENT_TIMESTAMP FROM _official_site_sites a;
COMMIT;

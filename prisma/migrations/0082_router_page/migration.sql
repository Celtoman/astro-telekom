-- Initialize only working EQUIPMENT_ROUTER data; immutable snapshots and serving activation stay unchanged.
BEGIN;
LOCK TABLE "Site", "Page", "SeoTemplate", "ContentRevision", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "Page" DROP CONSTRAINT "Page_global_scope_check";
ALTER TABLE "Page" ADD CONSTRAINT "Page_global_scope_check" CHECK (
  ("type" IN ('COVERAGE','CITIES','PRIVACY','PERSONAL_DATA_CONSENT','COOKIE_POLICY','ACCOUNT','OFFICIAL_SITE','SPEED_TEST','EQUIPMENT_ROUTER') AND "cityId" IS NULL)
  OR ("type" NOT IN ('COVERAGE','CITIES','PRIVACY','PERSONAL_DATA_CONSENT','COOKIE_POLICY','ACCOUNT','OFFICIAL_SITE','SPEED_TEST','EQUIPMENT_ROUTER') AND "cityId" IS NOT NULL)
  OR ("type" = 'FAQ' AND "cityId" IS NULL AND slug = 'faq')
);
CREATE UNIQUE INDEX IF NOT EXISTS "Page_router_site_key" ON "Page" ("siteId") WHERE "type"='EQUIPMENT_ROUTER' AND "cityId" IS NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Page_router_scope_check' AND conrelid='"Page"'::regclass) THEN
  ALTER TABLE "Page" ADD CONSTRAINT "Page_router_scope_check" CHECK ("type"<>'EQUIPMENT_ROUTER' OR ("cityId" IS NULL AND "slug"='wifi-router'));
 END IF;
END $$;
CREATE TEMP TABLE _router_sites ON COMMIT DROP AS
SELECT s."id",s."workingRevision"+1 AS revision FROM "Site" s JOIN "Provider" p ON p."id"=s."providerId"
WHERE p."slug"='domru' AND NOT EXISTS (SELECT 1 FROM "Page" a WHERE a."siteId"=s."id" AND a."type"='EQUIPMENT_ROUTER');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "City" c JOIN _router_sites s ON s."id"=c."siteId" WHERE c.slug='wifi-router')
 OR EXISTS (SELECT 1 FROM "Page" p JOIN _router_sites s ON s."id"=p."siteId" WHERE p."cityId" IS NULL AND p.slug='wifi-router')
 OR EXISTS (SELECT 1 FROM "Redirect" r JOIN _router_sites s ON s."id"=r."siteId" WHERE r."sourcePath"='/wifi-router')
 THEN RAISE EXCEPTION 'EQUIPMENT_ROUTER canonical URL is occupied; preserve authored content and resolve collision'; END IF;
END $$;
INSERT INTO "Page" (id,"siteId",type,slug,status,title,content,"createdAt","updatedAt")
SELECT 'router_page_'||md5(s.id),s.id,'EQUIPMENT_ROUTER','wifi-router','PUBLISHED','Wi-Fi-роутеры Дом.ру',$router$
{
  "version": "1.0.0",
  "hero": {
    "eyebrow": "Оборудование для дома",
    "h1": "Wi-Fi-роутеры Дом.ру для\nдомашнего интернета",
    "intro": "Сравните роутеры Wave, Wave Plus и Mesh-систему по характеристикам, покрытию и стоимости. Выберите модель для вашего тарифа и дома."
  },
  "benefits": {
    "title": "Преимущества покупки роутера Дом.ру",
    "delivery": {
      "title": "Доставка и настройка",
      "body": "При заказе уточним условия доставки и возможность настройки роутера специалистом."
    },
    "support": {
      "title": "Удалённая поддержка",
      "body": "С вопросами по работе роутера можно обратиться в поддержку Дом.ру по телефону или в приложении."
    }
  },
  "catalog": { "title": "Выберите свой роутер", "subtitle": "" },
  "comparison": {
    "title": "Характеристики и стоимость",
    "mobileHint": "Листайте таблицу вбок, чтобы сравнить модели."
  },
  "mesh": {
    "title": "Один Wi-Fi на весь дом\nс Mesh-системой Дом.ру",
    "intro": "В большой квартире или частном доме сигнала одного роутера бывает недостаточно. Mesh-система Дом.ру Wave Mesh Plus AX3000 состоит из двух модулей, которые создают общую сеть Wi-Fi и помогают улучшить покрытие в дальних комнатах.",
    "note": "Иллюстрация — пример расположения и покрытия. Не является инженерной схемой.",
    "seamless": {
      "title": "Бесшовный Wi-Fi",
      "body": "Оба модуля используют одно имя сети и пароль. При перемещении по дому смартфон или ноутбук может автоматически переключаться между ними."
    },
    "coverage": "Модули размещают в разных частях квартиры или дома, чтобы улучшить связь там, где плохо доходит сигнал обычного роутера.",
    "devices": "Технология Wi-Fi 6 позволяет одновременно подключать смартфоны, ноутбуки, телевизоры и устройства умного дома.",
    "button": "Узнать стоимость"
  },
  "consultation": {
    "title": "Поможем выбрать роутер",
    "intro": "Уточним модель, стоимость и получение оборудования для вашего адреса.",
    "formTitle": "Перезвоним вам",
    "note": "Подтвердим условия до оформления заявки."
  },
  "faq": {
    "title": "Вопросы о роутерах",
    "items": [
      {
        "question": "Как выбрать между Wave и Wave Plus?",
        "answer": "Wave AX1500 подходит для тарифов до 500 Мбит/с, Wave Plus AX3000 — до 1000 Мбит/с. У Plus также заявлены USB 3.0 и EasyMesh. Сравните площадь, число устройств и цену в таблице."
      },
      {
        "question": "AX3000 — это скорость моего интернета?",
        "answer": "Нет. Это класс Wi-Fi и сумма предельных скоростей диапазонов. Скорость интернета ограничивают тариф, проводное подключение, ваше устройство и условия приёма сигнала."
      },
      {
        "question": "Можно расширить сеть Wave Plus?",
        "answer": "В описании Wave Plus заявлен EasyMesh. Перед добавлением модулей нужно проверить совместимость устройств и прошивок. Второй модуль размещают там, где он уверенно принимает сигнал первого."
      },
      {
        "question": "Что входит в Mesh-комплект?",
        "answer": "В линейке Wave Mesh Plus есть комплекты из двух модулей. Состав доступного предложения и комплектацию подтвердим до оформления заказа."
      },
      {
        "question": "Сколько стоит роутер и как его оплатить?",
        "answer": "Цена покупки и условия рассрочки указаны в карточках моделей. Условия доставки и настройки уточним при заказе."
      },
      {
        "question": "Можно использовать свой роутер?",
        "answer": "Да, если он совместим с технологией подключения и выбранным тарифом. Назовите специалисту точную модель — он поможет проверить совместимость до покупки нового оборудования."
      }
    ]
  }
}
$router$::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM _router_sites s;
INSERT INTO "SeoTemplate" (id,"siteId",kind,"titleTemplate","descriptionTemplate","indexState","createdAt","updatedAt")
SELECT 'router_seo_'||md5(s.id),s.id,'EQUIPMENT_ROUTER','Wi-Fi-роутеры Дом.ру — модели, цены и характеристики','Сравните Wi-Fi-роутеры Дом.ру Wave, Wave Plus и Mesh-систему. Модели, характеристики, цены и помощь с выбором.','INDEX',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM _router_sites s ON CONFLICT ("siteId",kind) DO NOTHING;
UPDATE "Site" s SET "workingRevision"=a.revision,"updatedAt"=CURRENT_TIMESTAMP FROM _router_sites a WHERE a.id=s.id;
INSERT INTO "ContentRevision" (id,"siteId","entityType","entityId","entityRevision","siteRevision",action,snapshot,"changedFields",source,"createdAt")
SELECT 'router_revision_'||md5(p.id),p."siteId",'PAGE',p.id,1,a.revision,'CREATE',to_jsonb(p),'["content","slug","status"]'::jsonb,'migration:0082:router',CURRENT_TIMESTAMP FROM "Page" p JOIN _router_sites a ON a.id=p."siteId" WHERE p.type='EQUIPMENT_ROUTER';
INSERT INTO "AuditEvent" (id,"siteId","siteRevision","entityType","entityId",action,"changedFields",changes,source,"createdAt")
SELECT 'router_audit_'||md5(a.id),a.id,a.revision,'SITE',a.id,'UPDATE','["pages","seoTemplates"]'::jsonb,'{"initializedRouterPage":true,"preservedPublishedSnapshots":true}'::jsonb,'migration:0082:router',CURRENT_TIMESTAMP FROM _router_sites a;
COMMIT;

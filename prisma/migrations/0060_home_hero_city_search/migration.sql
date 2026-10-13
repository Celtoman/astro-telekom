-- Only working HOME changes. Published snapshots and CITY_HOME remain immutable.
BEGIN;
LOCK TABLE "Site", "PageTemplate", "PageTemplateBlock", "ContentRevision", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE "_home_hero_v2" ON COMMIT DROP AS
SELECT t."id", t."siteId", s."name", s."workingRevision" + 1 AS revision,
  to_jsonb(t) || jsonb_build_object('blocks', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")) AS before
FROM "PageTemplate" t JOIN "Site" s ON s."id"=t."siteId"
WHERE t."kind"='HOME' AND coalesce(t."content"->>'firstScreenPassportVersion','1.0.0') <> '2.0.0';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "_home_hero_v2" c JOIN "PageTemplate" t ON t."id"=c."id"
    WHERE coalesce(t."content"->>'firstScreenPassportVersion','1.0.0') <> '1.0.0'
    OR (SELECT count(*) FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND b."blockType"='home.hero') <> 1
    OR EXISTS (SELECT 1 FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND b."visible" AND b."blockType" <> 'home.hero')) THEN
    RAISE EXCEPTION 'HOME Hero replacement requires known 1.0.0 contract and exactly one home.hero';
  END IF;
END $$;
UPDATE "PageTemplateBlock" b SET "data"=jsonb_build_object(
  'title', 'Домашний интернет и ТВ ' || c."name" || ' <red>в вашем городе</red>',
  'text', 'Выберите город, чтобы посмотреть тарифы ' || c."name" || '. Возможность подключения проверим по адресу.',
  'cityPlaceholder','Ваш город, например, Москва.', 'searchButtonText','Найти город', 'allCitiesText','Все города',
  'emptyMessage','Город не найден. Проверьте название или выберите его из списка.',
  'inputErrorMessage','Введите название города или выберите его из списка.',
  'steps',jsonb_build_array(
    jsonb_build_object('title','Выберите город','text','Найдите свой город в списке.'),
    jsonb_build_object('title','Посмотрите тарифы','text','Сравните тарифы интернета и ТВ'),
    jsonb_build_object('title','Проверьте адрес','text',E'Узнайте, можно ли подключить\n' || c."name" || ' в вашем доме'))),
  "source"='migration:0060:home-hero-city-search'
FROM "_home_hero_v2" c WHERE b."templateId"=c."id" AND b."blockType"='home.hero';
UPDATE "PageTemplate" t SET "content"=coalesce(t."content",'{}') || '{"firstScreenPassportVersion":"2.0.0","firstScreenImplementationVersion":"home-hero-city-search-v2"}'::jsonb, "updatedAt"=CURRENT_TIMESTAMP
FROM "_home_hero_v2" c WHERE t."id"=c."id";
UPDATE "Site" s SET "workingRevision"=c.revision,"updatedAt"=CURRENT_TIMESTAMP FROM "_home_hero_v2" c WHERE s."id"=c."siteId";
INSERT INTO "ContentRevision" ("id","siteId","entityType","entityId","entityRevision","siteRevision","action","previousSnapshot","snapshot","changedFields","source","createdAt")
SELECT 'home_hero_v2_revision_' || md5(c."id"),c."siteId",'PAGE_TEMPLATE',c."id",
  (SELECT coalesce(max(r."entityRevision"),0)+1 FROM "ContentRevision" r WHERE r."entityType"='PAGE_TEMPLATE' AND r."entityId"=c."id"),c.revision,'UPDATE'::"ContentRevisionAction",c.before,
  to_jsonb(t) || jsonb_build_object('blocks',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id")),
  '["blocks.data","content.firstScreenPassportVersion","content.firstScreenImplementationVersion"]'::jsonb,'migration:0060:home-hero-city-search',CURRENT_TIMESTAMP
FROM "_home_hero_v2" c JOIN "PageTemplate" t ON t."id"=c."id";
INSERT INTO "AuditEvent" ("id","siteId","siteRevision","entityType","entityId","action","changedFields","changes","source","createdAt")
SELECT 'home_hero_v2_audit_' || md5(c."id"),c."siteId",c.revision,'PAGE_TEMPLATE',c."id",'UPDATE'::"ContentRevisionAction",
  '["blocks.data","content.firstScreenPassportVersion","content.firstScreenImplementationVersion"]'::jsonb,
  '{"passportVersion":"2.0.0","implementationVersion":"home-hero-city-search-v2"}'::jsonb,'migration:0060:home-hero-city-search',CURRENT_TIMESTAMP FROM "_home_hero_v2" c;
COMMIT;

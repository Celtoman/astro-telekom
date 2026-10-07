-- Only working templates change. Immutable publications and legacy PageBlock remain intact.
BEGIN;
LOCK TABLE "Site", "PageTemplate", "PageTemplateBlock", "ContentRevision", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE "_home_before" ON COMMIT DROP AS
SELECT t."id", t."siteId", to_jsonb(t) || jsonb_build_object('blocks', (
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b."position"), '[]'::jsonb) FROM "PageTemplateBlock" b WHERE b."templateId"=t."id"
)) AS snapshot FROM "PageTemplate" t WHERE t."kind"='CITY_HOME';
CREATE TEMP TABLE "_home_changed" ON COMMIT DROP AS
SELECT t."id", t."siteId", s."workingRevision"+1 AS revision FROM "PageTemplate" t JOIN "Site" s ON s."id"=t."siteId"
WHERE t."kind"='CITY_HOME' AND coalesce(t."content"->>'homeCompositionVersion','') <> '2.0.0';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "_home_changed" t WHERE (
  SELECT jsonb_agg(b."blockType" ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId"=t."id" AND b."visible"
 ) IS DISTINCT FROM '["hero","service_grid","tariff_grid","steps","feature_grid","feature_grid","faq"]'::jsonb) THEN
  RAISE EXCEPTION 'CITY_HOME requires the exact legacy seven-block composition before migration';
 END IF;
END $$;
UPDATE "PageTemplateBlock" b SET "visible"=false
FROM "_home_changed" t WHERE b."templateId"=t."id" AND b."blockType" NOT IN ('hero','tariff_grid');
UPDATE "PageTemplateBlock" b SET "data"=jsonb_build_object(
 'title', b."data"->>'title', 'text', 'Сравните скорость, телевидение и дополнительные возможности. В карточке сразу видны ключевые условия.',
 'connectButtonText','Подключить','detailsButtonText','Подробнее','moreButtonText','Показать ещё','initialCount',6,'sort','PRICE_ASC'),
 "source"='migration:0058:home-composition' FROM "_home_changed" t WHERE b."templateId"=t."id" AND b."blockType"='tariff_grid';
UPDATE "PageTemplate" t SET "content"=coalesce(t."content",'{}') || jsonb_build_object(
 'homeCompositionVersion','2.0.0','tariffCollectionPassportVersion','1.0.0','tariffCollectionImplementationVersion','tariff-collection-v1'), "updatedAt"=CURRENT_TIMESTAMP
FROM "_home_changed" changed WHERE t."id"=changed."id";
UPDATE "Site" s SET "workingRevision"=changed.revision,"updatedAt"=CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "siteId", revision FROM "_home_changed") changed WHERE s."id"=changed."siteId";
INSERT INTO "ContentRevision" ("id", "siteId", "entityType", "entityId", "entityRevision", "siteRevision", "action", "previousSnapshot", "snapshot", "changedFields", "source", "createdAt")
SELECT 'home_composition_revision_' || md5(t."id"), t."siteId", 'PAGE_TEMPLATE', t."id",
  (SELECT coalesce(max(r."entityRevision"), 0) + 1 FROM "ContentRevision" r WHERE r."entityType" = 'PAGE_TEMPLATE' AND r."entityId" = t."id"),
  changed.revision, CASE WHEN before."id" IS NULL THEN 'CREATE' ELSE 'UPDATE' END::"ContentRevisionAction",
  before.snapshot, to_jsonb(t) || jsonb_build_object('blocks', (
    SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId" = t."id")),
  '["blocks.visible","blocks.data","content.homeCompositionVersion","content.tariffCollectionPassportVersion","content.tariffCollectionImplementationVersion"]'::jsonb,
  'migration:0058:home-composition', CURRENT_TIMESTAMP
FROM "_home_changed" changed JOIN "PageTemplate" t ON t."id" = changed."id"
LEFT JOIN "_home_before" before ON before."id" = t."id";

INSERT INTO "AuditEvent" ("id", "siteId", "siteRevision", "entityType", "entityId", "action", "changedFields", "changes", "source", "createdAt")
SELECT 'home_composition_audit_' || md5(r."entityId"), r."siteId", r."siteRevision", r."entityType", r."entityId", r."action", r."changedFields",
  jsonb_build_object('homeCompositionVersion', '2.0.0', 'passportVersion', '1.0.0', 'implementationVersion', 'tariff-collection-v1'), r."source", CURRENT_TIMESTAMP
FROM "ContentRevision" r JOIN "_home_changed" changed ON changed."id" = r."entityId"
WHERE r."id" = 'home_composition_revision_' || md5(r."entityId");
COMMIT;

-- Move existing first-screen content into the two owner-approved templates.
-- Published snapshots are immutable and deliberately remain untouched.
BEGIN;
LOCK TABLE "Site", "PageTemplate", "PageTemplateBlock", "ContentRevision", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE "_first_screen_before" ON COMMIT DROP AS
SELECT t."id", t."siteId", to_jsonb(t) || jsonb_build_object('blocks', (
  SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b."position"), '[]'::jsonb)
  FROM "PageTemplateBlock" b WHERE b."templateId" = t."id"
)) AS snapshot
FROM "PageTemplate" t WHERE t."kind" IN ('HOME', 'CITY_HOME');

INSERT INTO "PageTemplate" ("id", "siteId", "kind", "titleTemplate", "status", "content", "createdAt", "updatedAt")
SELECT 'first_screen_home_' || md5(s."id"), s."id", 'HOME',
  'Подключение домашнего интернета и телевидения ' || s."name", 'PUBLISHED', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Site" s WHERE NOT EXISTS (SELECT 1 FROM "PageTemplate" t WHERE t."siteId" = s."id" AND t."kind" = 'HOME');

CREATE TEMP TABLE "_first_screen_changed" ON COMMIT DROP AS
SELECT t."id", t."siteId", t."kind", s."workingRevision" + 1 AS revision
FROM "PageTemplate" t JOIN "Site" s ON s."id" = t."siteId"
WHERE t."kind" IN ('HOME', 'CITY_HOME') AND coalesce(t."content"->>'firstScreenPassportVersion', '') <> '1.0.0';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "_first_screen_changed" t WHERE t."kind" = 'CITY_HOME'
    AND (SELECT count(*) FROM "PageTemplateBlock" b WHERE b."templateId" = t."id" AND b."blockType" = 'hero') <> 1) THEN
    RAISE EXCEPTION 'CITY_HOME requires exactly one hero before first-screen migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "_first_screen_changed" t WHERE t."kind" = 'HOME'
    AND EXISTS (SELECT 1 FROM "PageTemplateBlock" b WHERE b."templateId" = t."id")) THEN
    RAISE EXCEPTION 'Existing HOME composition requires owner review before migration';
  END IF;
END $$;

INSERT INTO "PageTemplateBlock" ("id", "templateId", "blockType", "position", "visible", "data", "source")
SELECT 'first_screen_home_block_' || md5(t."siteId"), t."id", 'home.hero', 10, true,
  jsonb_build_object('title', 'Подключение домашнего интернета и телевидения ' || s."name",
    'text', 'Укажите адрес, чтобы проверить возможность подключения Дом.ру в вашем доме и узнать о доступных услугах.',
    'image', '/images/figma/home-hero.png', 'imageAlt', 'Wi-Fi-роутер, ТВ-приставка и пульт для домашнего подключения',
    'addressPlaceholder', 'Введите ваш адрес', 'checkButtonText', 'Проверить',
    'chips', jsonb_build_array('Бесплатная проверка', 'Точные результаты', 'Поможем с подключением')),
  'migration:0056:first-screen'
FROM "_first_screen_changed" t JOIN "Site" s ON s."id" = t."siteId" WHERE t."kind" = 'HOME';

UPDATE "PageTemplateBlock" b SET "data" =
  (b."data" - 'eyebrow' - 'ctaText' - 'ctaHref') || jsonb_build_object(
    'image', '/images/figma/home-hero.png', 'imageAlt', 'Wi-Fi-роутер, ТВ-приставка и пульт для домашнего подключения',
    'addressPlaceholder', 'Введите ваш адрес', 'checkButtonText', 'Проверить', 'tariffsCtaText', 'Посмотреть тарифы'),
  "source" = 'migration:0056:first-screen'
FROM "_first_screen_changed" t WHERE b."templateId" = t."id" AND t."kind" = 'CITY_HOME' AND b."blockType" = 'hero';

UPDATE "PageTemplate" t SET "content" = coalesce(t."content", '{}') || jsonb_build_object(
  'firstScreenPassportVersion', '1.0.0', 'firstScreenImplementationVersion', 'first-screen-editor-v1'), "updatedAt" = CURRENT_TIMESTAMP
FROM "_first_screen_changed" changed WHERE t."id" = changed."id";
UPDATE "Site" s SET "workingRevision" = changed.revision, "updatedAt" = CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "siteId", revision FROM "_first_screen_changed") changed WHERE s."id" = changed."siteId";

INSERT INTO "ContentRevision" ("id", "siteId", "entityType", "entityId", "entityRevision", "siteRevision", "action", "previousSnapshot", "snapshot", "changedFields", "source", "createdAt")
SELECT 'first_screen_revision_' || md5(t."id"), t."siteId", 'PAGE_TEMPLATE', t."id",
  (SELECT coalesce(max(r."entityRevision"), 0) + 1 FROM "ContentRevision" r WHERE r."entityType" = 'PAGE_TEMPLATE' AND r."entityId" = t."id"),
  changed.revision, CASE WHEN before."id" IS NULL THEN 'CREATE' ELSE 'UPDATE' END::"ContentRevisionAction",
  before.snapshot, to_jsonb(t) || jsonb_build_object('blocks', (
    SELECT jsonb_agg(to_jsonb(b) ORDER BY b."position") FROM "PageTemplateBlock" b WHERE b."templateId" = t."id")),
  '["blocks.data","content.firstScreenPassportVersion","content.firstScreenImplementationVersion"]'::jsonb,
  'migration:0056:first-screen', CURRENT_TIMESTAMP
FROM "_first_screen_changed" changed JOIN "PageTemplate" t ON t."id" = changed."id"
LEFT JOIN "_first_screen_before" before ON before."id" = t."id";

INSERT INTO "AuditEvent" ("id", "siteId", "siteRevision", "entityType", "entityId", "action", "changedFields", "changes", "source", "createdAt")
SELECT 'first_screen_audit_' || md5(r."entityId"), r."siteId", r."siteRevision", r."entityType", r."entityId", r."action", r."changedFields",
  jsonb_build_object('passportVersion', '1.0.0', 'implementationVersion', 'first-screen-editor-v1'), r."source", CURRENT_TIMESTAMP
FROM "ContentRevision" r JOIN "_first_screen_changed" changed ON changed."id" = r."entityId"
WHERE r."id" = 'first_screen_revision_' || md5(r."entityId");
COMMIT;

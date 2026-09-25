-- Keep legacy Page/PageBlock rows for historical references and the C6 cleanup.
-- Abort before writing if published HOME content is not one shared template.
ALTER TYPE "ContentEntityType" ADD VALUE 'PAGE_TEMPLATE';
CREATE TYPE "PageTemplateKind" AS ENUM (
  'HOME', 'COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT',
  'COOKIE_POLICY', 'CITY_HOME', 'CITY_TARIFF_DETAIL'
);

BEGIN;

CREATE TABLE "PageTemplate" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "kind" "PageTemplateKind" NOT NULL,
  "titleTemplate" TEXT NOT NULL,
  "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
  "content" JSONB,
  "seo" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PageTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PageTemplate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PageTemplate_siteId_kind_key" ON "PageTemplate"("siteId", "kind");

CREATE TABLE "PageTemplateBlock" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "blockType" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "data" JSONB NOT NULL,
  "source" TEXT,
  CONSTRAINT "PageTemplateBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PageTemplateBlock_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PageTemplateBlock_templateId_position_key" ON "PageTemplateBlock"("templateId", "position");

ALTER TABLE "Page" ADD COLUMN "templateId" TEXT;
ALTER TABLE "Page" ADD CONSTRAINT "Page_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "PageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;

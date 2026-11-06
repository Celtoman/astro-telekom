-- Add editorial drafts without changing any immutable content snapshots.
BEGIN;
-- CreateEnum
CREATE TYPE "EditorialKind" AS ENUM ('ARTICLE', 'CATEGORY', 'NEWS_SETTINGS', 'NOT_FOUND');

-- DropIndex
DROP INDEX "SitePublication_siteId_siteRevision_key";

-- AlterTable
ALTER TABLE "SitePublication" ADD COLUMN     "basePublicationId" TEXT,
ADD COLUMN     "changeSetDigest" TEXT,
ADD COLUMN     "releaseSequence" SERIAL NOT NULL,
ADD COLUMN     "scopeKey" TEXT NOT NULL DEFAULT 'legacy';

-- Preserve source revisions while backfilling a deterministic release order.
WITH ordered AS (
 SELECT id, row_number() OVER (ORDER BY "createdAt", id)::integer AS n FROM "SitePublication"
)
UPDATE "SitePublication" p SET "releaseSequence"=ordered.n FROM ordered WHERE p.id=ordered.id;
SELECT setval(pg_get_serial_sequence('"SitePublication"','releaseSequence'), GREATEST(COALESCE((SELECT max("releaseSequence") FROM "SitePublication"),0),1), EXISTS(SELECT 1 FROM "SitePublication"));

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "publishedDate" TIMESTAMPTZ(3) NOT NULL,
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "everPublished" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" INTEGER,
    "sourceHash" TEXT,
    "sourceUrl" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsCategory" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "sourceId" INTEGER,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NewsCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialSettings" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kind" "EditorialKind" NOT NULL,
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EditorialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialRevision" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kind" "EditorialKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "actorId" TEXT,
    "checkpoint" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "derivatives" JSONB NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialPublicationItem" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "kind" "EditorialKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB,

    CONSTRAINT "EditorialPublicationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsArticle_siteId_publishedDate_id_idx" ON "NewsArticle"("siteId", "publishedDate", "id");

-- CreateIndex
CREATE INDEX "NewsArticle_categoryId_idx" ON "NewsArticle"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_siteId_slug_key" ON "NewsArticle"("siteId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_siteId_sourceId_key" ON "NewsArticle"("siteId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsCategory_siteId_slug_key" ON "NewsCategory"("siteId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "NewsCategory_siteId_sourceId_key" ON "NewsCategory"("siteId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialSettings_siteId_kind_key" ON "EditorialSettings"("siteId", "kind");

-- CreateIndex
CREATE INDEX "EditorialRevision_siteId_kind_entityId_createdAt_idx" ON "EditorialRevision"("siteId", "kind", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialRevision_siteId_kind_entityId_revision_key" ON "EditorialRevision"("siteId", "kind", "entityId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_siteId_sha256_key" ON "MediaAsset"("siteId", "sha256");

-- CreateIndex
CREATE INDEX "EditorialPublicationItem_kind_entityId_revision_idx" ON "EditorialPublicationItem"("kind", "entityId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialPublicationItem_publicationId_kind_entityId_key" ON "EditorialPublicationItem"("publicationId", "kind", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePublication_releaseSequence_key" ON "SitePublication"("releaseSequence");

-- CreateIndex
CREATE INDEX "SitePublication_siteId_releaseSequence_idx" ON "SitePublication"("siteId", "releaseSequence");

-- CreateIndex
CREATE UNIQUE INDEX "SitePublication_siteId_siteRevision_scopeKey_key" ON "SitePublication"("siteId", "siteRevision", "scopeKey");

-- AddForeignKey
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NewsCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsCategory" ADD CONSTRAINT "NewsCategory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialSettings" ADD CONSTRAINT "EditorialSettings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialRevision" ADD CONSTRAINT "EditorialRevision_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialPublicationItem" ADD CONSTRAINT "EditorialPublicationItem_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "SitePublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

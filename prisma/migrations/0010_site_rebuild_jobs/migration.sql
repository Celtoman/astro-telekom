CREATE TYPE "SiteRebuildStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "SiteRebuild" (
  "id" TEXT NOT NULL,
  "siteId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "status" "SiteRebuildStatus" NOT NULL DEFAULT 'PENDING',
  "triggerEntity" TEXT NOT NULL,
  "triggerEntityId" TEXT NOT NULL,
  "affectedPaths" JSONB NOT NULL,
  "requestedRevision" INTEGER NOT NULL DEFAULT 1,
  "processingRevision" INTEGER NOT NULL DEFAULT 0,
  "publishedRevision" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastError" TEXT,
  "providerStatus" TEXT,
  "providerDeploymentId" TEXT,
  "providerResponse" JSONB,
  "queuedAt" TIMESTAMPTZ(3),
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SiteRebuild_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteRebuild_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SiteRebuild_dedupeKey_key" ON "SiteRebuild"("dedupeKey");
CREATE INDEX "SiteRebuild_status_updatedAt_idx" ON "SiteRebuild"("status", "updatedAt");
CREATE INDEX "SiteRebuild_siteId_updatedAt_idx" ON "SiteRebuild"("siteId", "updatedAt");

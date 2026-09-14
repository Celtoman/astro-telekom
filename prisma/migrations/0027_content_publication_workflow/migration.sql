CREATE TYPE "ContentEntityType" AS ENUM ('PROVIDER', 'SITE', 'REGION', 'CITY', 'PAGE', 'TARIFF', 'REDIRECT');
CREATE TYPE "ContentRevisionAction" AS ENUM ('CREATE', 'UPDATE', 'IMPORT', 'ARCHIVE', 'RESTORE');
CREATE TYPE "SitePublicationStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "Site"
  ADD COLUMN "workingRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "publishedRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SiteRebuild"
  ADD COLUMN "requestedPublicationId" TEXT,
  ADD COLUMN "processingPublicationId" TEXT,
  ADD COLUMN "publishedPublicationId" TEXT;

CREATE TABLE "ContentRevision" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "entityType" "ContentEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "entityRevision" INTEGER NOT NULL,
  "siteRevision" INTEGER NOT NULL,
  "action" "ContentRevisionAction" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changedFields" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SitePublication" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "siteRevision" INTEGER NOT NULL,
  "status" "SitePublicationStatus" NOT NULL DEFAULT 'PENDING',
  "catalog" JSONB NOT NULL,
  "triggerEntity" TEXT NOT NULL,
  "triggerEntityId" TEXT NOT NULL,
  "requestedById" TEXT,
  "lastError" TEXT,
  "providerDeploymentId" TEXT,
  "providerResponse" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "publishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SitePublication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "siteRevision" INTEGER NOT NULL,
  "entityType" "ContentEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" "ContentRevisionAction" NOT NULL,
  "changedFields" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentRevision_entityType_entityId_entityRevision_key" ON "ContentRevision"("entityType", "entityId", "entityRevision");
CREATE UNIQUE INDEX "ContentRevision_siteId_siteRevision_entityType_entityId_key" ON "ContentRevision"("siteId", "siteRevision", "entityType", "entityId");
CREATE INDEX "ContentRevision_siteId_siteRevision_idx" ON "ContentRevision"("siteId", "siteRevision");
CREATE INDEX "ContentRevision_entityType_entityId_createdAt_idx" ON "ContentRevision"("entityType", "entityId", "createdAt");
CREATE INDEX "ContentRevision_actorId_createdAt_idx" ON "ContentRevision"("actorId", "createdAt");
CREATE UNIQUE INDEX "SitePublication_siteId_siteRevision_key" ON "SitePublication"("siteId", "siteRevision");
CREATE INDEX "SitePublication_siteId_status_createdAt_idx" ON "SitePublication"("siteId", "status", "createdAt");
CREATE INDEX "SitePublication_requestedById_createdAt_idx" ON "SitePublication"("requestedById", "createdAt");
CREATE INDEX "AuditEvent_siteId_createdAt_idx" ON "AuditEvent"("siteId", "createdAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX "SiteRebuild_requestedPublicationId_idx" ON "SiteRebuild"("requestedPublicationId");
CREATE INDEX "SiteRebuild_processingPublicationId_idx" ON "SiteRebuild"("processingPublicationId");

ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SitePublication" ADD CONSTRAINT "SitePublication_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SitePublication" ADD CONSTRAINT "SitePublication_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteRebuild" ADD CONSTRAINT "SiteRebuild_requestedPublicationId_fkey" FOREIGN KEY ("requestedPublicationId") REFERENCES "SitePublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteRebuild" ADD CONSTRAINT "SiteRebuild_processingPublicationId_fkey" FOREIGN KEY ("processingPublicationId") REFERENCES "SitePublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteRebuild" ADD CONSTRAINT "SiteRebuild_publishedPublicationId_fkey" FOREIGN KEY ("publishedPublicationId") REFERENCES "SitePublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

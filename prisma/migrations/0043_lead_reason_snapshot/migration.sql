ALTER TYPE "LeadProcessingStatus" ADD VALUE 'NON_SALES_NOT_SENT';

ALTER TABLE "Lead"
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "reasonLabel" TEXT,
  ADD COLUMN "reasonRoute" TEXT,
  ADD COLUMN "reasonRegistryVersion" INTEGER;

CREATE INDEX "Lead_siteId_reasonCode_createdAt_idx" ON "Lead"("siteId", "reasonCode", "createdAt");

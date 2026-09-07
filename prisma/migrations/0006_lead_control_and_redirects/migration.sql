ALTER TYPE "AddressCheckStatus" ADD VALUE IF NOT EXISTS 'AMBIGUOUS';

CREATE TYPE "LeadProcessingStatus" AS ENUM (
  'PENDING',
  'DELIVERED',
  'DUPLICATE_SUPPRESSED',
  'ACTIVE_SUBSCRIBER_NOT_SENT',
  'MANUAL_CHECK',
  'ADDRESS_CLARIFICATION',
  'MANUAL_CHECK_API',
  'DELIVERY_ERROR_EMAIL_SENT'
);

CREATE TYPE "DeliveryChannel" AS ENUM ('API', 'EMAIL');
CREATE TYPE "DeliveryAttemptStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'SKIPPED');

ALTER TABLE "City"
  ADD COLUMN "nameInstrumental" TEXT,
  ADD COLUMN "namePrepositional" TEXT,
  ADD COLUMN "nameGenitive" TEXT,
  ADD COLUMN "legacyUrl" TEXT,
  ADD COLUMN "officeAddress" TEXT,
  ADD COLUMN "officeHours" TEXT;

ALTER TABLE "Lead"
  ADD COLUMN "referrer" TEXT,
  ADD COLUMN "pageUrl" TEXT,
  ADD COLUMN "formName" TEXT,
  ADD COLUMN "timeOnSiteSeconds" INTEGER,
  ADD COLUMN "deviceType" TEXT,
  ADD COLUMN "viewedPages" JSONB,
  ADD COLUMN "processingStatus" "LeadProcessingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "duplicateOfId" TEXT,
  ADD COLUMN "duplicateReason" TEXT,
  ADD COLUMN "deliveryKey" TEXT,
  ADD COLUMN "externalLeadId" TEXT,
  ADD COLUMN "externalStatus" TEXT,
  ADD COLUMN "contractResult" JSONB;

CREATE UNIQUE INDEX "Lead_deliveryKey_key" ON "Lead"("deliveryKey");
CREATE INDEX "Lead_processingStatus_createdAt_idx" ON "Lead"("processingStatus", "createdAt");
CREATE INDEX "Lead_siteId_phone_createdAt_idx" ON "Lead"("siteId", "phone", "createdAt");
CREATE INDEX "Lead_siteId_duplicateOfId_idx" ON "Lead"("siteId", "duplicateOfId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_duplicateOfId_fkey"
  FOREIGN KEY ("duplicateOfId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LeadDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "channel" "DeliveryChannel" NOT NULL,
  "status" "DeliveryAttemptStatus" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestPayload" JSONB,
  "response" JSONB,
  "error" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadDeliveryAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeadDeliveryAttempt_leadId_attemptNumber_channel_key" ON "LeadDeliveryAttempt"("leadId", "attemptNumber", "channel");
CREATE INDEX "LeadDeliveryAttempt_leadId_createdAt_idx" ON "LeadDeliveryAttempt"("leadId", "createdAt");

CREATE TABLE "LeadActivityEvent" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadActivityEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LeadActivityEvent_leadId_createdAt_idx" ON "LeadActivityEvent"("leadId", "createdAt");

CREATE TABLE "Redirect" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "cityId" TEXT,
  "sourcePath" TEXT NOT NULL,
  "targetPath" TEXT NOT NULL,
  "status" "PublishStatus" NOT NULL DEFAULT 'PUBLISHED',
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "lastHitAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Redirect_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Redirect_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Redirect_siteId_sourcePath_key" ON "Redirect"("siteId", "sourcePath");
CREATE INDEX "Redirect_siteId_status_idx" ON "Redirect"("siteId", "status");

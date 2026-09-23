ALTER TYPE "LeadProcessingStatus" ADD VALUE IF NOT EXISTS 'DECISION_PENDING';
ALTER TYPE "LeadProcessingStatus" ADD VALUE IF NOT EXISTS 'DECISION_RUNNING';
ALTER TYPE "LeadProcessingStatus" ADD VALUE IF NOT EXISTS 'PHONE_CHECK_RETRY';
ALTER TYPE "LeadProcessingStatus" ADD VALUE IF NOT EXISTS 'PHONE_CHECK_FAILED';
ALTER TYPE "LeadProcessingStatus" ADD VALUE IF NOT EXISTS 'PHONE_INVALID_NOT_SENT';

CREATE TYPE "LeadPhoneCheckStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRYING', 'PASSED', 'REJECTED', 'FAILED', 'SKIPPED');

ALTER TABLE "Lead"
  ADD COLUMN "phoneCheckStatus" "LeadPhoneCheckStatus",
  ADD COLUMN "phoneCheckQc" INTEGER,
  ADD COLUMN "phoneCheckNormalized" TEXT,
  ADD COLUMN "phoneCheckCheckedAt" TIMESTAMP(3),
  ADD COLUMN "phoneCheckAttempt" INTEGER,
  ADD COLUMN "phoneCheckSource" TEXT,
  ADD COLUMN "phoneCheckErrorCode" TEXT,
  ADD COLUMN "phoneCheckNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "decisionLeaseUntil" TIMESTAMP(3);

CREATE INDEX "Lead_phone_phoneCheckCheckedAt_idx" ON "Lead"("phone", "phoneCheckCheckedAt");
CREATE INDEX "Lead_processingStatus_phoneCheckNextAttemptAt_idx" ON "Lead"("processingStatus", "phoneCheckNextAttemptAt");

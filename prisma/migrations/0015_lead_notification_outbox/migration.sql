CREATE TYPE "LeadNotificationStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "LeadNotification" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "LeadNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "transport" TEXT,
    "errorCode" TEXT,
    "httpStatus" INTEGER,
    "providerMessageId" TEXT,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadNotification_leadId_key" ON "LeadNotification"("leadId");
CREATE INDEX "LeadNotification_status_updatedAt_idx" ON "LeadNotification"("status", "updatedAt");

ALTER TABLE "LeadNotification" ADD CONSTRAINT "LeadNotification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

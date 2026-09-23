ALTER TABLE "Lead" ADD COLUMN "decisionAttemptNumber" INTEGER;

CREATE TABLE "LeadDecisionEvent" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "attemptNumber" INTEGER,
  "actorId" TEXT,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadDecisionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadDecisionEvent_leadId_createdAt_idx" ON "LeadDecisionEvent"("leadId", "createdAt");

ALTER TABLE "LeadDecisionEvent" ADD CONSTRAINT "LeadDecisionEvent_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

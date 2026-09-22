ALTER TABLE "Lead"
ADD COLUMN "submissionKey" TEXT,
ADD COLUMN "consentVersion" TEXT,
ADD COLUMN "consentAcceptedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Lead_submissionKey_key" ON "Lead"("submissionKey");

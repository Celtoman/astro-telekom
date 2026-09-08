CREATE TABLE "LeadAccessToken" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadAccessToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadAccessToken_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LeadAccessToken_tokenHash_key" ON "LeadAccessToken"("tokenHash");
CREATE INDEX "LeadAccessToken_leadId_createdAt_idx" ON "LeadAccessToken"("leadId", "createdAt");
CREATE INDEX "LeadAccessToken_expiresAt_idx" ON "LeadAccessToken"("expiresAt");

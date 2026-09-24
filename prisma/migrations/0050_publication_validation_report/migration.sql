CREATE TYPE "PublicationValidationOutcome" AS ENUM ('BLOCKED', 'PASSED_WITH_WARNINGS', 'PASSED');

CREATE TABLE "SitePublicationValidation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "siteRevision" INTEGER NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "appVersion" TEXT NOT NULL,
    "outcome" "PublicationValidationOutcome" NOT NULL,
    "checkedUrlCount" INTEGER NOT NULL,
    "requestedById" TEXT,
    "validatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SitePublicationValidation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SitePublication" ADD COLUMN "validationId" TEXT;

CREATE UNIQUE INDEX "SitePublication_validationId_key" ON "SitePublication"("validationId");
CREATE INDEX "SitePublicationValidation_siteId_validatedAt_idx" ON "SitePublicationValidation"("siteId", "validatedAt");
CREATE INDEX "SitePublicationValidation_siteId_siteRevision_validatedAt_idx" ON "SitePublicationValidation"("siteId", "siteRevision", "validatedAt");

ALTER TABLE "SitePublication" ADD CONSTRAINT "SitePublication_validationId_fkey"
    FOREIGN KEY ("validationId") REFERENCES "SitePublicationValidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SitePublicationValidation" ADD CONSTRAINT "SitePublicationValidation_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SitePublicationValidation" ADD CONSTRAINT "SitePublicationValidation_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

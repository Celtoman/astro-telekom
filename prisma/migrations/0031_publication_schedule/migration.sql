ALTER TYPE "SitePublicationStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "SitePublicationStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "SitePublication"
  ADD COLUMN "scheduledFor" TIMESTAMPTZ(3),
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);

CREATE INDEX "SitePublication_status_scheduledFor_idx"
  ON "SitePublication"("status", "scheduledFor");

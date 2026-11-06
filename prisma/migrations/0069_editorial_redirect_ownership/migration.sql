BEGIN;
ALTER TABLE "Redirect" ADD COLUMN "managedEditorialKey" TEXT;
CREATE INDEX "Redirect_siteId_managedEditorialKey_idx" ON "Redirect"("siteId", "managedEditorialKey");
COMMIT;

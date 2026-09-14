ALTER TYPE "TariffImportStatus" ADD VALUE IF NOT EXISTS 'UNDONE';
ALTER TYPE "CityImportStatus" ADD VALUE IF NOT EXISTS 'UNDONE';
ALTER TYPE "ContentRevisionAction" ADD VALUE IF NOT EXISTS 'UNDO';

ALTER TABLE "TariffImportRun"
  ADD COLUMN "changeSet" JSONB,
  ADD COLUMN "appliedById" TEXT,
  ADD COLUMN "undoneAt" TIMESTAMP(3),
  ADD COLUMN "undoneById" TEXT,
  ADD COLUMN "undoSiteRevisions" JSONB;

ALTER TABLE "CityImportRun"
  ADD COLUMN "changeSet" JSONB,
  ADD COLUMN "appliedById" TEXT,
  ADD COLUMN "undoneAt" TIMESTAMP(3),
  ADD COLUMN "undoneById" TEXT,
  ADD COLUMN "undoSiteRevisions" JSONB;

ALTER TABLE "TariffImportRun"
  ADD CONSTRAINT "TariffImportRun_appliedById_fkey"
  FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TariffImportRun_undoneById_fkey"
  FOREIGN KEY ("undoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CityImportRun"
  ADD CONSTRAINT "CityImportRun_appliedById_fkey"
  FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CityImportRun_undoneById_fkey"
  FOREIGN KEY ("undoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TariffImportRun_appliedById_appliedAt_idx" ON "TariffImportRun"("appliedById", "appliedAt");
CREATE INDEX "TariffImportRun_undoneById_undoneAt_idx" ON "TariffImportRun"("undoneById", "undoneAt");
CREATE INDEX "CityImportRun_appliedById_appliedAt_idx" ON "CityImportRun"("appliedById", "appliedAt");
CREATE INDEX "CityImportRun_undoneById_undoneAt_idx" ON "CityImportRun"("undoneById", "undoneAt");

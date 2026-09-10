DROP INDEX IF EXISTS "Lead_createdAt_idx";
CREATE INDEX "Lead_createdAt_id_idx" ON "Lead"("createdAt", "id");
CREATE INDEX "Tariff_updatedAt_id_idx" ON "Tariff"("updatedAt", "id");

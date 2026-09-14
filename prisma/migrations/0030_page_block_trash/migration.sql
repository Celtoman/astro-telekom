ALTER TABLE "PageBlock"
ADD COLUMN "archivedAt" TIMESTAMPTZ(3);

CREATE INDEX "PageBlock_archivedAt_idx" ON "PageBlock"("archivedAt");

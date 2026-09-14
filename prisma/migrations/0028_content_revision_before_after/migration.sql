ALTER TABLE "ContentRevision"
  ADD COLUMN "previousSnapshot" JSONB;

ALTER TABLE "AuditEvent"
  ADD COLUMN "changes" JSONB NOT NULL DEFAULT '{}'::JSONB;

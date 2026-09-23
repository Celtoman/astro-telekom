ALTER TABLE "Lead"
  ADD COLUMN "comment" TEXT,
  ADD COLUMN "commentAnalysisVersion" INTEGER,
  ADD COLUMN "commentAnalysisOutcome" TEXT,
  ADD COLUMN "commentAnalysisCategory" TEXT,
  ADD COLUMN "commentAnalysisEvidence" JSONB,
  ADD COLUMN "commentAnalysisExplanation" TEXT;

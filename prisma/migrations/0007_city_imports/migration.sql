CREATE TYPE "CityImportStatus" AS ENUM ('VALIDATED', 'APPLIED', 'FAILED');

CREATE TABLE "CityImportRun" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" "CityImportStatus" NOT NULL DEFAULT 'VALIDATED',
  "totalRows" INTEGER NOT NULL,
  "validRows" INTEGER NOT NULL,
  "errorRows" INTEGER NOT NULL,
  "warningRows" INTEGER NOT NULL,
  "report" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "CityImportRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CityImportRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CityImportRun_siteId_createdAt_idx" ON "CityImportRun"("siteId", "createdAt");

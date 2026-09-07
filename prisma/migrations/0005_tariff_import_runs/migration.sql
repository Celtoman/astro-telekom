CREATE TYPE "TariffImportStatus" AS ENUM ('VALIDATED', 'APPLIED', 'FAILED');

CREATE TABLE "TariffImportRun" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "TariffImportStatus" NOT NULL DEFAULT 'VALIDATED',
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "errorRows" INTEGER NOT NULL,
    "warningRows" INTEGER NOT NULL,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "TariffImportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TariffImportRun_providerId_createdAt_idx" ON "TariffImportRun"("providerId", "createdAt");

ALTER TABLE "TariffImportRun" ADD CONSTRAINT "TariffImportRun_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

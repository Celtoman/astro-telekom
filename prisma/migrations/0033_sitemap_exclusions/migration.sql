CREATE TABLE "SitemapExclusion" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "SitemapExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SitemapExclusion_siteId_path_key"
  ON "SitemapExclusion"("siteId", "path");

CREATE INDEX "SitemapExclusion_createdById_createdAt_idx"
  ON "SitemapExclusion"("createdById", "createdAt");

ALTER TABLE "SitemapExclusion"
  ADD CONSTRAINT "SitemapExclusion_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SitemapExclusion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

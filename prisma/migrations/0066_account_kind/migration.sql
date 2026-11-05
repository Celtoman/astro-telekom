-- Keep enum additions separate from their first use (PostgreSQL enum transaction rule).
ALTER TYPE "PageType" ADD VALUE IF NOT EXISTS 'ACCOUNT';
ALTER TYPE "SeoTemplateKind" ADD VALUE IF NOT EXISTS 'ACCOUNT';

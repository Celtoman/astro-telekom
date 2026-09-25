BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

ALTER TYPE "ContentRevisionAction" ADD VALUE 'PURGE';

ALTER TABLE "Lead" DROP CONSTRAINT "Lead_tariffId_fkey";
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tariffId_fkey"
  FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

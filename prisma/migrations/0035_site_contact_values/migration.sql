ALTER TABLE "Site"
  ADD COLUMN "connectionPhone" TEXT,
  ADD COLUMN "supportPhone" TEXT;

DO $$
DECLARE
  target_site RECORD;
  connection_count INTEGER;
  connection_value TEXT;
  support_count INTEGER;
  support_value TEXT;
BEGIN
  FOR target_site IN SELECT "id" FROM "Site" LOOP
    SELECT COUNT(DISTINCT normalized), MIN(normalized)
      INTO connection_count, connection_value
    FROM (
      SELECT CASE
        WHEN LENGTH(digits) = 10 THEN '7' || digits
        WHEN LENGTH(digits) = 11 AND LEFT(digits, 1) = '8' THEN '7' || SUBSTRING(digits FROM 2)
        ELSE digits
      END AS normalized
      FROM (
        SELECT NULLIF(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), '') AS digits
        FROM "City"
        WHERE "siteId" = target_site."id"
      ) raw_values
      WHERE digits IS NOT NULL
    ) normalized_values;

    IF connection_count > 1 THEN
      RAISE EXCEPTION 'Conflicting city connection phones for site %', target_site."id";
    END IF;
    IF connection_value IS NOT NULL AND connection_value !~ '^7[0-9]{10}$' THEN
      RAISE EXCEPTION 'Invalid city connection phone for site %: %', target_site."id", connection_value;
    END IF;

    SELECT COUNT(DISTINCT normalized), MIN(normalized)
      INTO support_count, support_value
    FROM (
      SELECT CASE
        WHEN LENGTH(digits) = 10 THEN '7' || digits
        WHEN LENGTH(digits) = 11 AND LEFT(digits, 1) = '8' THEN '7' || SUBSTRING(digits FROM 2)
        ELSE digits
      END AS normalized
      FROM (
        SELECT NULLIF(REGEXP_REPLACE("supportPhone", '[^0-9]', '', 'g'), '') AS digits
        FROM "City"
        WHERE "siteId" = target_site."id"
      ) raw_values
      WHERE digits IS NOT NULL
    ) normalized_values;

    IF support_count > 1 THEN
      RAISE EXCEPTION 'Conflicting city support phones for site %', target_site."id";
    END IF;
    IF support_value IS NOT NULL AND support_value !~ '^7[0-9]{10}$' THEN
      RAISE EXCEPTION 'Invalid city support phone for site %: %', target_site."id", support_value;
    END IF;

    UPDATE "Site"
    SET "connectionPhone" = connection_value,
        "supportPhone" = support_value
    WHERE "id" = target_site."id";
  END LOOP;
END $$;

ALTER TABLE "Site"
  ADD CONSTRAINT "Site_connectionPhone_format" CHECK ("connectionPhone" IS NULL OR "connectionPhone" ~ '^7[0-9]{10}$'),
  ADD CONSTRAINT "Site_supportPhone_format" CHECK ("supportPhone" IS NULL OR "supportPhone" ~ '^7[0-9]{10}$');

ALTER TABLE "City"
  DROP COLUMN "phone",
  DROP COLUMN "supportPhone";

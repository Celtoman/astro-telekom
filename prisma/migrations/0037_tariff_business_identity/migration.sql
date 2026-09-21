DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Tariff"
    GROUP BY
      "cityId",
      lower(regexp_replace(btrim(replace("name", chr(160), ' ')), '[[:space:]]+', ' ', 'g')),
      "serviceType"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tariff business key conflict: city + normalized name + service type must be unique';
  END IF;
END $$;

UPDATE "Tariff"
SET "identityKey" = concat(
  "cityId",
  ':',
  lower(regexp_replace(btrim(replace("name", chr(160), ' ')), '[[:space:]]+', ' ', 'g')),
  ':',
  "serviceType"::text
);

ALTER TABLE "Tariff"
  ALTER COLUMN "identityKey" SET NOT NULL;

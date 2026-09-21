DO $$
DECLARE
  legacy_site_id TEXT;
  target_site_id TEXT;
BEGIN
  SELECT "id" INTO legacy_site_id
  FROM "Site"
  WHERE "slug" = 'domru-kazan';

  SELECT "id" INTO target_site_id
  FROM "Site"
  WHERE "slug" = 'domru-site';

  IF legacy_site_id IS NOT NULL
    AND target_site_id IS NOT NULL
    AND legacy_site_id <> target_site_id THEN
    RAISE EXCEPTION 'Cannot rename domru-kazan: domru-site already belongs to another Site';
  END IF;

  IF legacy_site_id IS NOT NULL THEN
    UPDATE "Site"
    SET "name" = 'Дом.ру',
        "slug" = 'domru-site',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = legacy_site_id;
  ELSIF target_site_id IS NOT NULL THEN
    UPDATE "Site"
    SET "name" = 'Дом.ру',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = target_site_id;
  END IF;
END $$;

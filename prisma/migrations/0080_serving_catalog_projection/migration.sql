BEGIN;

ALTER TABLE "SitePublication" ADD COLUMN "catalogGeneration" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "SitePublicationProjection" (
  "publicationId" TEXT PRIMARY KEY REFERENCES "SitePublication"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "catalogGeneration" INTEGER NOT NULL CHECK ("catalogGeneration" > 0),
  "formatVersion" INTEGER NOT NULL CHECK ("formatVersion" > 0),
  "catalogDigest" TEXT NOT NULL CHECK ("catalogDigest" ~ '^[a-f0-9]{64}$'),
  "site" JSONB NOT NULL CHECK (jsonb_typeof("site") = 'object'),
  "globalPages" JSONB NOT NULL CHECK (jsonb_typeof("globalPages") = 'array'),
  "addressCities" JSONB NOT NULL CHECK (jsonb_typeof("addressCities") = 'array'),
  "redirects" JSONB NOT NULL CHECK (jsonb_typeof("redirects") = 'array'),
  "cityCount" INTEGER NOT NULL CHECK ("cityCount" >= 0 AND jsonb_array_length("addressCities") = "cityCount")
);

CREATE TABLE "SitePublicationCityProjection" (
  "publicationId" TEXT NOT NULL REFERENCES "SitePublicationProjection"("publicationId") ON DELETE CASCADE ON UPDATE CASCADE,
  "citySlug" TEXT NOT NULL,
  "catalog" JSONB NOT NULL CHECK (
    jsonb_typeof("catalog") = 'object' AND "catalog" -> 'slug' IS NOT NULL AND "catalog" -> 'slug' = to_jsonb("citySlug")
  ),
  PRIMARY KEY ("publicationId", "citySlug")
);

-- A published row can be reused after a failed attempt. Invalidate its derived
-- view in the same transaction as every catalog replacement, including SQL writers.
CREATE FUNCTION invalidate_serving_catalog_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."catalogGeneration" := OLD."catalogGeneration" + 1;
  DELETE FROM "SitePublicationProjection" WHERE "publicationId" = OLD.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invalidate_serving_catalog_projection
BEFORE UPDATE OF catalog ON "SitePublication"
FOR EACH ROW EXECUTE FUNCTION invalidate_serving_catalog_projection();

CREATE FUNCTION protect_serving_catalog_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The publication catalog generation is managed by PostgreSQL';
END;
$$;

CREATE TRIGGER protect_serving_catalog_generation
BEFORE UPDATE OF "catalogGeneration" ON "SitePublication"
FOR EACH ROW EXECUTE FUNCTION protect_serving_catalog_generation();

CREATE FUNCTION protect_serving_catalog_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Rebuild a serving catalog projection from the exact catalog instead of updating it';
END;
$$;

CREATE TRIGGER protect_serving_catalog_projection
BEFORE UPDATE ON "SitePublicationProjection"
FOR EACH ROW EXECUTE FUNCTION protect_serving_catalog_projection();

CREATE TRIGGER protect_serving_catalog_city_projection
BEFORE UPDATE ON "SitePublicationCityProjection"
FOR EACH ROW EXECUTE FUNCTION protect_serving_catalog_projection();

COMMIT;

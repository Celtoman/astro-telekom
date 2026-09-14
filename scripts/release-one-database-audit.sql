\set ON_ERROR_STOP on
\pset pager off

BEGIN TRANSACTION READ ONLY;

SELECT
  'applied_migrations' AS check_name,
  "migration_name",
  "finished_at",
  "rolled_back_at"
FROM "_prisma_migrations"
ORDER BY "started_at";

SELECT 'sites_total' AS check_name, COUNT(*) AS row_count FROM "Site";

SELECT 'sites_by_status' AS check_name, "status"::text AS key, COUNT(*) AS row_count
FROM "Site"
GROUP BY "status"
ORDER BY key;

SELECT 'cities_total' AS check_name, COUNT(*) AS row_count FROM "City";

SELECT 'cities_by_status' AS check_name, "status"::text AS key, COUNT(*) AS row_count
FROM "City"
GROUP BY "status"
ORDER BY key;

SELECT 'pages_total' AS check_name, COUNT(*) AS row_count FROM "Page";

SELECT 'pages_by_type_status' AS check_name, "type"::text || ':' || "status"::text AS key, COUNT(*) AS row_count
FROM "Page"
GROUP BY "type", "status"
ORDER BY key;

SELECT 'page_blocks_total' AS check_name, COUNT(*) AS row_count FROM "PageBlock";

SELECT 'tariffs_total' AS check_name, COUNT(*) AS row_count FROM "Tariff";

SELECT 'tariffs_by_status' AS check_name, "status"::text AS key, COUNT(*) AS row_count
FROM "Tariff"
GROUP BY "status"
ORDER BY key;

SELECT 'address_checks_total' AS check_name, COUNT(*) AS row_count FROM "AddressCheck";

SELECT 'leads_total' AS check_name, COUNT(*) AS row_count FROM "Lead";

SELECT 'leads_by_status' AS check_name, "status"::text AS key, COUNT(*) AS row_count
FROM "Lead"
GROUP BY "status"
ORDER BY key;

SELECT 'redirects_total' AS check_name, COUNT(*) AS row_count FROM "Redirect";

SELECT 'redirects_by_status' AS check_name, "status"::text AS key, COUNT(*) AS row_count
FROM "Redirect"
GROUP BY "status"
ORDER BY key;

WITH required_pages(page_type, expected_slug) AS (
  VALUES
    ('COVERAGE', 'karta-pokrytiya-provaydera'),
    ('CITIES', 'goroda-obsluzhivaniya'),
    ('PRIVACY', 'politika-konfidencialnosti'),
    ('PERSONAL_DATA_CONSENT', 'soglasie-na-obrabotku-personalnyh-dannyh'),
    ('COOKIE_POLICY', 'politika-obrabotki-faylov-kuki')
)
SELECT
  'global_page_inventory' AS check_name,
  site."slug" AS site_slug,
  required_pages.page_type,
  required_pages.expected_slug,
  page."id" AS page_id,
  page."slug" AS actual_slug,
  page."status"::text AS page_status,
  CASE
    WHEN page."id" IS NULL THEN 'MISSING'
    WHEN page."slug" <> required_pages.expected_slug THEN 'WRONG_SLUG'
    WHEN page."status"::text <> 'PUBLISHED' THEN 'NOT_PUBLISHED'
    ELSE 'READY'
  END AS readiness
FROM "Site" AS site
CROSS JOIN required_pages
LEFT JOIN "Page" AS page
  ON page."siteId" = site."id"
  AND page."cityId" IS NULL
  AND page."type"::text = required_pages.page_type
ORDER BY site_slug, page_type;

WITH required_pages(expected_slug) AS (
  VALUES
    ('karta-pokrytiya-provaydera'),
    ('goroda-obsluzhivaniya'),
    ('politika-konfidencialnosti'),
    ('soglasie-na-obrabotku-personalnyh-dannyh'),
    ('politika-obrabotki-faylov-kuki')
), collisions AS (
  SELECT city."id", site."slug" AS site_slug, city."slug" AS city_slug, city."status"::text AS city_status
  FROM "City" AS city
  JOIN "Site" AS site ON site."id" = city."siteId"
  JOIN required_pages ON required_pages.expected_slug = city."slug"
)
SELECT
  'city_global_slug_collisions' AS check_name,
  COUNT(*) AS violation_count,
  COALESCE(jsonb_agg(to_jsonb(collisions) ORDER BY site_slug, city_slug), '[]'::jsonb) AS details
FROM collisions;

WITH required_pages(page_type, expected_slug) AS (
  VALUES
    ('COVERAGE', 'karta-pokrytiya-provaydera'),
    ('CITIES', 'goroda-obsluzhivaniya'),
    ('PRIVACY', 'politika-konfidencialnosti'),
    ('PERSONAL_DATA_CONSENT', 'soglasie-na-obrabotku-personalnyh-dannyh'),
    ('COOKIE_POLICY', 'politika-obrabotki-faylov-kuki')
), release_paths AS (
  SELECT site."id" AS site_id, '/'::text AS path
  FROM "Site" AS site
  WHERE site."status"::text = 'PUBLISHED'
  UNION ALL
  SELECT city."siteId", '/' || city."slug"
  FROM "City" AS city
  JOIN "Site" AS site ON site."id" = city."siteId" AND site."status"::text = 'PUBLISHED'
  WHERE city."status"::text = 'PUBLISHED'
  UNION ALL
  SELECT page."siteId", '/' || page."slug"
  FROM "Page" AS page
  JOIN "Site" AS site ON site."id" = page."siteId" AND site."status"::text = 'PUBLISHED'
  JOIN required_pages
    ON required_pages.page_type = page."type"::text
    AND required_pages.expected_slug = page."slug"
  WHERE page."cityId" IS NULL AND page."status"::text = 'PUBLISHED'
), normalized_redirects AS (
  SELECT
    redirect."id",
    redirect."siteId" AS site_id,
    redirect."status"::text AS redirect_status,
    CASE WHEN redirect."sourcePath" = '/' THEN '/' ELSE regexp_replace(redirect."sourcePath", '/+$', '') END AS source_path,
    CASE WHEN redirect."targetPath" = '/' THEN '/' ELSE regexp_replace(redirect."targetPath", '/+$', '') END AS target_path
  FROM "Redirect" AS redirect
), source_collisions AS (
  SELECT redirect.*
  FROM normalized_redirects AS redirect
  JOIN release_paths ON release_paths.site_id = redirect.site_id AND release_paths.path = redirect.source_path
)
SELECT
  'redirect_source_route_collisions' AS check_name,
  COUNT(*) AS violation_count,
  COALESCE(jsonb_agg(to_jsonb(source_collisions) ORDER BY source_path), '[]'::jsonb) AS details
FROM source_collisions;

WITH required_pages(page_type, expected_slug) AS (
  VALUES
    ('COVERAGE', 'karta-pokrytiya-provaydera'),
    ('CITIES', 'goroda-obsluzhivaniya'),
    ('PRIVACY', 'politika-konfidencialnosti'),
    ('PERSONAL_DATA_CONSENT', 'soglasie-na-obrabotku-personalnyh-dannyh'),
    ('COOKIE_POLICY', 'politika-obrabotki-faylov-kuki')
), release_paths AS (
  SELECT site."id" AS site_id, '/'::text AS path
  FROM "Site" AS site
  WHERE site."status"::text = 'PUBLISHED'
  UNION ALL
  SELECT city."siteId", '/' || city."slug"
  FROM "City" AS city
  JOIN "Site" AS site ON site."id" = city."siteId" AND site."status"::text = 'PUBLISHED'
  WHERE city."status"::text = 'PUBLISHED'
  UNION ALL
  SELECT page."siteId", '/' || page."slug"
  FROM "Page" AS page
  JOIN "Site" AS site ON site."id" = page."siteId" AND site."status"::text = 'PUBLISHED'
  JOIN required_pages
    ON required_pages.page_type = page."type"::text
    AND required_pages.expected_slug = page."slug"
  WHERE page."cityId" IS NULL AND page."status"::text = 'PUBLISHED'
), normalized_redirects AS (
  SELECT
    redirect."id",
    redirect."siteId" AS site_id,
    redirect."status"::text AS redirect_status,
    CASE WHEN redirect."sourcePath" = '/' THEN '/' ELSE regexp_replace(redirect."sourcePath", '/+$', '') END AS source_path,
    CASE WHEN redirect."targetPath" = '/' THEN '/' ELSE regexp_replace(redirect."targetPath", '/+$', '') END AS target_path
  FROM "Redirect" AS redirect
), outside_targets AS (
  SELECT redirect.*
  FROM normalized_redirects AS redirect
  WHERE redirect.redirect_status = 'PUBLISHED'
    AND NOT EXISTS (
      SELECT 1
      FROM release_paths
      WHERE release_paths.site_id = redirect.site_id AND release_paths.path = redirect.target_path
    )
)
SELECT
  'redirect_targets_outside_release_one' AS check_name,
  COUNT(*) AS violation_count,
  COALESCE(jsonb_agg(to_jsonb(outside_targets) ORDER BY source_path), '[]'::jsonb) AS details
FROM outside_targets;

WITH violations AS (
  SELECT 'page_city_missing' AS violation, page."id" AS entity_id
  FROM "Page" AS page
  LEFT JOIN "City" AS city ON city."id" = page."cityId"
  WHERE page."cityId" IS NOT NULL AND city."id" IS NULL
  UNION ALL
  SELECT 'page_site_city_mismatch', page."id"
  FROM "Page" AS page
  JOIN "City" AS city ON city."id" = page."cityId"
  WHERE page."siteId" <> city."siteId"
  UNION ALL
  SELECT 'global_type_with_city', page."id"
  FROM "Page" AS page
  WHERE page."type"::text IN ('COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY') AND page."cityId" IS NOT NULL
  UNION ALL
  SELECT 'city_type_without_city', page."id"
  FROM "Page" AS page
  WHERE page."type"::text NOT IN ('COVERAGE', 'CITIES', 'PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY') AND page."cityId" IS NULL
  UNION ALL
  SELECT 'page_block_page_missing', page_block."id"
  FROM "PageBlock" AS page_block
  LEFT JOIN "Page" AS page ON page."id" = page_block."pageId"
  WHERE page."id" IS NULL
  UNION ALL
  SELECT 'tariff_city_missing', tariff."id"
  FROM "Tariff" AS tariff
  LEFT JOIN "City" AS city ON city."id" = tariff."cityId"
  WHERE city."id" IS NULL
  UNION ALL
  SELECT 'tariff_provider_site_mismatch', tariff."id"
  FROM "Tariff" AS tariff
  JOIN "City" AS city ON city."id" = tariff."cityId"
  JOIN "Site" AS site ON site."id" = city."siteId"
  WHERE tariff."providerId" <> site."providerId"
  UNION ALL
  SELECT 'lead_city_missing', lead."id"
  FROM "Lead" AS lead
  LEFT JOIN "City" AS city ON city."id" = lead."cityId"
  WHERE city."id" IS NULL
  UNION ALL
  SELECT 'lead_site_city_mismatch', lead."id"
  FROM "Lead" AS lead
  JOIN "City" AS city ON city."id" = lead."cityId"
  WHERE lead."siteId" <> city."siteId"
  UNION ALL
  SELECT 'lead_page_city_mismatch', lead."id"
  FROM "Lead" AS lead
  LEFT JOIN "Page" AS page ON page."id" = lead."pageId"
  WHERE lead."pageId" IS NOT NULL AND (page."id" IS NULL OR page."cityId" IS DISTINCT FROM lead."cityId")
  UNION ALL
  SELECT 'lead_tariff_city_mismatch', lead."id"
  FROM "Lead" AS lead
  LEFT JOIN "Tariff" AS tariff ON tariff."id" = lead."tariffId"
  WHERE lead."tariffId" IS NOT NULL AND (tariff."id" IS NULL OR tariff."cityId" <> lead."cityId")
  UNION ALL
  SELECT 'address_check_city_missing', address_check."id"
  FROM "AddressCheck" AS address_check
  LEFT JOIN "City" AS city ON city."id" = address_check."cityId"
  WHERE city."id" IS NULL
  UNION ALL
  SELECT 'address_check_site_city_mismatch', address_check."id"
  FROM "AddressCheck" AS address_check
  JOIN "City" AS city ON city."id" = address_check."cityId"
  WHERE address_check."siteId" <> city."siteId"
  UNION ALL
  SELECT 'address_check_page_city_mismatch', address_check."id"
  FROM "AddressCheck" AS address_check
  LEFT JOIN "Page" AS page ON page."id" = address_check."pageId"
  WHERE address_check."pageId" IS NOT NULL
    AND (page."id" IS NULL OR page."cityId" IS DISTINCT FROM address_check."cityId")
  UNION ALL
  SELECT 'redirect_city_site_mismatch', redirect."id"
  FROM "Redirect" AS redirect
  LEFT JOIN "City" AS city ON city."id" = redirect."cityId"
  WHERE redirect."cityId" IS NOT NULL AND (city."id" IS NULL OR city."siteId" <> redirect."siteId")
  UNION ALL
  SELECT 'managed_redirect_tariff_missing', redirect."id"
  FROM "Redirect" AS redirect
  LEFT JOIN "Tariff" AS tariff ON tariff."id" = redirect."managedTariffId"
  WHERE redirect."managedTariffId" IS NOT NULL AND tariff."id" IS NULL
), violation_counts AS (
  SELECT violation, COUNT(*) AS row_count
  FROM violations
  GROUP BY violation
)
SELECT
  'relation_integrity_violations' AS check_name,
  COALESCE(SUM(row_count), 0) AS violation_count,
  COALESCE(jsonb_object_agg(violation, row_count ORDER BY violation), '{}'::jsonb) AS details
FROM violation_counts;

ROLLBACK;

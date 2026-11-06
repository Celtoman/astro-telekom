ALTER TABLE "Redirect" ADD COLUMN "managedEditorialReleaseSequence" INTEGER;

-- Only immutable succeeded snapshots establish historical ownership. Failed
-- reservations and manual redirects remain unapproved; snapshots never change.
WITH approved AS (
  SELECT DISTINCT ON (r.id) r.id, p."releaseSequence", alias.value->>'targetPath' AS target_path
  FROM "Redirect" r
  JOIN "SitePublication" p ON p."siteId"=r."siteId" AND p.status='SUCCEEDED'
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.catalog->'redirects')='array' THEN p.catalog->'redirects' ELSE '[]'::jsonb END) alias(value)
  WHERE r."managedEditorialKey" IS NOT NULL
    AND (p.catalog#>'{editorial,redirectIds}') ? r.id
    AND alias.value->>'id'=r.id
    AND jsonb_typeof(alias.value->'targetPath')='string'
    AND alias.value->>'targetPath' LIKE '/%'
  ORDER BY r.id,p."releaseSequence" DESC
)
UPDATE "Redirect" r SET "managedEditorialReleaseSequence"=a."releaseSequence", "targetPath"=a.target_path
FROM approved a WHERE r.id=a.id;

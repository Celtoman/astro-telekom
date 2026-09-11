UPDATE "PageBlock"
SET "data" = jsonb_set(
  "data",
  '{ctaHref}',
  to_jsonb(regexp_replace("data"->>'ctaHref', '/+$', '')),
  false
)
WHERE "blockType" = 'hero'
  AND jsonb_typeof("data") = 'object'
  AND jsonb_typeof("data"->'ctaHref') = 'string'
  AND "data"->>'ctaHref' ~ '^/[^/].*/+$';

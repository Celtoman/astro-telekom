import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(repositoryRoot, path), 'utf8');

const activeIdentityFiles = [
  '.env.example',
  'docker-compose.prod.yml',
  'docker-compose.coolify.yml',
  'scripts/import-cities.mjs',
  'apps/api/src/seed.ts',
  'apps/api/src/public-leads.controller.ts',
  'apps/api/src/address-suggestions.controller.ts',
  'apps/api/src/address-checks.controller.ts',
  'apps/web/src/data/site.ts',
];

test('active runtime identity uses the single Dom.ru site slug', () => {
  for (const path of activeIdentityFiles) {
    const source = read(path);
    assert.match(source, /domru-site/, `${path} должен использовать domru-site`);
    assert.doesNotMatch(source, /domru-kazan/, `${path} не должен содержать активный legacy slug`);
  }

  const seed = read('apps/api/src/seed.ts');
  assert.match(seed, /name: 'Дом\.ру'/);
  assert.doesNotMatch(seed, /Дом\.ру\s*[—-]\s*Казань/);
});
test('site identity migration renames the existing site and rejects a conflicting target slug', () => {
  const migration = read('prisma/migrations/0034_domru_site_identity/migration.sql');

  assert.match(migration, /"slug" = 'domru-kazan'/);
  assert.match(migration, /"slug" = 'domru-site'/);
  assert.match(migration, /"name" = 'Дом\.ру'/);
  assert.match(migration, /RAISE EXCEPTION/);
  assert.doesNotMatch(migration, /INSERT INTO "Site"/);
});

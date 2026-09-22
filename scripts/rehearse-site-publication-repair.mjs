import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const migrationRoot = join(repositoryRoot, 'prisma', 'migrations');
const repairMigration = join(migrationRoot, '0039_repair_site_publication_revision', 'migration.sql');
const containerName = `astro-publication-repair-${randomUUID().slice(0, 8)}`;
const image = 'postgres:18.6-alpine';

function runDocker(args, options = {}) {
  return spawnSync('docker', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: options.input === undefined ? 'pipe' : ['pipe', 'pipe', 'pipe'],
    input: options.input,
    timeout: options.timeoutMs ?? 120_000,
  });
}

function docker(args, options = {}) {
  const result = runDocker(args, options);
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`docker ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }
  return result.stdout.trim();
}

function psql(sql) {
  return docker([
    'exec', '-i', containerName,
    'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'provider',
  ], { input: sql });
}

function expectMigrationFailure(sql, expectedMessage) {
  const result = runDocker([
    'exec', '-i', containerName,
    'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'provider',
  ], { input: sql });
  const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  assert.notEqual(result.status, 0, 'migration must fail while publication or rebuild is active');
  assert.match(details, expectedMessage);
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    // The official image briefly starts a socket-only postmaster during init.
    // TCP readiness becomes true only for the final server and avoids racing
    // its shutdown before the first migration is applied.
    const result = runDocker([
      'exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'provider',
    ], { timeoutMs: 5_000 });
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 18 container did not become ready');
}

function applyMigrationsThrough0038() {
  const directories = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}_/.test(entry.name) && entry.name < '0039_')
    .map((entry) => entry.name)
    .sort();
  for (const directory of directories) {
    psql(readFileSync(join(migrationRoot, directory, 'migration.sql'), 'utf8'));
  }
}

function assertState() {
  const rows = JSON.parse(psql(String.raw`
    SELECT jsonb_agg(result ORDER BY result->>'id')
    FROM (
      SELECT jsonb_build_object(
        'id', site."id",
        'workingRevision', site."workingRevision",
        'publishedRevision', site."publishedRevision",
        'repairRevisions', (
          SELECT COUNT(*)::int FROM "ContentRevision" revision
          WHERE revision."siteId" = site."id"
            AND revision."source" = 'migration:0039_repair_site_publication_revision'
        ),
        'repairAudits', (
          SELECT COUNT(*)::int FROM "AuditEvent" audit
          WHERE audit."siteId" = site."id"
            AND audit."source" = 'migration:0039_repair_site_publication_revision'
        ),
        'publications', (
          SELECT COUNT(*)::int FROM "SitePublication" publication
          WHERE publication."siteId" = site."id"
        ),
        'repairRevision', (
          SELECT jsonb_build_object(
            'entityType', revision."entityType",
            'entityId', revision."entityId",
            'entityRevision', revision."entityRevision",
            'siteRevision', revision."siteRevision",
            'action', revision."action",
            'previousSnapshot', revision."previousSnapshot",
            'snapshot', revision."snapshot",
            'changedFields', revision."changedFields",
            'source', revision."source",
            'actorId', revision."actorId"
          )
          FROM "ContentRevision" revision
          WHERE revision."siteId" = site."id"
            AND revision."source" = 'migration:0039_repair_site_publication_revision'
        ),
        'repairAudit', (
          SELECT jsonb_build_object(
            'entityType', audit."entityType",
            'entityId', audit."entityId",
            'siteRevision', audit."siteRevision",
            'action', audit."action",
            'changedFields', audit."changedFields",
            'changes', audit."changes",
            'source', audit."source",
            'actorId', audit."actorId"
          )
          FROM "AuditEvent" audit
          WHERE audit."siteId" = site."id"
            AND audit."source" = 'migration:0039_repair_site_publication_revision'
        )
      ) AS result
      FROM "Site" site
    ) state;
  `).split('\n').filter(Boolean).at(-1));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const broken = byId.get('legacy-broken');
  const published = byId.get('published-repaired');
  const prepared = byId.get('prepared-repair');
  const clean = byId.get('clean-site');

  assertSiteState(broken, {
    id: 'legacy-broken', workingRevision: 4, publishedRevision: 3,
    repairRevisions: 1, repairAudits: 1, publications: 1,
  });
  assert.deepEqual(broken.repairRevision, {
    entityType: 'SITE', entityId: 'legacy-broken', entityRevision: 1, siteRevision: 4,
    action: 'UPDATE',
    previousSnapshot: {
      name: 'Дом.ру Казань', slug: 'legacy-old', connectionPhone: null,
      supportPhone: null, publicationId: 'legacy-publication',
    },
    snapshot: {
      name: 'Дом.ру', slug: 'legacy-broken', connectionPhone: '78005557244',
      supportPhone: '78002507777', publicationId: 'legacy-publication',
    },
    changedFields: ['name', 'slug', 'connectionPhone', 'supportPhone'],
    source: 'migration:0039_repair_site_publication_revision', actorId: null,
  });
  assert.deepEqual(broken.repairAudit, {
    entityType: 'SITE', entityId: 'legacy-broken', siteRevision: 4, action: 'UPDATE',
    changedFields: ['name', 'slug', 'connectionPhone', 'supportPhone'],
    changes: {
      name: { before: 'Дом.ру Казань', after: 'Дом.ру' },
      slug: { before: 'legacy-old', after: 'legacy-broken' },
      connectionPhone: { before: null, after: '78005557244' },
      supportPhone: { before: null, after: '78002507777' },
    },
    source: 'migration:0039_repair_site_publication_revision', actorId: null,
  });
  assertSiteState(published, {
    id: 'published-repaired', workingRevision: 4, publishedRevision: 4,
    repairRevisions: 0, repairAudits: 0, publications: 1,
  });
  assertSiteState(prepared, {
    id: 'prepared-repair', workingRevision: 4, publishedRevision: 3,
    repairRevisions: 0, repairAudits: 0, publications: 1,
  });
  assertSiteState(clean, {
    id: 'clean-site', workingRevision: 0, publishedRevision: 0,
    repairRevisions: 0, repairAudits: 0, publications: 0,
  });
}

function publicationRows() {
  return psql(String.raw`
    SELECT COALESCE(jsonb_agg(to_jsonb(publication) ORDER BY publication."id"), '[]'::jsonb)
    FROM "SitePublication" publication;
  `).split('\n').filter(Boolean).at(-1);
}

function assertSiteState(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) {
      throw new Error(`${expected.id} mismatch for ${key}: expected ${value}, received ${actual?.[key]}`);
    }
  }
}

let containerStarted = false;
let rehearsalFailure;

try {
  docker([
    'run', '--rm', '-d', '--name', containerName,
    '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=provider', image,
  ]);
  containerStarted = true;
  waitForPostgres();
  applyMigrationsThrough0038();

  psql(String.raw`
    INSERT INTO "Provider" ("id", "name", "slug", "updatedAt") VALUES
      ('provider-1', 'Дом.ру', 'domru', CURRENT_TIMESTAMP);

    INSERT INTO "Site" (
      "id", "providerId", "name", "slug", "connectionPhone", "supportPhone",
      "status", "workingRevision", "publishedRevision", "updatedAt"
    ) VALUES
      ('legacy-broken', 'provider-1', 'Дом.ру', 'legacy-broken', '78005557244', '78002507777', 'PUBLISHED', 3, 3, CURRENT_TIMESTAMP),
      ('published-repaired', 'provider-1', 'Дом.ру', 'published-repaired', '78005557244', '78002507777', 'PUBLISHED', 4, 4, CURRENT_TIMESTAMP),
      ('prepared-repair', 'provider-1', 'Дом.ру', 'prepared-repair', '78005557244', '78002507777', 'PUBLISHED', 4, 3, CURRENT_TIMESTAMP),
      ('clean-site', 'provider-1', 'Дом.ру', 'clean-site', '78005557244', '78002507777', 'PUBLISHED', 0, 0, CURRENT_TIMESTAMP);

    INSERT INTO "SitePublication" (
      "id", "siteId", "siteRevision", "status", "catalog", "triggerEntity",
      "triggerEntityId", "updatedAt", "publishedAt"
    ) VALUES
      ('legacy-publication', 'legacy-broken', 3, 'SUCCEEDED',
        '{"site":{"name":"Дом.ру Казань","slug":"legacy-old"}}'::jsonb,
        'site', 'legacy-broken', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('published-repaired-publication', 'published-repaired', 4, 'SUCCEEDED',
        '{"site":{"name":"Дом.ру","slug":"published-repaired","connectionPhone":"78005557244","supportPhone":"78002507777"}}'::jsonb,
        'site', 'published-repaired', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('prepared-publication', 'prepared-repair', 3, 'SUCCEEDED',
        '{"site":{"name":"Дом.ру Казань","slug":"prepared-old"}}'::jsonb,
        'site', 'prepared-repair', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    INSERT INTO "ContentRevision" (
      "id", "siteId", "entityType", "entityId", "entityRevision", "siteRevision",
      "action", "previousSnapshot", "snapshot", "changedFields", "source"
    ) VALUES (
      'prepared-revision', 'prepared-repair', 'SITE', 'prepared-repair', 1, 4,
      'UPDATE', '{}'::jsonb, '{"workingRevision":4}'::jsonb,
      '["name","slug","connectionPhone","supportPhone"]'::jsonb, 'admin-site-values'
    );
  `);

  const migrationSql = readFileSync(repairMigration, 'utf8');
  psql(String.raw`
    INSERT INTO "SitePublication" (
      "id", "siteId", "siteRevision", "status", "catalog", "triggerEntity",
      "triggerEntityId", "updatedAt"
    ) VALUES (
      'active-publication', 'clean-site', 1, 'PENDING', '{}'::jsonb,
      'site', 'clean-site', CURRENT_TIMESTAMP
    );
  `);
  expectMigrationFailure(migrationSql, /active publication or rebuild must finish/);
  psql('DELETE FROM "SitePublication" WHERE "id" = \'active-publication\';');

  psql(String.raw`
    INSERT INTO "SiteRebuild" (
      "id", "siteId", "dedupeKey", "status", "triggerEntity", "triggerEntityId",
      "affectedPaths", "updatedAt"
    ) VALUES (
      'active-rebuild', 'clean-site', 'active-rebuild', 'RUNNING', 'site',
      'clean-site', '[]'::jsonb, CURRENT_TIMESTAMP
    );
  `);
  expectMigrationFailure(migrationSql, /active publication or rebuild must finish/);
  psql('DELETE FROM "SiteRebuild" WHERE "id" = \'active-rebuild\';');

  const publicationsBefore = publicationRows();
  psql(migrationSql);
  assertState();
  assert.equal(publicationRows(), publicationsBefore, '0039 must not change historical publication rows');

  // A second execution is a no-op because the repaired site now has a prepared
  // working revision. This guards manual rehearsal reruns as well as selection.
  psql(migrationSql);
  assertState();
  assert.equal(publicationRows(), publicationsBefore, '0039 rerun must leave publications unchanged');

  process.stdout.write('0039 PostgreSQL 18 rehearsal passed: active work rejected; legacy-broken repaired once; published, prepared and clean sites unchanged.\n');
} catch (error) {
  rehearsalFailure = error;
  throw error;
} finally {
  if (containerStarted) {
    const cleanup = runDocker(['rm', '-f', containerName], { timeoutMs: 30_000 });
    if (cleanup.status !== 0) {
      const details = [cleanup.stdout, cleanup.stderr].filter(Boolean).join('\n').trim();
      const cleanupError = new Error(`failed to remove rehearsal container ${containerName}${details ? `:\n${details}` : ''}`);
      if (rehearsalFailure) {
        process.stderr.write(`${cleanupError.message}\n`);
      } else {
        throw cleanupError;
      }
    }
  }
}

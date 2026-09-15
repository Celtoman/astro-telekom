import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repositoryRoot = process.cwd();
const orchestratorPath = join(repositoryRoot, 'scripts', 'postgres-backup-rehearsal.mjs');
const remoteScriptPath = join(repositoryRoot, 'scripts', 'postgres-backup-rehearsal.sh');
const roleProvisionPath = join(repositoryRoot, 'scripts', 'provision-postgres-backup-role.sql');
const workflowPath = join(repositoryRoot, '.github', 'workflows', 'postgres-backup.yml');
const runbookPath = join(repositoryRoot, 'docs', 'runbooks', 'postgresql-backup-restore.md');
const recipientPath = join(repositoryRoot, 'deploy', 'backup', 'recipient-certificate.pem');
const backupDockerfilePath = join(repositoryRoot, 'deploy', 'backup', 'Dockerfile');
const environmentExamplePath = join(repositoryRoot, '.env.example');
const coolifyComposePath = join(repositoryRoot, 'docker-compose.coolify.yml');
const productionComposePath = join(repositoryRoot, 'docker-compose.prod.yml');
const gitignorePath = join(repositoryRoot, '.gitignore');

async function loadOrchestrator() {
  assert.equal(existsSync(orchestratorPath), true, 'backup orchestrator is missing');
  const moduleUrl = pathToFileURL(orchestratorPath);
  moduleUrl.searchParams.set('test', `${Date.now()}-${Math.random()}`);
  return import(moduleUrl.href);
}

test('S3 presigned URLs are deterministic, scoped and never expose the secret key', async () => {
  const { createPresignedS3Url, createPresignedS3V2Url } = await loadOrchestrator();
  const input = {
    method: 'PUT',
    endpoint: 'https://s3.example.test',
    bucket: 'private-backups',
    key: 'astro-telekom/postgresql/2026/09/15/backup.dump.cms',
    region: 'ru-1',
    accessKey: 'TESTACCESS123',
    secretKey: 'test-secret-key-value',
    now: new Date('2026-09-15T10:20:30.000Z'),
    expiresSeconds: 900,
  };

  const first = createPresignedS3Url(input);
  const second = createPresignedS3Url(input);

  assert.equal(first, second);
  assert.match(first, /^https:\/\/s3\.example\.test\/private-backups\/astro-telekom\/postgresql\//);
  assert.match(first, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
  assert.match(first, /X-Amz-Expires=900/);
  assert.match(first, /X-Amz-SignedHeaders=host/);
  assert.doesNotMatch(first, /test-secret-key-value/);

  const configurationUrl = createPresignedS3V2Url({ ...input, method: 'GET', key: 'td115/task.conf' });
  assert.match(configurationUrl, /AWSAccessKeyId=TESTACCESS123/);
  assert.match(configurationUrl, /Expires=\d+/);
  assert.match(configurationUrl, /Signature=/);
  assert.doesNotMatch(configurationUrl, /test-secret-key-value/);
  assert.ok(configurationUrl.length < 220, 'configuration URL must fit Coolify VARCHAR(255) command');
});

test('Coolify task command only carries short-lived URLs and public material', async () => {
  const { buildRemoteTaskCommand, parseArguments } = await loadOrchestrator();
  const command = buildRemoteTaskCommand({
    configurationUrl: 'https://s3.example.test/task.conf?Expires=123&Signature=one',
  });

  assert.match(command, /BACKUP_CONFIG_URL=/);
  assert.match(command, /postgres-backup-rehearsal/);
  assert.doesNotMatch(command, /wget|curl|\|\s*sh|\.sh/);
  assert.doesNotMatch(command, /COOLIFY_API_TOKEN|S3_SECRET|POSTGRES_PASSWORD|private[_-]?key/i);
  assert.throws(() => parseArguments(['node', 'script', '--rehersse']), /unknown backup argument/i);
});

test('safe evidence parser requires successful round-trip, clean audit and exact SHA', async () => {
  const { parseSafeEvidence } = await loadOrchestrator();
  const evidence = parseSafeEvidence([
    'BACKUP_OBJECT=astro-telekom/postgresql/2026/09/15/backup.dump.cms',
    'BACKUP_BYTES=4096',
    'BACKUP_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'BACKUP_PLAINTEXT_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'SOURCE_SHA=0123456789abcdef0123456789abcdef01234567',
    'DEPLOYMENT_SHA=89abcdef0123456789abcdef0123456789abcdef',
    'POSTGRES_VERSION=18.6',
    'POSTGRES_CLIENT_VERSION=18.6',
    'RESTORE_SERVER_VERSION=18.6',
    'MIGRATIONS_APPLIED=31',
    'MIGRATION_INTEGRITY_VIOLATIONS=0',
    'LATEST_MIGRATION=0031_publication_schedule',
    'MIGRATION_HISTORY_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'SITES_TOTAL=1',
    'CITIES_TOTAL=207',
    'PAGES_TOTAL=420',
    'PAGE_BLOCKS_TOTAL=1449',
    'TARIFFS_TOTAL=3859',
    'LEADS_TOTAL=9',
    'ROUTE_COLLISIONS=0',
    'RELATION_INTEGRITY_VIOLATIONS=0',
    'AUDIT_MATCH=true',
    'S3_READBACK=true',
    'BACKUP_ROLE_SAFE=true',
    'RESTORE_REHEARSAL=success',
  ].join('\n'));

  assert.equal(evidence.backupBytes, 4096);
  assert.equal(evidence.migrationsApplied, 31);
  assert.equal(evidence.restoreRehearsal, 'success');
  assert.equal(evidence.deploymentSha, '89abcdef0123456789abcdef0123456789abcdef');
  assert.equal(evidence.postgresServerVersion, '18.6');
  assert.throws(
    () => parseSafeEvidence('BACKUP_OBJECT=x\nROUTE_COLLISIONS=1\nRELATION_INTEGRITY_VIOLATIONS=0\nMIGRATION_INTEGRITY_VIOLATIONS=0\nRESTORE_REHEARSAL=success'),
    /route collisions/i,
  );
  assert.throws(
    () => parseSafeEvidence('AWSAccessKeyId=TESTACCESS\nSignature=secret'),
    /sensitive material/i,
  );
  assert.throws(
    () => parseSafeEvidence([
      'BACKUP_OBJECT=x',
      'BACKUP_BYTES=0',
      'BACKUP_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'BACKUP_PLAINTEXT_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'SOURCE_SHA=0123456789abcdef0123456789abcdef01234567',
      'DEPLOYMENT_SHA=89abcdef0123456789abcdef0123456789abcdef',
      'POSTGRES_VERSION=18.6',
      'POSTGRES_CLIENT_VERSION=18.6',
      'RESTORE_SERVER_VERSION=18.6',
      'MIGRATIONS_APPLIED=31',
      'MIGRATION_INTEGRITY_VIOLATIONS=0',
      'LATEST_MIGRATION=0031_publication_schedule',
      'MIGRATION_HISTORY_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'SITES_TOTAL=1',
      'CITIES_TOTAL=207',
      'PAGES_TOTAL=420',
      'PAGE_BLOCKS_TOTAL=1449',
      'TARIFFS_TOTAL=3859',
      'LEADS_TOTAL=9',
      'ROUTE_COLLISIONS=0',
      'RELATION_INTEGRITY_VIOLATIONS=0',
      'AUDIT_MATCH=true',
      'S3_READBACK=true',
      'BACKUP_ROLE_SAFE=true',
      'RESTORE_REHEARSAL=success',
    ].join('\n')),
    /empty/i,
  );
});

test('retention only selects old encrypted backups inside the exact project prefix', async () => {
  const { parseListObjectsPage, selectExpiredBackupKeys } = await loadOrchestrator();
  const expired = selectExpiredBackupKeys([
    { key: 'astro-telekom/postgresql/old.dump.cms', lastModified: '2026-07-01T00:00:00Z' },
    { key: 'astro-telekom/postgresql/recent.dump.cms', lastModified: '2026-09-10T00:00:00Z' },
    { key: 'other-project/postgresql/old.dump.cms', lastModified: '2026-07-01T00:00:00Z' },
    { key: 'astro-telekom/postgresql/old.dump', lastModified: '2026-07-01T00:00:00Z' },
  ], {
    prefix: 'astro-telekom/postgresql/',
    retentionDays: 35,
    now: new Date('2026-09-15T00:00:00Z'),
  });

  assert.deepEqual(expired, ['astro-telekom/postgresql/old.dump.cms']);

  const parsedPage = parseListObjectsPage([
    '<ListBucketResult>',
    '<IsTruncated>true</IsTruncated>',
    '<NextContinuationToken>next&amp;page</NextContinuationToken>',
    '<Contents><Key>astro-telekom/postgresql/old.dump.cms</Key><LastModified>2026-07-01T00:00:00Z</LastModified></Contents>',
    '</ListBucketResult>',
  ].join(''));
  assert.equal(parsedPage.isTruncated, true);
  assert.equal(parsedPage.nextContinuationToken, 'next&page');
  assert.equal(parsedPage.entries.length, 1);
});

test('transport retry is bounded and limited to transient failures', async () => {
  const { requestWithRetry } = await loadOrchestrator();
  let attempts = 0;
  const response = await requestWithRetry('https://s3.example.test/object', {}, {
    attempts: 3,
    delay: async () => {},
    fetchImplementation: async () => {
      attempts += 1;
      return attempts === 1 ? new Response('', { status: 503 }) : new Response('ok', { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);

  attempts = 0;
  const permanent = await requestWithRetry('https://s3.example.test/object', {}, {
    attempts: 3,
    delay: async () => {},
    fetchImplementation: async () => {
      attempts += 1;
      return new Response('', { status: 403 });
    },
  });
  assert.equal(permanent.status, 403);
  assert.equal(attempts, 1);
});

test('latest successful Coolify deployment is selected and tied to its exact commit', async () => {
  const { selectLatestFinishedDeployment } = await loadOrchestrator();
  const selected = selectLatestFinishedDeployment([
    { deployment_uuid: 'running', commit: 'a'.repeat(40), status: 'in_progress', created_at: '2026-09-15T13:00:00Z' },
    { deployment_uuid: 'older', commit: 'b'.repeat(40), status: 'finished', finished_at: '2026-09-15T11:00:00Z' },
    { deployment_uuid: 'latest', commit: 'c'.repeat(40), status: 'finished', finished_at: '2026-09-15T12:00:00Z' },
  ]);

  assert.equal(selected.deploymentUuid, 'latest');
  assert.equal(selected.deploymentSha, 'c'.repeat(40));
});

test('remote script enforces encrypted S3 round-trip and isolated PostgreSQL 18 restore', () => {
  assert.equal(existsSync(remoteScriptPath), true, 'remote backup script is missing');
  const script = readFileSync(remoteScriptPath, 'utf8');

  assert.match(script, /pg_dump[^\n]*--format=custom/);
  assert.match(script, /astro-postgres-backup\.lock/);
  assert.match(script, /flock -n 9/);
  assert.match(script, /--file "\$snapshot_sql" 9>&-/);
  assert.match(script, /pg_ctl[\s\S]*?-w start 9>&-/);
  assert.match(script, /TASK_CONFIGURATION_DUPLICATE/);
  assert.match(script, /--proto '=https' --proto-redir '=https'/);
  assert.doesNotMatch(script, /^\s*(?:source|\.)\s/m);
  assert.doesNotMatch(script, /\beval\s/);
  assert.match(script, /BACKUP_ROLE_NOT_READ_ONLY/);
  assert.match(script, /pg_read_all_data/);
  assert.match(script, /pg_write_all_data/);
  assert.match(script, /pg_export_snapshot/);
  assert.match(script, /pg_dump[\s\S]*--snapshot/);
  assert.match(script, /openssl cms -encrypt/);
  assert.match(script, /sha256sum/);
  assert.match(script, /BACKUP_PUT_URL/);
  assert.match(script, /BACKUP_GET_URL/);
  assert.match(script, /initdb/);
  assert.match(script, /template0/);
  assert.match(script, /pg_restore[^\n]*--exit-on-error/);
  assert.match(script, /vacuumdb[^\n]*--analyze-in-stages/);
  assert.match(script, /SHOW server_version_num/);
  assert.match(script, /unset PGHOST PGPASSWORD POSTGRES_USER POSTGRES_DB/);
  assert.match(script, /createuser[\s\S]*?--no-superuser/);
  assert.match(script, /release-one-database-audit\.sql/);
  assert.match(script, /printf 'AUDIT_MATCH=%s/);
  assert.match(script, /restore_status='success'/);
  assert.doesNotMatch(script, /set\s+-x/);
});

test('backup role is provisioned by an isolated one-shot before the resource-bounded runner starts', () => {
  assert.equal(existsSync(roleProvisionPath), true, 'backup role provision SQL is missing');
  const roleProvision = readFileSync(roleProvisionPath, 'utf8');
  assert.match(roleProvision, /\\getenv backup_password BACKUP_POSTGRES_PASSWORD/);
  assert.match(roleProvision, /CREATE ROLE %I LOGIN/);
  assert.match(roleProvision, /GRANT pg_read_all_data TO %I/);
  assert.match(roleProvision, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(roleProvision, /granted_role\.rolname <> 'pg_read_all_data'/);
  assert.doesNotMatch(roleProvision, /\\quit/);
  assert.doesNotMatch(roleProvision, /BACKUP_POSTGRES_PASSWORD[^\n]*\\echo/);

  for (const composePath of [coolifyComposePath, productionComposePath]) {
    const compose = readFileSync(composePath, 'utf8');
    const bootstrap = compose.match(/\n  backup-bootstrap:[\s\S]*?(?=\n  [a-z][a-z-]+:|\nvolumes:)/)?.[0] ?? '';
    const runner = compose.match(/\n  backup-runner:[\s\S]*?(?=\n  [a-z][a-z-]+:|\nvolumes:)/)?.[0] ?? '';
    assert.match(bootstrap, /pull_policy:\s*never/);
    assert.match(bootstrap, /restart:\s*["']no["']/);
    assert.match(bootstrap, /PGUSER:\s*\$\{POSTGRES_USER/);
    assert.match(bootstrap, /PGPASSWORD:\s*\$\{POSTGRES_PASSWORD/);
    assert.match(bootstrap, /provision-postgres-backup-role\.sql/);
    assert.doesNotMatch(bootstrap, /postgres_data|\/var\/lib\/postgresql/);
    assert.match(runner, /dockerfile:\s*deploy\/backup\/Dockerfile/);
    assert.match(runner, /PGHOST:\s*postgres/);
    assert.match(runner, /POSTGRES_USER:\s*\$\{BACKUP_POSTGRES_USER/);
    assert.match(runner, /PGPASSWORD:\s*\$\{BACKUP_POSTGRES_PASSWORD/);
    assert.doesNotMatch(runner, /POSTGRES_USER:\s*\$\{POSTGRES_USER/);
    assert.match(runner, /mem_limit:/);
    assert.match(runner, /cpus:/);
    assert.match(runner, /backup-bootstrap:[\s\S]*condition:\s*service_completed_successfully/);
    assert.match(runner, /psql[\s\S]*SELECT 1/);
    assert.doesNotMatch(runner, /postgres_data|\/var\/lib\/postgresql/);
  }

  const coolifyCompose = readFileSync(coolifyComposePath, 'utf8');
  assert.doesNotMatch(
    coolifyCompose,
    /BACKUP_POSTGRES_(?:USER|PASSWORD):\?Set/,
    'runtime-only backup credentials must not be required during Coolify build-time interpolation',
  );

  const backupDockerfile = readFileSync(backupDockerfilePath, 'utf8');
  assert.match(backupDockerfile, /^FROM postgres:18\.6-alpine/m);
  assert.match(backupDockerfile, /COPY scripts\/postgres-backup-rehearsal\.sh/);
  assert.match(backupDockerfile, /COPY scripts\/provision-postgres-backup-role\.sql/);
  assert.match(backupDockerfile, /COPY scripts\/release-one-database-audit\.sql/);
  assert.match(backupDockerfile, /COPY deploy\/backup\/recipient-certificate\.pem/);

  const orchestrator = readFileSync(orchestratorPath, 'utf8');
  assert.match(orchestrator, /container:\s*'backup-runner'/);
  assert.doesNotMatch(orchestrator, /container:\s*'postgres'/);
});

test('orchestrator rejects unverifiable rehearsal metadata and removes failed backup objects', async () => {
  const { parseSafeEvidence } = await loadOrchestrator();
  const orchestrator = readFileSync(orchestratorPath, 'utf8');
  const otherwiseValid = [
    'BACKUP_OBJECT=astro-telekom/postgresql/backup.dump.cms',
    'BACKUP_BYTES=4096',
    'BACKUP_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'BACKUP_PLAINTEXT_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'SOURCE_SHA=0123456789abcdef0123456789abcdef01234567',
    'DEPLOYMENT_SHA=unknown',
    'POSTGRES_VERSION=18.6',
    'POSTGRES_CLIENT_VERSION=18.6',
    'RESTORE_SERVER_VERSION=18.6',
    'MIGRATIONS_APPLIED=31',
    'MIGRATION_INTEGRITY_VIOLATIONS=0',
    'LATEST_MIGRATION=0031_publication_schedule',
    'MIGRATION_HISTORY_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'SITES_TOTAL=1',
    'CITIES_TOTAL=207',
    'PAGES_TOTAL=420',
    'PAGE_BLOCKS_TOTAL=1449',
    'TARIFFS_TOTAL=3859',
    'LEADS_TOTAL=9',
    'ROUTE_COLLISIONS=0',
    'RELATION_INTEGRITY_VIOLATIONS=0',
    'AUDIT_MATCH=true',
    'S3_READBACK=true',
    'BACKUP_ROLE_SAFE=true',
    'RESTORE_REHEARSAL=success',
  ].join('\n');

  assert.throws(() => parseSafeEvidence(otherwiseValid), /deployment SHA/i);
  assert.match(orchestrator, /let backupAccepted = false/);
  assert.match(orchestrator, /if \(!backupAccepted\)[\s\S]*sign\('DELETE', backupObject\)/);
  assert.doesNotMatch(orchestrator, /sign\('GET', helperObject\)|wget -qO-|\|sh/);
  assert.match(orchestrator, /backupAccepted = true;[\s\S]*process\.stdout\.write/);
  assert.match(orchestrator, /sourceSha !== liveDeployment\.deploymentSha/);
  assert.doesNotMatch(orchestrator, /BACKUP_SOURCE_SHA/);
  assert.match(readFileSync(gitignorePath, 'utf8'), /^\.backup-evidence\/$/m);
  assert.match(orchestrator, /BACKUP_RECIPIENT_PRIVATE_KEY_PATH/);
  assert.match(orchestrator, /offlineRecipientVerified/);
});

test('scheduled workflow and runbook pin the operational policy and secret boundary', () => {
  for (const requiredPath of [workflowPath, runbookPath, recipientPath]) {
    assert.equal(existsSync(requiredPath), true, `${requiredPath} is missing`);
  }

  const workflow = readFileSync(workflowPath, 'utf8');
  const runbook = readFileSync(runbookPath, 'utf8');
  const environmentExample = readFileSync(environmentExamplePath, 'utf8');

  assert.match(workflow, /cron:\s*['"]15 23 \* \* 0-5['"]/);
  assert.match(workflow, /cron:\s*['"]15 23 \* \* 6['"]/);
  assert.match(workflow, /cron:\s*['"]15 7 \* \* \*['"]/);
  assert.match(workflow, /cron:\s*['"]15 15 \* \* \*['"]/);
  assert.match(workflow, /COOLIFY_API_TOKEN:\s*\$\{\{\s*secrets\.COOLIFY_API_TOKEN\s*\}\}/);
  assert.match(workflow, /name:\s*Create encrypted backup[\s\S]*?env:[\s\S]*?COOLIFY_API_TOKEN/);
  assert.doesNotMatch(workflow, /jobs:[\s\S]*?backup:[\s\S]*?runs-on:[^\n]*\n\s+timeout-minutes:[^\n]*\n\s+env:/);
  assert.match(workflow, /postgres-backup-rehearsal\.mjs/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /upload-artifact@v7/);
  assert.match(runbook, /RPO[^\n]*24/i);
  assert.match(runbook, /RTO[^\n]*4/i);
  assert.match(runbook, /35\s+дн/i);
  assert.match(runbook, /Timeweb S3/i);
  assert.match(runbook, /recipient-certificate\.pem/);
  assert.match(runbook, /one-shot `backup-bootstrap`/);
  assert.match(runbook, /runtime-only/i);
  assert.match(runbook, /build-time\/preview scope[^\n]*запрещен/i);
  assert.match(runbook, /Секреты и PII не выводятся/i);
  assert.match(environmentExample, /BACKUP_POSTGRES_USER=astro_backup/);
  assert.match(environmentExample, /BACKUP_POSTGRES_PASSWORD=/);
});

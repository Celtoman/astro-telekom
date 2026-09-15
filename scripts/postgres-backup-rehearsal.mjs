#!/usr/bin/env node

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const modulePath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(modulePath), '..');
const defaultPrefix = 'astro-telekom/postgresql/';
const terminalStatuses = new Set(['success', 'failed']);
const transientHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const remoteTaskTimeoutSeconds = 45 * 60;

function sha256(value, encoding = 'hex') {
  return createHash('sha256').update(value).digest(encoding);
}

function hmac(key, value, encoding) {
  const digest = createHmac('sha256', key).update(value).digest();
  return encoding === 'hex' ? digest.toString('hex') : digest;
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectPath(value) {
  return value.split('/').map(awsEncode).join('/');
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function createPresignedS3Url({
  method,
  endpoint,
  bucket,
  key = '',
  region,
  accessKey,
  secretKey,
  now = new Date(),
  expiresSeconds = 900,
  query = {},
}) {
  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(method)) {
    throw new Error(`Unsupported S3 method: ${method}`);
  }
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 3600) {
    throw new Error('Presigned URL lifetime must be between 1 and 3600 seconds');
  }

  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password) {
    throw new Error('S3 endpoint must be a clean HTTPS origin');
  }
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const pathname = `${endpointUrl.pathname.replace(/\/$/, '')}/${encodeObjectPath(bucket)}${key ? `/${encodeObjectPath(key)}` : ''}`;
  const parameters = new Map([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKey}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
    ...Object.entries(query).map(([name, value]) => [name, String(value)]),
  ]);
  const canonicalQuery = [...parameters.entries()]
    .map(([name, value]) => [awsEncode(name), awsEncode(value)])
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  const canonicalRequest = [
    method,
    pathname,
    canonicalQuery,
    `host:${endpointUrl.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const dateKey = hmac(Buffer.from(`AWS4${secretKey}`, 'utf8'), dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');

  return `${endpointUrl.origin}${pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function createPresignedS3V2Url({
  method,
  endpoint,
  bucket,
  key,
  accessKey,
  secretKey,
  now = new Date(),
  expiresSeconds = 900,
}) {
  if (!['GET', 'PUT', 'DELETE'].includes(method)) throw new Error(`Unsupported S3 V2 method: ${method}`);
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 3600) {
    throw new Error('Presigned URL lifetime must be between 1 and 3600 seconds');
  }
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password) {
    throw new Error('S3 endpoint must be a clean HTTPS origin');
  }
  const expires = Math.floor(now.getTime() / 1000) + expiresSeconds;
  const pathname = `${endpointUrl.pathname.replace(/\/$/, '')}/${encodeObjectPath(bucket)}/${encodeObjectPath(key)}`;
  const canonicalResource = `${endpointUrl.pathname.replace(/\/$/, '')}/${bucket}/${key}`;
  const stringToSign = `${method}\n\n\n${expires}\n${canonicalResource}`;
  const signature = createHmac('sha1', secretKey).update(stringToSign).digest('base64');
  return `${endpointUrl.origin}${pathname}?AWSAccessKeyId=${awsEncode(accessKey)}&Expires=${expires}&Signature=${awsEncode(signature)}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function buildRemoteTaskCommand({
  configurationUrl,
}) {
  const url = new URL(configurationUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Backup task configuration URL must use a clean HTTPS origin');
  }
  return `BACKUP_CONFIG_URL=${shellQuote(configurationUrl)} postgres-backup-rehearsal`;
}

function requireEvidenceValue(values, name) {
  const value = values.get(name);
  if (value === undefined || value === '') throw new Error(`Missing evidence field ${name}`);
  return value;
}

function requireNonNegativeInteger(values, name) {
  const raw = requireEvidenceValue(values, name);
  if (!/^\d+$/.test(raw)) throw new Error(`Evidence field ${name} is not an integer`);
  return Number(raw);
}

export function parseSafeEvidence(message, { requireRehearsal = true } = {}) {
  if (/COOLIFY_API_TOKEN|POSTGRES_PASSWORD|S3_SECRET|AWS_SECRET|BEGIN (?:RSA )?PRIVATE KEY|X-Amz-(?:Credential|Signature)|AWSAccessKeyId=|(?:^|[\r\n?&])Signature=/i.test(message)) {
    throw new Error('Execution output contains sensitive material');
  }
  const values = new Map();
  for (const line of message.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }

  const routeCollisions = requireNonNegativeInteger(values, 'ROUTE_COLLISIONS');
  const relationIntegrityViolations = requireNonNegativeInteger(values, 'RELATION_INTEGRITY_VIOLATIONS');
  const migrationIntegrityViolations = requireNonNegativeInteger(values, 'MIGRATION_INTEGRITY_VIOLATIONS');
  if (routeCollisions !== 0) throw new Error('Restore audit found route collisions');
  if (relationIntegrityViolations !== 0) throw new Error('Restore audit found relation integrity violations');
  if (migrationIntegrityViolations !== 0) throw new Error('Restore audit found migration integrity violations');
  if (requireEvidenceValue(values, 'S3_READBACK') !== 'true') throw new Error('S3 read-back was not verified');
  if (requireEvidenceValue(values, 'BACKUP_ROLE_SAFE') !== 'true') {
    throw new Error('Source database role did not pass the read-only privilege audit');
  }

  const restoreRehearsal = requireEvidenceValue(values, 'RESTORE_REHEARSAL');
  if (requireRehearsal) {
    if (restoreRehearsal !== 'success') throw new Error('Restore rehearsal did not succeed');
    if (requireEvidenceValue(values, 'AUDIT_MATCH') !== 'true') throw new Error('Restored audit differs from production audit');
  } else if (!['success', 'skipped'].includes(restoreRehearsal)) {
    throw new Error('Unexpected restore rehearsal status');
  }

  const backupSha256 = requireEvidenceValue(values, 'BACKUP_SHA256');
  const backupPlaintextSha256 = requireEvidenceValue(values, 'BACKUP_PLAINTEXT_SHA256');
  const migrationHistorySha256 = requireEvidenceValue(values, 'MIGRATION_HISTORY_SHA256');
  const latestMigration = requireEvidenceValue(values, 'LATEST_MIGRATION');
  const sourceSha = requireEvidenceValue(values, 'SOURCE_SHA');
  const deploymentSha = values.get('DEPLOYMENT_SHA') ?? 'unknown';
  const backupBytes = requireNonNegativeInteger(values, 'BACKUP_BYTES');
  const postgresServerVersion = requireEvidenceValue(values, 'POSTGRES_VERSION');
  const postgresClientVersion = requireEvidenceValue(values, 'POSTGRES_CLIENT_VERSION');
  const restoreServerVersion = requireEvidenceValue(values, 'RESTORE_SERVER_VERSION');
  if (backupBytes === 0) throw new Error('Backup evidence describes an empty archive');
  if (!/^[0-9a-f]{64}$/i.test(backupSha256)) throw new Error('Backup checksum is invalid');
  if (!/^[0-9a-f]{64}$/i.test(backupPlaintextSha256)) throw new Error('Backup plaintext checksum is invalid');
  if (!/^[0-9a-f]{64}$/i.test(migrationHistorySha256)) throw new Error('Migration history checksum is invalid');
  if (!/^[0-9A-Za-z_-]+$/.test(latestMigration)) throw new Error('Latest migration name is invalid');
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error('Source SHA is invalid');
  if (!/^18(?:\.|$)/.test(postgresServerVersion) || !/^18(?:\.|$)/.test(postgresClientVersion)) {
    throw new Error('Source PostgreSQL server/client major is not 18');
  }
  if (!/^[0-9a-f]{40}$/i.test(deploymentSha)) {
    throw new Error('Deployment SHA is required for backup evidence');
  }
  if (requireRehearsal && !/^18(?:\.|$)/.test(restoreServerVersion)) {
    throw new Error('Restore PostgreSQL server major is not 18');
  }

  return {
    backupObject: requireEvidenceValue(values, 'BACKUP_OBJECT'),
    backupBytes,
    backupSha256,
    backupPlaintextSha256,
    sourceSha,
    deploymentSha,
    postgresVersion: postgresServerVersion,
    postgresServerVersion,
    postgresClientVersion,
    restoreServerVersion,
    migrationsApplied: requireNonNegativeInteger(values, 'MIGRATIONS_APPLIED'),
    migrationIntegrityViolations,
    latestMigration,
    migrationHistorySha256,
    counts: {
      sites: requireNonNegativeInteger(values, 'SITES_TOTAL'),
      cities: requireNonNegativeInteger(values, 'CITIES_TOTAL'),
      pages: requireNonNegativeInteger(values, 'PAGES_TOTAL'),
      pageBlocks: requireNonNegativeInteger(values, 'PAGE_BLOCKS_TOTAL'),
      tariffs: requireNonNegativeInteger(values, 'TARIFFS_TOTAL'),
      leads: requireNonNegativeInteger(values, 'LEADS_TOTAL'),
    },
    routeCollisions,
    relationIntegrityViolations,
    backupRoleSafe: true,
    auditMatch: values.get('AUDIT_MATCH') ?? 'not-run',
    s3Readback: true,
    restoreRehearsal,
  };
}

export function selectExpiredBackupKeys(entries, { prefix, retentionDays, now = new Date() }) {
  if (!prefix || !prefix.endsWith('/')) throw new Error('Retention prefix must end with /');
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error('Retention days must be positive');
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return entries
    .filter(({ key, lastModified }) =>
      key.startsWith(prefix)
      && key.endsWith('.dump.cms')
      && new Date(lastModified).getTime() < cutoff,
    )
    .map(({ key }) => key)
    .sort();
}

function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

async function loadConfiguration() {
  let fileValues = {};
  try {
    fileValues = parseDotEnv(await readFile(join(repositoryRoot, '.env'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const value = (name, fallback) => process.env[name] || fileValues[name] || fallback;
  const required = (name) => {
    const result = value(name);
    if (!result) throw new Error(`${name} is required`);
    return result;
  };
  return {
    coolifyApiUrl: required('COOLIFY_API_URL').replace(/\/$/, ''),
    coolifyApiToken: required('COOLIFY_API_TOKEN'),
    coolifyResourceUuid: required('COOLIFY_RESOURCE_UUID'),
    s3StorageUuid: value('BACKUP_S3_STORAGE_UUID'),
    recipientCertificatePath: resolve(value(
      'BACKUP_RECIPIENT_CERTIFICATE_PATH',
      join(repositoryRoot, 'deploy', 'backup', 'recipient-certificate.pem'),
    )),
    deploymentSha: required('BACKUP_DEPLOYMENT_SHA'),
    retentionDays: Number(value('BACKUP_RETENTION_DAYS', '35')),
    evidenceFile: value('BACKUP_EVIDENCE_FILE'),
    recipientPrivateKeyPath: value('BACKUP_RECIPIENT_PRIVATE_KEY_PATH'),
    opensslPath: value('BACKUP_OPENSSL_PATH', 'openssl'),
  };
}

async function coolifyRequest(configuration, path, options = {}) {
  const response = await requestWithRetry(`${configuration.coolifyApiUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${configuration.coolifyApiToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  }, { attempts: (options.method ?? 'GET') === 'GET' ? 3 : 1 });
  const text = await response.text();
  if (!response.ok) throw new Error(`Coolify ${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

async function s3Request(url, options = {}) {
  const response = await requestWithRetry(url, options);
  if (!response.ok) throw new Error(`S3 ${options.method ?? 'GET'} failed with HTTP ${response.status}`);
  return response;
}

export async function requestWithRetry(input, init = {}, {
  attempts = 3,
  fetchImplementation = fetch,
  delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
    throw new Error('Transport retry attempts must be between 1 and 3');
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImplementation(input, init);
      if (!transientHttpStatuses.has(response.status) || attempt === attempts) return response;
      await response.arrayBuffer().catch(() => {});
    } catch {
      if (attempt === attempts) throw new Error('Transport request failed after bounded retries');
    }
    await delay(500 * (2 ** (attempt - 1)));
  }
  throw new Error('Transport request failed after bounded retries');
}

function createS3Signer(storage, now = new Date()) {
  const common = {
    endpoint: storage.endpoint,
    bucket: storage.bucket,
    region: storage.region,
    accessKey: storage.key,
    secretKey: storage.secret,
    now,
    expiresSeconds: 3600,
  };
  return (method, key, query) => createPresignedS3Url({ ...common, method, key, query });
}

async function determineSourceSha() {
  const workingTreeStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (workingTreeStatus) {
    throw new Error('Working tree must be clean before source SHA can be used as backup evidence');
  }
  return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

async function waitForExecution(configuration, taskUuid, timeoutMs = (remoteTaskTimeoutSeconds + 5 * 60) * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const executions = await coolifyRequest(
      configuration,
      `/applications/${configuration.coolifyResourceUuid}/scheduled-tasks/${taskUuid}/executions`,
    );
    const latest = [...executions].sort((left, right) =>
      String(right.created_at).localeCompare(String(left.created_at)),
    )[0];
    if (latest && terminalStatuses.has(latest.status)) return latest;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
  }
  throw new Error('Coolify backup task timed out');
}

export function selectLatestFinishedDeployment(deployments) {
  const latest = deployments
    .filter((deployment) => deployment.status === 'finished' && /^[0-9a-f]{40}$/i.test(deployment.commit ?? ''))
    .sort((left, right) => String(right.finished_at ?? right.updated_at ?? right.created_at)
      .localeCompare(String(left.finished_at ?? left.updated_at ?? left.created_at)))[0];
  if (!latest?.deployment_uuid) throw new Error('No exact-SHA finished Coolify deployment was found');
  return { deploymentUuid: latest.deployment_uuid, deploymentSha: latest.commit };
}

async function readLiveDeployment(configuration) {
  const response = await coolifyRequest(
    configuration,
    `/deployments/applications/${encodeURIComponent(configuration.coolifyResourceUuid)}?skip=0&take=50`,
  );
  const deployments = Array.isArray(response) ? response : response?.deployments;
  if (!Array.isArray(deployments)) throw new Error('Coolify deployment list has an unexpected shape');
  return selectLatestFinishedDeployment(deployments);
}

export function parseListObjectsPage(xml) {
  const decode = (value) => value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
  const token = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
  return {
    entries: [...xml.matchAll(/<Contents>\s*<Key>([\s\S]*?)<\/Key>[\s\S]*?<LastModified>([^<]+)<\/LastModified>[\s\S]*?<\/Contents>/g)]
      .map((match) => ({ key: decode(match[1]), lastModified: match[2] })),
    isTruncated: /<IsTruncated>true<\/IsTruncated>/.test(xml),
    nextContinuationToken: token ? decode(token) : null,
  };
}

async function applyRetention(sign, retentionDays, currentKey) {
  const entries = [];
  let continuationToken;
  do {
    const query = { 'list-type': '2', prefix: defaultPrefix };
    if (continuationToken) query['continuation-token'] = continuationToken;
    const response = await s3Request(sign('GET', '', query));
    const page = parseListObjectsPage(await response.text());
    entries.push(...page.entries);
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
    if (page.isTruncated && !continuationToken) throw new Error('S3 listing is truncated without a continuation token');
  } while (continuationToken);
  const expired = selectExpiredBackupKeys(entries, {
    prefix: defaultPrefix,
    retentionDays,
  }).filter((key) => key !== currentKey);
  for (const key of expired) await s3Request(sign('DELETE', key), { method: 'DELETE' });
  return expired.length;
}

export function parseArguments(argv) {
  const rawArguments = argv.slice(2);
  const allowed = new Set(['--rehearse', '--verify-offline-key']);
  const unknown = rawArguments.find((argument) => !allowed.has(argument));
  if (unknown) throw new Error(`Unknown backup argument: ${unknown}`);
  const args = new Set(rawArguments);
  return {
    rehearse: args.has('--rehearse'),
    verifyOfflineKey: args.has('--verify-offline-key'),
  };
}

async function verifyOfflineRecipient({ configuration, encryptedUrl, expectedPlaintextSha256 }) {
  if (!configuration.recipientPrivateKeyPath) {
    throw new Error('BACKUP_RECIPIENT_PRIVATE_KEY_PATH is required for offline-key verification');
  }
  const verificationDirectory = await mkdtemp(join(tmpdir(), 'astro-backup-key-'));
  const encryptedPath = join(verificationDirectory, 'backup.dump.cms');
  const decryptedPath = join(verificationDirectory, 'backup.dump');
  try {
    const response = await s3Request(encryptedUrl);
    await writeFile(encryptedPath, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    try {
      execFileSync(configuration.opensslPath, [
        'cms', '-decrypt', '-binary', '-inform', 'DER',
        '-in', encryptedPath,
        '-recip', configuration.recipientCertificatePath,
        '-inkey', resolve(configuration.recipientPrivateKeyPath),
        '-out', decryptedPath,
      ], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
      throw new Error('Offline recovery key verification failed');
    }
    const plaintextSha256 = sha256(await readFile(decryptedPath));
    if (plaintextSha256 !== expectedPlaintextSha256) {
      throw new Error('Offline recovery key decrypted a dump with an unexpected checksum');
    }
    return true;
  } finally {
    await rm(verificationDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const startedAt = new Date();
  const configuration = await loadConfiguration();
  const { rehearse, verifyOfflineKey } = parseArguments(process.argv);
  if (verifyOfflineKey && !rehearse) throw new Error('--verify-offline-key requires --rehearse');
  const sourceSha = await determineSourceSha();
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error('Unable to determine exact source SHA');
  const liveDeployment = await readLiveDeployment(configuration);
  if (configuration.deploymentSha !== liveDeployment.deploymentSha) {
    throw new Error('Configured deployment SHA differs from the latest finished Coolify deployment');
  }
  if (sourceSha !== liveDeployment.deploymentSha) {
    throw new Error('Workflow source SHA differs from the latest finished Coolify deployment');
  }
  const storages = await coolifyRequest(configuration, '/s3-storages');
  const usable = storages.filter((storage) => storage.is_usable ?? storage.isUsable);
  const storage = configuration.s3StorageUuid
    ? usable.find((candidate) => candidate.uuid === configuration.s3StorageUuid)
    : usable.length === 1 ? usable[0] : null;
  if (!storage?.key || !storage?.secret || !storage?.bucket || !storage?.endpoint || !storage?.region) {
    throw new Error('Exactly one usable S3 storage with complete credentials is required');
  }

  const sign = createS3Signer(storage, startedAt);
  const timestamp = startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const backupObject = `${defaultPrefix}${startedAt.toISOString().slice(0, 10).replaceAll('-', '/')}/${timestamp}-${sourceSha.slice(0, 12)}.dump.cms`;
  const operationId = randomBytes(12).toString('hex');
  const configurationObject = `td115/${operationId.slice(0, 12)}.conf`;
  const temporaryObjects = [configurationObject];
  const remainingTemporaryObjects = new Set(temporaryObjects);
  let taskUuid;
  let backupAccepted = false;

  const cleanupTemporaryArtifacts = async ({ strict }) => {
    let cleanupFailed = false;
    if (taskUuid) {
      try {
        await coolifyRequest(
          configuration,
          `/applications/${configuration.coolifyResourceUuid}/scheduled-tasks/${taskUuid}`,
          { method: 'DELETE' },
        );
        taskUuid = undefined;
      } catch {
        cleanupFailed = true;
      }
    }
    for (const key of [...remainingTemporaryObjects]) {
      try {
        await s3Request(sign('DELETE', key), { method: 'DELETE' });
        remainingTemporaryObjects.delete(key);
      } catch {
        cleanupFailed = true;
      }
    }
    if (strict && cleanupFailed) throw new Error('Temporary backup artifacts could not be removed');
  };

  try {
    const taskConfiguration = [
      `BACKUP_PUT_URL=${sign('PUT', backupObject)}`,
      `BACKUP_GET_URL=${sign('GET', backupObject)}`,
      `BACKUP_OBJECT_KEY=${backupObject}`,
      `SOURCE_SHA=${sourceSha}`,
      `DEPLOYMENT_SHA=${liveDeployment.deploymentSha}`,
      `REHEARSE=${rehearse ? 'true' : 'false'}`,
    ].join('\n');
    await s3Request(sign('PUT', configurationObject), {
      method: 'PUT',
      body: Buffer.from(`${taskConfiguration}\n`),
    });
    const configurationUrl = createPresignedS3V2Url({
      method: 'GET',
      endpoint: storage.endpoint,
      bucket: storage.bucket,
      key: configurationObject,
      accessKey: storage.key,
      secretKey: storage.secret,
      now: startedAt,
      expiresSeconds: 3600,
    });
    const command = buildRemoteTaskCommand({ configurationUrl });
    if (command.length > 255) throw new Error(`Coolify backup command exceeds 255 characters (${command.length})`);
    const task = await coolifyRequest(
      configuration,
      `/applications/${configuration.coolifyResourceUuid}/scheduled-tasks`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `postgres-backup-${operationId}`,
          command,
          frequency: 'yearly',
          container: 'backup-runner',
          timeout: remoteTaskTimeoutSeconds,
          enabled: true,
        }),
      },
    );
    taskUuid = task.uuid;
    await coolifyRequest(
      configuration,
      `/applications/${configuration.coolifyResourceUuid}/scheduled-tasks/${taskUuid}/execute`,
      { method: 'POST' },
    );
    const execution = await waitForExecution(configuration, taskUuid);
    if (execution.status !== 'success') throw new Error('Coolify backup task failed before accepted evidence');
    const evidence = parseSafeEvidence(execution.message ?? '', { requireRehearsal: rehearse });
    if (
      evidence.backupObject !== backupObject
      || evidence.sourceSha !== sourceSha
      || evidence.deploymentSha !== liveDeployment.deploymentSha
    ) {
      throw new Error('Remote backup evidence does not match the requested object and exact revisions');
    }
    const offlineRecipientVerified = verifyOfflineKey
      ? await verifyOfflineRecipient({
        configuration,
        encryptedUrl: sign('GET', backupObject),
        expectedPlaintextSha256: evidence.backupPlaintextSha256,
      })
      : false;
    await cleanupTemporaryArtifacts({ strict: true });
    const retainedDeleted = await applyRetention(sign, configuration.retentionDays, backupObject);
    const manifest = {
      schemaVersion: 1,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      policy: {
        storage: 'private Timeweb S3',
        encryption: 'CMS EnvelopedData AES-256 before upload; RSA recipient certificate',
        retentionDays: configuration.retentionDays,
        rpoHours: 24,
        rtoHours: 4,
      },
      ...evidence,
      deploymentUuid: liveDeployment.deploymentUuid,
      offlineRecipientVerified,
      temporaryArtifactsCleaned: true,
      retainedDeleted,
    };
    const evidenceFile = configuration.evidenceFile
      ? resolve(configuration.evidenceFile)
      : join(repositoryRoot, '.backup-evidence', `${timestamp}.json`);
    await mkdir(dirname(evidenceFile), { recursive: true });
    await writeFile(evidenceFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    backupAccepted = true;
    process.stdout.write(`${JSON.stringify({ evidenceFile, ...manifest }, null, 2)}\n`);
  } finally {
    await cleanupTemporaryArtifacts({ strict: false });
    if (!backupAccepted) {
      await s3Request(sign('DELETE', backupObject), { method: 'DELETE' }).catch(() => {});
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  main().catch((error) => {
    process.stderr.write(`Backup operation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

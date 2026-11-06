import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readArtifact, readHistoricalArtifact, readReceipt, writeImmutableJson } from './artifact-store.mjs';
import { planRetention, acknowledgeArchive, collectArtifact, restoreArtifact } from './artifact-retention.mjs';
import { ActivationConflictError, ActivationUncertainError, ActivationRejectedError } from './caddy-activation.mjs';
import { publicationIsNewer } from './publication-order.mjs';

class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
class BuildFailedError extends Error {}
const fields = ['publicationId', 'siteId', 'siteSlug', 'rebuildId', 'rebuildRevision'];
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function jobIdentity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key) && key !== 'progressRunId')) throw new InputError('Unsupported publication request fields');
  for (const field of ['publicationId', 'siteId', 'rebuildId']) if (!validId(input[field])) throw new InputError(`Invalid ${field}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.siteSlug || '') || !Number.isSafeInteger(input.rebuildRevision) || input.rebuildRevision < 1) throw new InputError('Invalid site/rebuild revision');
  if (input.progressRunId !== undefined && !/^[a-f0-9-]{36}$/.test(input.progressRunId)) throw new InputError('Invalid progress run identity');
  return { ...Object.fromEntries(fields.map(field => [field, input[field]])), ...(input.progressRunId ? { progressRunId: input.progressRunId } : {}) };
}
function operationName(rebuildId, revision) {
  if (!validId(rebuildId) || !Number.isSafeInteger(revision) || revision < 1) throw new InputError('Invalid rebuild identity');
  return `${createHash('sha256').update(JSON.stringify([rebuildId, revision])).digest('hex')}.json`;
}

const codeFields = ['deploymentId', 'expectedCommit', 'rendererId', 'instanceId'];
function codeIdentity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !codeFields.includes(key))) throw new InputError('Unsupported code release fields');
  if (!validId(input.deploymentId) || !/^[a-f0-9]{40}$/.test(input.expectedCommit || '')
    || !/^[a-f0-9]{64}$/.test(input.rendererId || '') || !/^[a-f0-9-]{36}$/.test(input.instanceId || '')) throw new InputError('Invalid code release identity');
  return Object.fromEntries(codeFields.map(field => [field, input[field]]));
}

export class PublicationController {
  constructor({ publicationRoot, builder, activation, verifyCodeRelease }) {
    this.root = resolve(publicationRoot); this.builder = builder; this.activation = activation;
    this.verifyCodeRelease = verifyCodeRelease; this.instanceId = randomUUID();
    this.pending = Promise.resolve();
  }

  async active() { return (await this.activation.current()).active; }

  async rendererIdentity() { return { rendererId: await this.builder.renderer, instanceId: this.instanceId }; }

  serial(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  retentionPlan(options = {}) {
    return this.serial(async () => planRetention({ root: this.root, serving: await this.activation.current(), ...options }));
  }

  acknowledgeArchive(proof) {
    return this.serial(() => acknowledgeArchive(this.root, proof));
  }

  collectArtifact(artifactId) {
    return this.serial(() => collectArtifact({ root: this.root, servingReader: () => this.activation.current(), artifactId }));
  }

  restoreArtifact(artifactId) {
    return this.serial(() => restoreArtifact({ root: this.root, artifactId }));
  }

  async eligible(artifact, job) {
    const snapshot = await this.builder.fetchSnapshot(job);
    if (['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'catalogDigest'].some(field => snapshot[field] !== artifact[field])) throw new Error('Persisted snapshot identity/digest mismatch');
    if ((artifact.releaseSequence !== undefined && artifact.releaseSequence !== snapshot.releaseSequence) || (artifact.basePublicationId !== undefined && artifact.basePublicationId !== snapshot.basePublicationId)) throw new Error('Persisted editorial publication identity mismatch');
  }

  async operation(rebuildId, revision) {
    const operation = await readFile(join(this.root, 'operations', operationName(rebuildId, revision)), 'utf8')
      .then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (!operation) return null;
    const { operationDigest, ...content } = operation;
    if (digest(content) !== operationDigest || !/^[a-f0-9]{64}$/.test(operation.expectedActiveArtifactId || '')) throw new ActivationUncertainError('Persisted publication intent integrity mismatch');
    const identity = jobIdentity(operation.job);
    if (identity.rebuildId !== rebuildId || identity.rebuildRevision !== revision) throw new Error('Persisted publication identity mismatch');
    const artifact = await readHistoricalArtifact(this.root, operation.artifactId);
    if (fields.some(field => artifact[field] !== identity[field])) throw new Error('Persisted artifact identity mismatch');
    return { ...operation, artifact };
  }

  async receipt(rebuildId, revision) {
    return this.serial(() => this.receiptSerial(rebuildId, revision));
  }

  async receiptSerial(rebuildId, revision) {
    const operation = await this.operation(rebuildId, revision);
    if (!operation) return { status: 'NOT_FOUND' };
    const existing = await readReceipt(this.root, operation.artifactId).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (existing) return this.verifyReceipt(operation.artifact, existing);
    // The activation may have committed before its HTTP reply/receipt was saved.
    const current = await this.activation.current();
    if (current.active) await this.activation.reconcile(current.active);
    const recovered = await readReceipt(this.root, operation.artifactId).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    return recovered ? this.verifyReceipt(operation.artifact, recovered) : { status: 'PENDING' };
  }

  verifyReceipt(artifact, receipt) {
    if (receipt.status !== 'SUCCEEDED' || ['artifactId', 'publicationId', 'siteId', 'siteRevision', 'releaseSequence', 'basePublicationId', 'rendererId', 'catalogDigest', 'rebuildId', 'rebuildRevision', 'manifestDigest'].some(field => receipt[field] !== artifact[field])) throw new ActivationUncertainError('Publication receipt integrity mismatch');
    return receipt;
  }

  publish(input) {
    const job = jobIdentity(input);
    const callback = this.builder.progressReporter?.(job);
    let lastEvent = { stage: 'PREPARING' }; let started = false;
    const report = async event => { lastEvent = event; try { await callback?.(event); } catch { /* Progress is advisory. */ } };
    const waiting = async () => {
      if (this.automaticCode && this.automaticCode.state !== 'READY') await report({ stage: 'PREPARING', waitingReason: this.automaticCode.state });
    };
    void waiting();
    const heartbeat = setInterval(() => { if (started) void report(lastEvent); else void waiting(); }, 5000);
    const operation = this.pending.then(() => { started = true; return this.publishSerial(job, report); }).finally(() => clearInterval(heartbeat));
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async publishSerial(job, report = async () => {}) {
    await report({ stage: 'PREPARING' });
    let operation;
    try { operation = await this.operation(job.rebuildId, job.rebuildRevision); }
    catch (error) { throw new ActivationUncertainError('Persisted publication operation could not be verified', { cause: error }); }
    if (operation && fields.some(field => operation.job[field] !== job[field])) throw new ActivationConflictError('Publication operation identity collision');
    if (operation) {
      let receipt;
      try { receipt = await this.receiptSerial(job.rebuildId, job.rebuildRevision); }
      catch (error) { throw new ActivationUncertainError('Publication receipt could not be verified', { cause: error }); }
      if (receipt.status === 'SUCCEEDED') { await report({ stage: 'CONFIRMING' }); return receipt; }
      try { await this.eligible(operation.artifact, job); }
      catch (error) {
        if ([404, 409].includes(error.httpStatus)) throw new BuildFailedError(error.message, { cause: error });
        throw new ActivationUncertainError('Persisted snapshot eligibility could not be verified', { cause: error });
      }
    } else {
      const state = await this.activation.current();
      if (!state.active) throw new ActivationConflictError('CMS publication requires an initialized serving baseline');
      if (await this.builder.renderer !== state.active.rendererId) {
        if (!this.automaticCode) throw new ActivationUncertainError('CMS publication is waiting for the code release to finish');
        await report({ stage: 'PREPARING', waitingReason: this.automaticCode.state === 'READY' ? undefined : this.automaticCode.state });
        const waiting = setInterval(() => { void report({ stage: 'PREPARING', waitingReason: this.automaticCode.state === 'READY' ? undefined : this.automaticCode.state }); }, 5000);
        try { await this.automaticCode.run({ insideSerial: true }); }
        finally { clearInterval(waiting); }
        // CODE changes the serving artifact; CMS must activate against the new baseline.
        state.active = (await this.activation.current()).active;
        if (!state.active || await this.builder.renderer !== state.active.rendererId) throw new ActivationUncertainError('Code release has not been confirmed');
        await report({ stage: 'PREPARING' });
      }
      let artifact;
      try { artifact = await this.builder.build(job, report); }
      catch (error) { throw new BuildFailedError(error.message, { cause: error }); }
      if (fields.some(field => artifact[field] !== job[field])) throw new Error('Builder returned a foreign artifact');
      const content = { job, artifactId: artifact.artifactId, expectedActiveArtifactId: state.active.artifactId };
      const record = { ...content, operationDigest: digest(content) };
      await writeImmutableJson(join(this.root, 'operations'), operationName(job.rebuildId, job.rebuildRevision), record);
      operation = { ...record, artifact };
    }
    try {
      await report({ stage: 'ACTIVATING' });
      const receipt = await this.activation.activate({ artifactId: operation.artifactId, expectedActiveArtifactId: operation.expectedActiveArtifactId, kind: 'CMS' });
      const confirmed = this.verifyReceipt(operation.artifact, receipt);
      await report({ stage: 'CONFIRMING' });
      return confirmed;
    } catch (error) {
      if (error instanceof ActivationConflictError || error instanceof ActivationRejectedError || error instanceof ActivationUncertainError) throw error;
      throw new ActivationUncertainError('Activation result could not be verified', { cause: error });
    }
  }

  releaseCode(input) {
    const release = codeIdentity(input);
    const operation = this.pending.then(() => this.releaseCodeSerial(release));
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async authorizeCode(release) {
    if (release.instanceId !== this.instanceId || release.rendererId !== await this.builder.renderer) throw new InputError('Code release renderer/instance changed', 409);
    if (!this.verifyCodeRelease) throw new ActivationUncertainError('Code deployment verification is not configured');
    await this.verifyCodeRelease(release);
  }

  async pendingCms(active) {
    const names = await readdir(join(this.root, 'operations')).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const record = JSON.parse(await readFile(join(this.root, 'operations', name), 'utf8'));
      const operation = await this.operation(record.job.rebuildId, record.job.rebuildRevision);
      if (operation.artifact.siteId !== active.siteId || !publicationIsNewer(operation.artifact,active)) continue;
      if ((await this.receiptSerial(record.job.rebuildId, record.job.rebuildRevision)).status === 'SUCCEEDED') continue;
      try { await this.eligible(operation.artifact, operation.job); }
      catch (error) { if ([404, 409].includes(error.httpStatus)) continue; throw error; }
      throw new ActivationUncertainError('Code release is waiting for an unresolved CMS activation');
    }
  }

  async releaseCodeSerial(release) {
    await this.authorizeCode(release);
    const { instanceId: _instanceId, ...identity } = release;
    const name = `${digest(identity)}.json`;
    const directory = join(this.root, 'code-operations');
    let record = await readFile(join(directory, name), 'utf8').then(JSON.parse)
      .catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    let artifact;
    if (record) {
      const { operationDigest, ...content } = record;
      if (digest(content) !== operationDigest || digest(record.release) !== digest(identity)) throw new ActivationUncertainError('Code intent integrity mismatch');
      artifact = await readHistoricalArtifact(this.root, record.artifactId);
      if (artifact.rendererId !== release.rendererId || fields.some(field => artifact[field] !== record.job[field])) throw new ActivationUncertainError('Code artifact identity mismatch');
      const current = await this.activation.current();
      if (current.active) await this.activation.reconcile(current.active);
      const receipt = await readReceipt(this.root, record.artifactId).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
      if (receipt) return this.verifyReceipt(artifact, receipt);
      await this.eligible(artifact, record.job);
    } else {
      const { active } = await this.activation.current();
      if (!active) throw new ActivationConflictError('Code release requires an initialized serving baseline');
      await this.activation.reconcile(active);
      await this.pendingCms(active);
      if (active.rendererId === release.rendererId) return this.activation.reconcile(active);
      const job = { publicationId: active.publicationId, siteId: active.siteId, siteSlug: active.siteSlug,
        rebuildId: `code-${digest(identity)}`, rebuildRevision: 1 };
      artifact = await this.builder.build(job);
      if (fields.some(field => artifact[field] !== job[field]) || artifact.rendererId !== release.rendererId
        || artifact.siteRevision !== active.siteRevision || artifact.catalogDigest !== active.catalogDigest
        || (active.releaseSequence !== undefined && artifact.releaseSequence !== active.releaseSequence)
        || (active.basePublicationId !== undefined && artifact.basePublicationId !== active.basePublicationId)) throw new ActivationConflictError('Code builder changed the serving snapshot');
      const content = { release: identity, job, artifactId: artifact.artifactId, expectedActiveArtifactId: active.artifactId };
      record = { ...content, operationDigest: digest(content) };
      await writeImmutableJson(directory, name, record);
    }
    // A deployment may change while Astro is building. Never activate on the earlier observation alone.
    await this.authorizeCode(release);
    return this.verifyReceipt(artifact, await this.activation.activate({ artifactId: record.artifactId,
      expectedActiveArtifactId: record.expectedActiveArtifactId, kind: 'CODE' }));
  }
}

function requestBody(request) {
  return new Promise((accept, reject) => {
    let size = 0; const chunks = []; let excessive = false;
    const timeout = setTimeout(() => reject(new InputError('Publication body timeout', 408)), 10000);
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 32768) { if (!excessive) reject(new InputError('Publication body is too large', 413)); excessive = true; return; }
      if (!excessive) chunks.push(chunk);
    });
    request.on('end', () => {
      clearTimeout(timeout);
      if (excessive) return;
      try { accept(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new InputError('Invalid publication JSON')); }
    });
    request.on('error', error => { clearTimeout(timeout); reject(error); });
    request.on('aborted', () => { clearTimeout(timeout); reject(new InputError('Publication request aborted')); });
  });
}

export function createPublicationServer({ adminToken, controller, onError = () => {} }) {
  if (typeof adminToken !== 'string' || adminToken.length < 32) throw new Error('Private controller requires a machine token');
  const token = Buffer.from(adminToken);
  const server = createServer(async (request, response) => {
    const send = (status, value) => { if (response.destroyed) return; response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
    try {
      const supplied = Buffer.from(String(request.headers['x-admin-token'] || ''));
      if (supplied.length !== token.length || !timingSafeEqual(supplied, token)) { request.resume(); send(401, { error: 'Unauthorized' }); return; }
      if (request.method === 'GET' && request.url === '/active') { send(200, await controller.active()); return; }
      if (request.method === 'GET' && request.url === '/renderer') { send(200, await controller.rendererIdentity()); return; }
      if (request.method === 'GET' && request.url === '/retention/plan') { send(200, await controller.retentionPlan()); return; }
      if (request.method === 'POST' && request.url === '/retention/archive') { send(200, await controller.acknowledgeArchive(await requestBody(request))); return; }
      if (request.method === 'POST' && ['/retention/collect', '/retention/restore'].includes(request.url)) {
        const body = await requestBody(request);
        if (!body || Object.keys(body).join(',') !== 'artifactId') throw new InputError('Only artifactId is accepted');
        send(200, await controller[request.url.endsWith('/restore') ? 'restoreArtifact' : 'collectArtifact'](body.artifactId)); return;
      }
      if (request.method === 'POST' && request.url === '/release-code') { send(200, await controller.releaseCode(codeIdentity(await requestBody(request)))); return; }
      if (request.method === 'POST' && request.url === '/publish') { send(200, await controller.publish(jobIdentity(await requestBody(request)))); return; }
      const receipt = request.url?.match(/^\/receipts\/([a-zA-Z0-9_-]{1,200})\/([1-9][0-9]{0,14})$/);
      if (request.method === 'GET' && receipt) { send(200, await controller.receipt(receipt[1], Number(receipt[2]))); return; }
      request.resume(); send(404, { error: 'Not found' });
    } catch (error) {
      if (!(error instanceof ActivationUncertainError || error instanceof InputError || error instanceof ActivationConflictError
        || error instanceof ActivationRejectedError || error instanceof BuildFailedError)) {
        try { onError(error); } catch { /* A diagnostic failure must not change the operation result. */ }
      }
      if (error instanceof ActivationUncertainError) send(202, { status: 'UNCERTAIN', error: error.message });
      else if (error instanceof InputError || error instanceof ActivationConflictError || error instanceof ActivationRejectedError || error instanceof BuildFailedError) send(error instanceof InputError ? error.status : error instanceof ActivationConflictError ? 409 : 422, { status: 'FAILED', error: error.message });
      else send(202, { status: 'UNCERTAIN', error: 'Publication outcome could not be verified' });
    }
  });
  server.requestTimeout = 20 * 60 * 1000;
  return server;
}

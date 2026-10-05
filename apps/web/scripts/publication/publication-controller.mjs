import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readArtifact, readReceipt, writeImmutableJson } from './artifact-store.mjs';
import { ActivationConflictError, ActivationUncertainError, ActivationRejectedError } from './caddy-activation.mjs';

class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
class BuildFailedError extends Error {}
const fields = ['publicationId', 'siteId', 'siteSlug', 'rebuildId', 'rebuildRevision'];
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function jobIdentity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) throw new InputError('Unsupported publication request fields');
  for (const field of ['publicationId', 'siteId', 'rebuildId']) if (!validId(input[field])) throw new InputError(`Invalid ${field}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.siteSlug || '') || !Number.isSafeInteger(input.rebuildRevision) || input.rebuildRevision < 1) throw new InputError('Invalid site/rebuild revision');
  return Object.fromEntries(fields.map(field => [field, input[field]]));
}
function operationName(rebuildId, revision) {
  if (!validId(rebuildId) || !Number.isSafeInteger(revision) || revision < 1) throw new InputError('Invalid rebuild identity');
  return `${createHash('sha256').update(JSON.stringify([rebuildId, revision])).digest('hex')}.json`;
}

export class PublicationController {
  constructor({ publicationRoot, builder, activation }) {
    this.root = resolve(publicationRoot); this.builder = builder; this.activation = activation;
    this.pending = Promise.resolve();
  }

  async active() { return (await this.activation.current()).active; }

  async operation(rebuildId, revision) {
    const operation = await readFile(join(this.root, 'operations', operationName(rebuildId, revision)), 'utf8')
      .then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (!operation) return null;
    const { operationDigest, ...content } = operation;
    if (digest(content) !== operationDigest || !/^[a-f0-9]{64}$/.test(operation.expectedActiveArtifactId || '')) throw new ActivationUncertainError('Persisted publication intent integrity mismatch');
    const identity = jobIdentity(operation.job);
    if (identity.rebuildId !== rebuildId || identity.rebuildRevision !== revision) throw new Error('Persisted publication identity mismatch');
    const artifact = await readArtifact(this.root, operation.artifactId);
    if (fields.some(field => artifact[field] !== identity[field])) throw new Error('Persisted artifact identity mismatch');
    return { ...operation, artifact };
  }

  async receipt(rebuildId, revision) {
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
    if (receipt.status !== 'SUCCEEDED' || ['artifactId', 'publicationId', 'siteId', 'siteRevision', 'rendererId', 'catalogDigest', 'rebuildId', 'rebuildRevision', 'manifestDigest'].some(field => receipt[field] !== artifact[field])) throw new ActivationUncertainError('Publication receipt integrity mismatch');
    return receipt;
  }

  publish(input) {
    const job = jobIdentity(input);
    const operation = this.pending.then(() => this.publishSerial(job));
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async publishSerial(job) {
    let operation;
    try { operation = await this.operation(job.rebuildId, job.rebuildRevision); }
    catch (error) { throw new ActivationUncertainError('Persisted publication operation could not be verified', { cause: error }); }
    if (operation && fields.some(field => operation.job[field] !== job[field])) throw new ActivationConflictError('Publication operation identity collision');
    if (operation) {
      let receipt;
      try { receipt = await this.receipt(job.rebuildId, job.rebuildRevision); }
      catch (error) { throw new ActivationUncertainError('Publication receipt could not be verified', { cause: error }); }
      if (receipt.status === 'SUCCEEDED') return receipt;
    } else {
      const state = await this.activation.current();
      if (!state.active) throw new ActivationConflictError('CMS publication requires an initialized serving baseline');
      let artifact;
      try { artifact = await this.builder.build(job); }
      catch (error) { throw new BuildFailedError(error.message, { cause: error }); }
      if (fields.some(field => artifact[field] !== job[field])) throw new Error('Builder returned a foreign artifact');
      const content = { job, artifactId: artifact.artifactId, expectedActiveArtifactId: state.active.artifactId };
      const record = { ...content, operationDigest: digest(content) };
      await writeImmutableJson(join(this.root, 'operations'), operationName(job.rebuildId, job.rebuildRevision), record);
      operation = { ...record, artifact };
    }
    try {
      const receipt = await this.activation.activate({ artifactId: operation.artifactId, expectedActiveArtifactId: operation.expectedActiveArtifactId, kind: 'CMS' });
      return this.verifyReceipt(operation.artifact, receipt);
    } catch (error) {
      if (error instanceof ActivationConflictError || error instanceof ActivationRejectedError || error instanceof ActivationUncertainError) throw error;
      throw new ActivationUncertainError('Activation result could not be verified', { cause: error });
    }
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

export function createPublicationServer({ adminToken, controller }) {
  if (typeof adminToken !== 'string' || adminToken.length < 32) throw new Error('Private controller requires a machine token');
  const token = Buffer.from(adminToken);
  const server = createServer(async (request, response) => {
    const send = (status, value) => { if (response.destroyed) return; response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
    try {
      const supplied = Buffer.from(String(request.headers['x-admin-token'] || ''));
      if (supplied.length !== token.length || !timingSafeEqual(supplied, token)) { request.resume(); send(401, { error: 'Unauthorized' }); return; }
      if (request.method === 'GET' && request.url === '/active') { send(200, await controller.active()); return; }
      if (request.method === 'POST' && request.url === '/publish') { send(200, await controller.publish(jobIdentity(await requestBody(request)))); return; }
      const receipt = request.url?.match(/^\/receipts\/([a-zA-Z0-9_-]{1,200})\/([1-9][0-9]{0,14})$/);
      if (request.method === 'GET' && receipt) { send(200, await controller.receipt(receipt[1], Number(receipt[2]))); return; }
      request.resume(); send(404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof ActivationUncertainError) send(202, { status: 'UNCERTAIN', error: error.message });
      else if (error instanceof InputError || error instanceof ActivationConflictError || error instanceof ActivationRejectedError || error instanceof BuildFailedError) send(error instanceof InputError ? error.status : error instanceof ActivationConflictError ? 409 : 422, { status: 'FAILED', error: error.message });
      else send(202, { status: 'UNCERTAIN', error: 'Publication outcome could not be verified' });
    }
  });
  server.requestTimeout = 20 * 60 * 1000;
  return server;
}

import { readArtifact, readReceipt, recordReceipt } from './artifact-store.mjs';
import { activePublication, createServingConfig } from './serving-config.mjs';

export class ActivationUncertainError extends Error {
  constructor(message, options) { super(message, options); this.name = 'ActivationUncertainError'; }
}
export class ActivationConflictError extends Error {
  constructor(message) { super(message); this.name = 'ActivationConflictError'; }
}
export class ActivationRejectedError extends Error {
  constructor(message) { super(message); this.name = 'ActivationRejectedError'; }
}

export class CaddyActivation {
  constructor({ publicationRoot, adminUrl = 'http://127.0.0.1:2019', fetchImpl = fetch, servingOptions }) {
    this.publicationRoot = publicationRoot;
    this.adminUrl = adminUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.servingOptions = servingOptions;
    this.pending = Promise.resolve();
  }

  async current() {
    try {
      // Reload replaces Caddy's admin HTTP server and asynchronously closes its
      // idle sockets. Never carry a control connection across configurations.
      const response = await this.fetchImpl(`${this.adminUrl}/config/`, { headers: { origin: 'http://127.0.0.1:2019', connection: 'close' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new ActivationUncertainError(`Serving state unavailable (${response.status})`);
      const config = await response.json();
      const etag = response.headers.get('etag');
      if (!etag) throw new ActivationUncertainError('Serving state has no concurrency token');
      return { active: activePublication(config), config, etag };
    } catch (error) {
      if (error instanceof ActivationUncertainError) throw error;
      throw new ActivationUncertainError('Serving state could not be verified', { cause: error });
    }
  }

  async reconcile(active) {
    if (!active) return null;
    const artifact = await readArtifact(this.publicationRoot, active.artifactId);
    for (const field of ['publicationId', 'siteId', 'siteSlug', 'siteRevision', 'rendererId', 'catalogDigest', 'manifestDigest']) {
      if (artifact[field] !== active[field]) throw new ActivationUncertainError('Serving identity does not match its sealed manifest');
    }
    return recordReceipt(this.publicationRoot, artifact);
  }

  activate(input) {
    const operation = this.pending.then(() => this.activateSerial(input));
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async activateSerial({ artifactId, expectedActiveArtifactId, kind = 'CMS' }) {
    const candidate = await readArtifact(this.publicationRoot, artifactId);
    if (!['CMS', 'CODE', 'BOOTSTRAP'].includes(kind)) throw new Error('Invalid activation kind');
    const previousReceipt = await readReceipt(this.publicationRoot, artifactId).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
    if (previousReceipt) {
      if (previousReceipt.status !== 'SUCCEEDED' || ['artifactId', 'publicationId', 'siteId', 'siteRevision', 'rendererId', 'catalogDigest', 'rebuildId', 'rebuildRevision', 'manifestDigest'].some((field) => previousReceipt[field] !== candidate[field])) {
        throw new ActivationUncertainError('Receipt integrity mismatch');
      }
      return previousReceipt;
    }
    const state = await this.current();
    // Preserve evidence of B before C can replace B, including after a controller crash.
    const activeReceipt = await this.reconcile(state.active);
    if (state.active?.artifactId === artifactId) return activeReceipt;
    if ((state.active?.artifactId || null) !== expectedActiveArtifactId) throw new ActivationConflictError('Active artifact changed; refresh the activation precondition');
    if (!state.active && kind !== 'BOOTSTRAP') throw new ActivationConflictError('An explicit bootstrap activation is required');
    if (state.active) {
      if (kind === 'BOOTSTRAP' || candidate.siteId !== state.active.siteId) throw new ActivationConflictError('Activation site does not match serving');
      if (kind === 'CMS' && (candidate.rendererId !== state.active.rendererId || candidate.siteRevision <= state.active.siteRevision)) {
        throw new ActivationConflictError('CMS activation must use the released renderer and a newer publication');
      }
      if (kind === 'CODE' && (candidate.publicationId !== state.active.publicationId || candidate.siteRevision !== state.active.siteRevision || candidate.catalogDigest !== state.active.catalogDigest)) {
        throw new ActivationConflictError('Code release must preserve the active publication snapshot');
      }
    }
    const config = createServingConfig(candidate, this.servingOptions);
    let response;
    try {
      response = await this.fetchImpl(`${this.adminUrl}/config/`, {
        method: 'POST', headers: { origin: 'http://127.0.0.1:2019', connection: 'close', 'content-type': 'application/json', 'if-match': state.etag },
        body: JSON.stringify(config), signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      // A transport failure can occur after Caddy has durably committed the configuration.
      try {
        const observed = await this.current();
        if (observed.active?.artifactId === artifactId) return await this.reconcile(observed.active);
      } catch { /* No failure result is allowed when activation outcome is unknown. */ }
      throw new ActivationUncertainError('Activation reply was lost; reconcile before reporting a result', { cause: error });
    }
    const observed = await this.current();
    if (observed.active?.artifactId === artifactId) return this.reconcile(observed.active);
    if (response.status === 412) throw new ActivationConflictError('Concurrent serving change rejected the stale configuration');
    if (!response.ok && (observed.active?.artifactId || null) === expectedActiveArtifactId) {
      throw new ActivationRejectedError(`Caddy rejected activation (${response.status}); previous configuration is still active`);
    }
    throw new ActivationUncertainError('Serving did not confirm the requested artifact');
  }
}

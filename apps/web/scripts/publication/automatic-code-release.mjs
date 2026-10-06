import { ActivationUncertainError } from './caddy-activation.mjs';

// Technical reconciliation after a deployment; never creates a CMS snapshot or starts a deployment.
export class AutomaticCodeRelease {
  constructor({ controller, verifier, expectedCommit }) {
    this.controller = controller; this.verifier = verifier; this.expectedCommit = expectedCommit;
    this.state = 'WAITING_DEPLOYMENT';
  }
  async run({ insideSerial = false } = {}) {
    const active = await this.controller.active();
    const rendererId = await this.controller.builder.renderer;
    if (active?.rendererId === rendererId) { this.state = 'READY'; return; }
    if (!this.verifier?.latest || !/^[a-f0-9]{40}$/.test(this.expectedCommit || '')) {
      this.state = 'CODE_UNAVAILABLE';
      throw new ActivationUncertainError('Deployed commit identity is unavailable; serving HTML was preserved');
    }
    try {
      this.state = 'WAITING_DEPLOYMENT';
      const identity = await this.verifier.latest(this.expectedCommit);
      if (!active) throw new ActivationUncertainError('Serving baseline is unavailable');
      await this.controller.eligible(active, { ...active, rebuildId: 'code-preflight', rebuildRevision: 1 });
      this.state = 'CODE_BUILDING';
      const release = { ...identity, rendererId, instanceId: this.controller.instanceId };
      await this.controller[insideSerial ? 'releaseCodeSerial' : 'releaseCode'](release);
      this.state = 'READY';
    } catch (error) {
      if (this.state === 'CODE_BUILDING') this.state = 'CODE_UNAVAILABLE';
      throw new ActivationUncertainError('Automatic code release is awaiting confirmation', { cause: error });
    }
  }
  start() {
    let stopped = false, timer;
    const reconcile = async () => {
      try { await this.run(); } catch { /* Provider/activation uncertainty is retried with the same durable identity. */ }
      if (!stopped && this.state !== 'READY') timer = setTimeout(reconcile, 10_000);
    };
    void reconcile();
    return () => { stopped = true; clearTimeout(timer); };
  }
}

import type { prepareWorkingPreviewCatalog } from './working-preview-model';

type PreviewCatalog = ReturnType<typeof prepareWorkingPreviewCatalog>;

const RETENTION_MS = 60_000;
const MAX_CATALOG_BYTES = 32 * 1024 * 1024;

export type WorkingPreviewLease = {
  key: string;
  promise: Promise<PreviewCatalog>;
  resolve: (catalog: PreviewCatalog) => void;
  reject: (error: unknown) => void;
};

export class WorkingPreviewReuse {
  private ready?: { key: string; catalog: PreviewCatalog; expiresAt: number };
  private inFlight?: WorkingPreviewLease;

  reserve(key: string) {
    if (this.ready && this.ready.expiresAt <= Date.now()) this.ready = undefined;
    if (this.ready?.key === key) return { state: 'ready' as const, catalog: this.ready.catalog };
    if (this.inFlight?.key === key) return { state: 'waiting' as const, result: this.inFlight.promise };
    if (this.inFlight) return { state: 'uncached' as const };

    let resolve!: WorkingPreviewLease['resolve'];
    let reject!: WorkingPreviewLease['reject'];
    const promise = new Promise<PreviewCatalog>((accept, fail) => { resolve = accept; reject = fail; });
    const entry = { key, promise, resolve, reject };
    // The owner may fail before any other request joins the preparation.
    void entry.promise.catch(() => undefined);
    this.inFlight = entry;
    return { state: 'owner' as const, entry };
  }

  finish(entry: WorkingPreviewLease, catalog: PreviewCatalog) {
    if (Buffer.byteLength(JSON.stringify(catalog)) <= MAX_CATALOG_BYTES) {
      this.ready = { key: entry.key, catalog, expiresAt: Date.now() + RETENTION_MS };
    }
    this.inFlight = undefined;
    entry.resolve(catalog);
  }

  abort(entry: WorkingPreviewLease, error: unknown) {
    this.inFlight = undefined;
    entry.reject(error);
  }
}

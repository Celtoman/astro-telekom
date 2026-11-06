import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';

type Receipt = Record<string, unknown>;
const receiptFields = ['artifactId', 'publicationId', 'siteId', 'siteRevision', 'releaseSequence', 'basePublicationId', 'rendererId', 'catalogDigest', 'rebuildId', 'rebuildRevision', 'manifestDigest'];

export async function confirmStaticReceipt(rebuildId: string, revision: number, submitted: Receipt): Promise<Receipt> {
  try {
    const base = new URL(process.env.STATIC_PUBLICATION_URL || '');
    const token = process.env.ADMIN_API_TOKEN;
    if (!token || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Private controller is not configured');
    const response = await fetch(`${base.href.replace(/\/$/, '')}/receipts/${encodeURIComponent(rebuildId)}/${revision}`, {
      headers: { 'x-admin-token': token }, signal: AbortSignal.timeout(30000),
    });
    if (response.status !== 200) throw new Error('Private receipt is unavailable');
    const receipt = await response.json() as Receipt;
    if (receipt.status !== 'SUCCEEDED' || receipt.rebuildId !== rebuildId || receipt.rebuildRevision !== revision
      || receiptFields.some(field => receipt[field] !== submitted[field])
      || ['artifactId', 'rendererId', 'catalogDigest', 'manifestDigest'].some(field => typeof receipt[field] !== 'string' || !/^[a-f0-9]{64}$/.test(receipt[field] as string))) {
      throw new Error('Private receipt identity mismatch');
    }
    return receipt;
  } catch {
    throw new ServiceUnavailableException('Static publication receipt could not be independently confirmed');
  }
}

export function assertReceiptSnapshot(receipt: Receipt, rebuild: { id: string; siteId: string | null; processingRevision: number; processingPublicationId: string | null }, publication: { id: string; siteId: string; siteRevision: number; releaseSequence?:number; basePublicationId?:string|null; scopeKey?:string; status: string; catalog: unknown } | null) {
  if (!publication || !['PENDING', 'RUNNING', 'SUCCEEDED'].includes(publication.status)
    || receipt.publicationId !== publication.id || receipt.siteId !== publication.siteId || receipt.siteRevision !== publication.siteRevision
    || (receipt.releaseSequence !== undefined && receipt.releaseSequence !== publication.releaseSequence)
    || (publication.scopeKey && publication.scopeKey !== 'legacy' && (receipt.releaseSequence !== publication.releaseSequence || receipt.basePublicationId !== publication.basePublicationId))
    || rebuild.processingPublicationId !== publication.id || rebuild.siteId !== publication.siteId
    || receipt.rebuildId !== rebuild.id || receipt.rebuildRevision !== rebuild.processingRevision
    || receipt.catalogDigest !== createHash('sha256').update(JSON.stringify(publication.catalog)).digest('hex')) {
    throw new ConflictException('Static publication receipt does not match the SQL snapshot identity');
  }
}

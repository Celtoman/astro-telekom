import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function editorialDigest(value: unknown): string { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }

/** Publication and pending references override the draft checkpoint retention window. */
export function retainedEditorialRevisions<T extends { id: string; revision: number; checkpoint: boolean; publishedAt: unknown }>(rows: T[], workingRevision: number, protectedIds: ReadonlySet<string> = new Set()): T[] {
  const checkpoints = [...rows].filter(row => row.checkpoint && !row.publishedAt).sort((a, b) => b.revision - a.revision).slice(0, 20);
  const keep = new Set(checkpoints.map(row => row.id));
  return rows.filter(row => !!row.publishedAt || row.revision === workingRevision || protectedIds.has(row.id) || keep.has(row.id));
}

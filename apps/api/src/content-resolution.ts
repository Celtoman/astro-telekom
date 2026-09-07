type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

/** Shallow field-level inheritance for CMS JSON fields. Deeper levels win. */
export function mergeContent(...values: unknown[]): JsonRecord {
  return Object.assign({}, ...values.map(asRecord));
}

/** Only the explicitly public CMS namespace participates in inheritance. */
export function publicContent(settings: unknown): JsonRecord {
  return asRecord(asRecord(settings).content);
}

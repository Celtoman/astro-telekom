type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function assignOwn(target: JsonRecord, key: string, value: unknown) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (!value || typeof value !== 'object') return value;
  return mergeContent(value);
}

/**
 * Resolves CMS JSON inheritance from broad to specific layers.
 * Objects merge recursively; arrays, scalar values and null replace the parent value.
 */
export function mergeContent(...values: unknown[]): JsonRecord {
  const result: JsonRecord = {};
  for (const value of values) {
    const layer = asRecord(value);
    for (const key of Object.keys(layer)) {
      const inherited = result[key];
      const override = layer[key];
      assignOwn(
        result,
        key,
        inherited && typeof inherited === 'object' && !Array.isArray(inherited)
          && override && typeof override === 'object' && !Array.isArray(override)
          ? mergeContent(inherited, override)
          : cloneJsonValue(override),
      );
    }
  }
  return result;
}

/** Only the explicitly public CMS namespace participates in inheritance. */
export function publicContent(settings: unknown): JsonRecord {
  return asRecord(asRecord(settings).content);
}

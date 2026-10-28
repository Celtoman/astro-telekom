/** Server-captured names from the serving catalog, independent of mutable relations. */
export interface CallbackInterest { version: 1; tariffName: string; cityName: string }
export function readCallbackInterest(attribution: unknown): CallbackInterest | null {
  if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) return null;
  const value = (attribution as Record<string, unknown>).callbackInterest;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return item.version === 1 && typeof item.tariffName === 'string' && item.tariffName.trim() && typeof item.cityName === 'string' && item.cityName.trim()
    ? { version: 1, tariffName: item.tariffName, cityName: item.cityName } : null;
}

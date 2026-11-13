/** Optional contact added without changing old snapshots or unrelated site settings. */
export function readCorporatePhone(settings: unknown): string | null {
  const value = (settings as { contactPhones?: { corporatePhone?: unknown } } | null)?.contactPhones?.corporatePhone;
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^7\d{10}$/.test(value)) throw new Error('Некорректный телефон корпоративной поддержки');
  return value;
}
export function withCorporatePhone(settings: unknown, phone: string | null): Record<string, unknown> {
  const current = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  const contacts = current.contactPhones && typeof current.contactPhones === 'object' && !Array.isArray(current.contactPhones) ? current.contactPhones as Record<string, unknown> : {};
  return { ...structuredClone(current), contactPhones: { ...structuredClone(contacts), corporatePhone: phone } };
}

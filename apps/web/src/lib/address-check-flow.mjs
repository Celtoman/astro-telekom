export const ADDRESS_CHECK_BUSINESS_OUTCOMES = [
  'TARGET_AVAILABLE',
  'ALTERNATIVES_AVAILABLE',
  'NO_PROVIDERS',
];

const outcomeSet = new Set(ADDRESS_CHECK_BUSINESS_OUTCOMES);
const technicalCodes = new Set([
  'ADDRESS_CHECK_FAILED',
  'ADDRESS_CHECK_INCONCLUSIVE',
  'ADDRESS_CHECK_UNAVAILABLE',
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeHttpUrl(value) {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function normalizeRussianPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) return `7${digits}`;
  return null;
}

export function formatRussianPhone(value) {
  const raw = String(value ?? '');
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && !digits.startsWith('7') && !digits.startsWith('8')) {
    return `+${digits.slice(0, 11)}`;
  }
  if ((digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8')))
    || /^\s*\+7/.test(raw)
    || (digits.length === 1 && (digits === '7' || digits === '8'))) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (!digits) return '+7 ';
  const area = digits.slice(0, 3);
  const first = digits.slice(3, 6);
  const second = digits.slice(6, 8);
  const third = digits.slice(8, 10);
  let formatted = `+7 (${area}`;
  if (area.length === 3) formatted += ')';
  if (first) formatted += ` ${first}`;
  if (second) formatted += `-${second}`;
  if (third) formatted += `-${third}`;
  return formatted;
}

export function createSubmissionKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hasHouseNumber(suggestion) {
  const data = suggestion?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const house = data.house;
  return (typeof house === 'string' && Boolean(house.trim()))
    || (typeof house === 'number' && Number.isFinite(house));
}

export function createLatestRequestGate() {
  let version = 0;
  return {
    next() {
      version += 1;
      return version;
    },
    invalidate() {
      version += 1;
    },
    isCurrent(candidate) {
      return candidate === version;
    },
  };
}

export function readAddressCheckResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const checkId = nonEmptyString(value.checkId);
  const address = nonEmptyString(value.address);
  const citySlug = nonEmptyString(value.citySlug);
  if (!checkId || !address || !citySlug) return null;

  if (value.type === 'technical_error') {
    const code = nonEmptyString(value.code);
    const message = nonEmptyString(value.message);
    if (value.retryable !== true || !code || !technicalCodes.has(code) || !message) return null;
    return { type: 'technical_error', retryable: true, code, message, checkId, address, citySlug };
  }

  const outcome = nonEmptyString(value.outcome);
  if (value.type !== 'business' || !outcome || !outcomeSet.has(outcome)) return null;
  if (outcome === 'ALTERNATIVES_AVAILABLE') {
    if (!Array.isArray(value.providers) || value.providers.length === 0) return null;
    const providers = value.providers.map((provider) => {
      if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return null;
      const id = nonEmptyString(provider.id);
      const name = nonEmptyString(provider.name);
      return id && name ? { id, name } : null;
    });
    const actionUrl = safeHttpUrl(value.actionUrl);
    if (providers.some((provider) => provider === null) || !actionUrl) return null;
    return { type: 'business', outcome, checkId, address, citySlug, providers, actionUrl };
  }
  return { type: 'business', outcome, checkId, address, citySlug };
}

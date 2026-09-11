export const SUBSCRIBER_MODE_STORAGE_KEY = 'provider_subscriber_mode_expires_at';
export const SUBSCRIBER_MODE_EVENT = 'domru:subscriber-mode';
export const SUBSCRIBER_MODE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function subscriberModeExpiresAt(now = Date.now()) {
  return now + SUBSCRIBER_MODE_DURATION_MS;
}

export function isSubscriberModeActive(value, now = Date.now()) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;
  const expiresAt = Number(value);
  return Number.isSafeInteger(expiresAt) && expiresAt > now;
}

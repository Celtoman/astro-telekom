import { createHash } from 'node:crypto';

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

export function normalizeAddress(value: string | null | undefined) {
  return (value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function detectDeviceType(userAgent: string | null | undefined) {
  const ua = (userAgent || '').toLocaleLowerCase();
  if (/ipad|tablet|kindle|playbook/.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

export function makeDeliveryKey(seed: string) {
  return createHash('sha256').update(seed).digest('hex');
}

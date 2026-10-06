import { ValidationPipe } from '@nestjs/common';
import { normalizeIP } from '@fastify/rate-limit';

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function rateLimitWindow() {
  return positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
}

export function rateLimitBucketForPath(url: string) {
  // Fastify accepts absolute-form request targets and keeps that form in request.url.
  // Extract the raw path, without URL's dot-segment/percent normalization, so the
  // limiter classifies the same path as the router and shares counters across hosts.
  const absolute = /^https?:\/\/[^/?#]+(\/[^?#]*)?(?:\?[^#]*)?$/i.exec(url);
  const path = absolute ? absolute[1] || '/' : url.split('?')[0];
  if (path === '/api/v1/auth/login') return 'login';
  if (path === '/api/v1/address-suggestions') return 'address-suggestions';
  if (path === '/api/v1/address-checks') return 'address-checks';
  if (path === '/api/v1/leads') return 'leads';
  if (path.startsWith('/api/v1/lead-access/')) return 'lead-access';
  return 'default';
}

export function rateLimitForPath(url: string) {
  const bucket = rateLimitBucketForPath(url);
  if (bucket === 'login') return positiveInteger(process.env.RATE_LIMIT_LOGIN_MAX, 5);
  if (bucket === 'address-suggestions') return positiveInteger(process.env.RATE_LIMIT_SUGGESTIONS_MAX, 60);
  if (bucket === 'leads' || bucket === 'address-checks' || bucket === 'lead-access') {
    return positiveInteger(process.env.RATE_LIMIT_PUBLIC_WRITE_MAX, 10);
  }
  return positiveInteger(process.env.RATE_LIMIT_DEFAULT_MAX, 300);
}

export function rateLimitKeyForRequest(url: string, ip: string) {
  return `${normalizeIP(ip)}:${rateLimitBucketForPath(url)}`;
}

export function createGlobalValidationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
}

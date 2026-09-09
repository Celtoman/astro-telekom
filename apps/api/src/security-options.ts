import { ValidationPipe } from '@nestjs/common';

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function rateLimitWindow() {
  return positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
}

export function rateLimitForPath(url: string) {
  const path = url.split('?')[0];
  if (path === '/api/v1/auth/login') return positiveInteger(process.env.RATE_LIMIT_LOGIN_MAX, 5);
  if (path === '/api/v1/leads' || path === '/api/v1/address-checks' || path.startsWith('/api/v1/lead-access/')) {
    return positiveInteger(process.env.RATE_LIMIT_PUBLIC_WRITE_MAX, 10);
  }
  return positiveInteger(process.env.RATE_LIMIT_DEFAULT_MAX, 300);
}

export function createGlobalValidationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
}

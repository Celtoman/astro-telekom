import { BadRequestException } from '@nestjs/common';

const SITE_PHONE_PATTERN = /^7\d{10}$/;

export function normalizeSitePhone(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Введите российский номер из 10 цифр');
  }
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 10
    ? `7${digits}`
    : digits.length === 11 && digits.startsWith('8')
      ? `7${digits.slice(1)}`
      : digits;
  if (!SITE_PHONE_PATTERN.test(normalized)) {
    throw new BadRequestException('Введите российский номер из 10 цифр');
  }
  return normalized;
}

export function formatSitePhone(value: string): string {
  const normalized = normalizeSitePhone(value);
  return `+7 (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
}

export function sitePhoneReadinessErrors(site: { connectionPhone?: string | null; supportPhone?: string | null }): string[] {
  const errors: string[] = [];
  if (!site.connectionPhone || !SITE_PHONE_PATTERN.test(site.connectionPhone)) errors.push('телефон подключения');
  if (!site.supportPhone || !SITE_PHONE_PATTERN.test(site.supportPhone)) errors.push('телефон техподдержки');
  return errors;
}

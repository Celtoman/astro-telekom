import { BadRequestException } from '@nestjs/common';

export const ADMIN_ROUTE_PAGE_SIZE = 50;

export function readAdminWorkingRevision(value: string | undefined): number {
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value) || Number(value) > 2_147_483_647) {
    throw new BadRequestException('Передайте актуальную рабочую ревизию сайта');
  }
  return Number(value);
}

export function readAdminRoutePage(value?: string): number {
  if (value === undefined) return 1;
  const page = Number(value);
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(page * ADMIN_ROUTE_PAGE_SIZE)) {
    throw new BadRequestException('Укажите корректную страницу списка URL');
  }
  return page;
}

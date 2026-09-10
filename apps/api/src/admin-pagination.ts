import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export class CursorPageQueryDto {
  @IsOptional()
  @Transform(({ value }) => Math.min(Number(value), MAX_PAGE_SIZE))
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export function pageSize(value?: number) {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Math.min(Number(value), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
}

export function searchQuery(value?: string) {
  const query = value?.trim();
  return query ? query.slice(0, 200) : undefined;
}

export function encodeCursor(sortValue: Date, id: string) {
  return Buffer.from(JSON.stringify([sortValue.toISOString(), id])).toString('base64url');
}

export function decodeCursor(value?: string) {
  if (!value) return undefined;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== 'string' || typeof decoded[1] !== 'string') {
      throw new Error('invalid cursor shape');
    }
    const sortValue = new Date(decoded[0]);
    if (Number.isNaN(sortValue.getTime()) || !decoded[1] || decoded[1].length > 200) {
      throw new Error('invalid cursor values');
    }
    return { sortValue, id: decoded[1] };
  } catch {
    throw new BadRequestException('Некорректный cursor пагинации');
  }
}

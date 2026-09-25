import { IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { CursorPageQueryDto } from './admin-pagination';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const serviceTypes = ['INTERNET', 'INTERNET_TV', 'TV', 'OTHER'] as const;

export class TariffListQueryDto extends CursorPageQueryDto {
  @IsOptional() @IsString() cityId?: string;
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsIn(serviceTypes) serviceType?: typeof serviceTypes[number];
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsIn(['WITH', 'WITHOUT']) promotion?: 'WITH' | 'WITHOUT';
  @IsOptional() @IsIn(['ABSENT_FROM_IMPORT', 'MANUAL', 'NONE']) archiveReason?: 'ABSENT_FROM_IMPORT' | 'MANUAL' | 'NONE';
  @IsOptional() @IsIn(['true', 'false']) unpublished?: 'true' | 'false';
}

export class CreateTariffDto {
  @IsString() @MinLength(1) @MaxLength(200) cityId!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsString() @MaxLength(200)
  @Matches(slugPattern, { message: 'slug должен содержать только строчные латинские буквы, цифры и дефисы' })
  slug!: string;

  @IsIn(serviceTypes)
  serviceType!: typeof serviceTypes[number];

  @IsInt() @Min(1)
  standardPrice!: number;

  @IsOptional() @IsInt() @Min(1)
  promoPrice?: number | null;

  @IsInt() @Min(1)
  speed!: number;

  @IsOptional() @IsString() @MaxLength(5_000)
  promoText?: string | null;

  @IsOptional() @IsInt() @Min(0)
  connectionFee?: number | null;

  @IsOptional() @IsObject()
  attributes?: Record<string, unknown> | null;

  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';

  @IsOptional() @IsBoolean()
  confirmSensitiveChanges?: boolean;
}

export class UpdateTariffDto {
  @IsISO8601()
  expectedUpdatedAt!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  cityId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  @Matches(slugPattern, { message: 'slug должен содержать только строчные латинские буквы, цифры и дефисы' })
  slug?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(serviceTypes)
  serviceType?: 'INTERNET' | 'INTERNET_TV' | 'TV' | 'OTHER';

  @IsOptional()
  @IsInt()
  @Min(1)
  standardPrice?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  promoPrice?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  speed?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  promoText?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  connectionFee?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['ACTIVE', 'ARCHIVED'])
  availability?: 'ACTIVE' | 'ARCHIVED';

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown> | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsBoolean()
  confirmSensitiveChanges?: boolean;
}

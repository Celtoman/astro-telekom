import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

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
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug должен содержать только строчные латинские буквы, цифры и дефисы' })
  slug?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['INTERNET', 'INTERNET_TV', 'TV', 'OTHER'])
  serviceType?: 'INTERNET' | 'INTERNET_TV' | 'TV' | 'OTHER';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  standardPrice?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
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
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  connectionFee?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  availability?: boolean;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  seo?: Record<string, unknown> | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsBoolean()
  confirmSensitiveChanges?: boolean;
}

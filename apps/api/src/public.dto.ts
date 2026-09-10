import {
  ArrayMaxSize,
  Allow,
  IsArray,
  IsEmail,
  IsEmpty,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class DadataSuggestionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  value!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1_000)
  unrestricted_value!: string;

  @IsObject()
  data!: Record<string, unknown>;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;
}

export class AddressCheckDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DadataSuggestionDto)
  suggestion?: DadataSuggestionDto;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  citySlug?: string;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  siteSlug?: string;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  pageSlug?: string;

  @IsOptional()
  @IsIn(['apartment', 'house'])
  objectType?: string;

  @IsEmpty({ message: 'Некорректный запрос' })
  website?: string;
}

export class AddressSuggestionsDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  query!: string;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  citySlug?: string;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  siteSlug?: string;

  @IsEmpty({ message: 'Некорректный запрос' })
  website?: string;
}

export class CreateLeadDto {
  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  siteSlug?: string;

  @IsString()
  @Matches(slug)
  @MaxLength(120)
  citySlug!: string;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  pageSlug?: string;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  tariffSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsIn(['apartment', 'house'])
  objectType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressCheckId?: string;

  @IsOptional()
  @IsIn(['INTERNET', 'INTERNET_TV', 'TV', 'OTHER'])
  serviceType?: 'INTERNET' | 'INTERNET_TV' | 'TV' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsObject()
  utm?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  formName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(604_800)
  timeOnSiteSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceType?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2_048, { each: true })
  viewedPages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  activity?: Array<{ type: string; data?: Record<string, unknown> }>;

  @IsEmpty({ message: 'Некорректный запрос' })
  website?: string;
}

export class ConsumeLeadAccessDto {
  @Allow()
  token?: unknown;
}

import {
  ArrayMaxSize,
  Allow,
  Equals,
  IsArray,
  IsEmail,
  IsEmpty,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LEAD_CONSENT_VERSION } from './lead-consent';
import { LEAD_REASON_CODES } from './lead-reasons';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const telemetryKey = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;

@ValidatorConstraint({ name: 'maxJsonBytes', async: false })
class MaxJsonBytesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (value === undefined || value === null) return true;
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8') <= Number(args.constraints[0]);
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} превышает допустимый размер`;
  }
}

@ValidatorConstraint({ name: 'boundedTelemetryData', async: false })
class BoundedTelemetryDataConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value === undefined || value === null) return true;
    if (!this.isPlainObject(value)) return false;
    try {
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 4_096) return false;
    } catch {
      return false;
    }

    let keyCount = 0;
    const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
    while (pending.length) {
      const current = pending.pop()!;
      if (typeof current.value === 'string') {
        if (current.value.length > 500) return false;
        continue;
      }
      if (typeof current.value === 'number') {
        if (!Number.isFinite(current.value)) return false;
        continue;
      }
      if (current.value === null || typeof current.value === 'boolean') continue;
      if (Array.isArray(current.value)) {
        if (current.depth > 1 || current.value.length > 20) return false;
        for (const item of current.value) pending.push({ value: item, depth: current.depth + 1 });
        continue;
      }
      if (!this.isPlainObject(current.value) || current.depth > 1) return false;
      const entries = Object.entries(current.value);
      keyCount += entries.length;
      if (keyCount > 20) return false;
      for (const [key, entry] of entries) {
        if (!telemetryKey.test(key)) return false;
        pending.push({ value: entry, depth: current.depth + 1 });
      }
    }
    return true;
  }

  defaultMessage() {
    return 'Данные события имеют недопустимую структуру или размер';
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
}

export class LeadUtmDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_term?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_source_platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_creative_format?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_marketing_tactic?: string;
}

export class LeadTouchDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2_048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  referrer?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadUtmDto)
  utm?: LeadUtmDto;
}

export class LeadSessionDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => LeadTouchDto)
  firstTouch!: LeadTouchDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => LeadTouchDto)
  lastTouch!: LeadTouchDto;

  @IsISO8601()
  startedAt!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2_048, { each: true })
  viewedPages!: string[];
}

export class LeadActivityEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  type!: string;

  @IsOptional()
  @IsObject()
  @Validate(BoundedTelemetryDataConstraint)
  data?: Record<string, unknown>;
}

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

  @IsDefined()
  @ValidateNested()
  @Type(() => DadataSuggestionDto)
  suggestion!: DadataSuggestionDto;

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

export class LeadTariffSelectionDto {
  @IsOptional()
  @IsIn(['NONE', 'INSTALLMENT', 'BUYOUT'])
  router?: 'NONE' | 'INSTALLMENT' | 'BUYOUT';

  @IsOptional()
  @IsIn(['NONE', 'INSTALLMENT', 'BUYOUT'])
  tvbox?: 'NONE' | 'INSTALLMENT' | 'BUYOUT';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(slug, { each: true })
  services?: string[];
}

export class LeadConfigurationDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => LeadTariffSelectionDto)
  selection!: LeadTariffSelectionDto;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  fingerprint!: string;
}

export class LeadDecisionStatusDto {
  @IsUUID()
  submissionKey!: string;
}

export class CreateLeadDto {
  @IsOptional()
  @Equals(true)
  consentAccepted?: true;
  @IsOptional()
  @ValidateNested()
  @Type(() => LeadSessionDto)
  @Validate(MaxJsonBytesConstraint, [20_480])
  session?: LeadSessionDto;
  @IsOptional()
  @IsIn([...LEAD_REASON_CODES])
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  siteSlug?: string;

  @ValidateIf((body, value) => body.reasonCode !== 'callback_consultation' || value !== undefined)
  @IsString()
  @Matches(slug)
  @MaxLength(120)
  citySlug?: string;

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
  @ValidateNested()
  @Type(() => LeadConfigurationDto)
  @Validate(MaxJsonBytesConstraint, [4_096])
  configuration?: LeadConfigurationDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsUUID()
  submissionKey!: string;

  @IsString()
  @Equals(LEAD_CONSENT_VERSION)
  consentVersion!: string;

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
  @ValidateNested()
  @Type(() => LeadUtmDto)
  utm?: LeadUtmDto;

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
  @Validate(MaxJsonBytesConstraint, [16_384])
  viewedPages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LeadActivityEventDto)
  @Validate(MaxJsonBytesConstraint, [65_536])
  activity?: LeadActivityEventDto[];

  @IsEmpty({ message: 'Некорректный запрос' })
  website?: string;
}

export class ConsumeLeadAccessDto {
  @Allow()
  token?: unknown;
}

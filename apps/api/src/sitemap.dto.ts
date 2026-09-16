import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class SitemapExclusionDto {
  @IsString()
  @MaxLength(2048)
  path!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ReplaceSitemapExclusionsDto {
  @IsInt()
  @Min(0)
  expectedWorkingRevision!: number;

  @IsArray()
  @ArrayMaxSize(50_000)
  @ValidateNested({ each: true })
  @Type(() => SitemapExclusionDto)
  exclusions!: SitemapExclusionDto[];
}

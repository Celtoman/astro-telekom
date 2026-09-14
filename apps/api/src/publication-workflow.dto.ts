import { IsDateString, IsInt, Min } from 'class-validator';

export class CreateSitePublicationDto {
  @IsInt()
  @Min(1)
  expectedWorkingRevision!: number;
}

export class ScheduleSitePublicationDto extends CreateSitePublicationDto {
  @IsDateString({ strict: true })
  scheduledFor!: string;
}

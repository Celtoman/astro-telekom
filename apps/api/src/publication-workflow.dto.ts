import { IsInt, Min } from 'class-validator';

export class CreateSitePublicationDto {
  @IsInt()
  @Min(1)
  expectedWorkingRevision!: number;
}

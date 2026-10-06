import { Matches } from 'class-validator';

export class CodeReleaseDto {
  @Matches(/^[a-zA-Z0-9_-]{1,200}$/)
  deploymentId!: string;

  @Matches(/^[a-f0-9]{40}$/)
  expectedCommit!: string;
}

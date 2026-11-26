import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AdminTokenGuard, MachineOnly } from './admin-token.guard';
import { CodeReleaseDto } from './code-release.dto';
import { CodeReleaseService } from './code-release.service';

@Controller('internal/site-publications')
@UseGuards(AdminTokenGuard)
@MachineOnly()
export class CodeReleaseController {
  constructor(private readonly releases: CodeReleaseService) {}

  @Post(':siteSlug/release-code')
  async release(@Param('siteSlug') siteSlug: string, @Body() input: CodeReleaseDto,
    @Res({ passthrough: true }) response: { status(code: number): unknown }) {
    const result = await this.releases.release(siteSlug, input);
    response.status(result.status);
    return result.result;
  }
}

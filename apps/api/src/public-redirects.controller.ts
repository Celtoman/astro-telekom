import { Controller, Get, Param, Redirect } from '@nestjs/common';
import { RedirectService } from './redirect.service';

@Controller('public/sites/:siteSlug/redirects')
export class PublicRedirectsController {
  constructor(private readonly redirects: RedirectService) {}

  @Get(':id')
  @Redirect(undefined, 301)
  async resolve(@Param('siteSlug') siteSlug: string, @Param('id') id: string) {
    return { url: await this.redirects.resolvePublished(siteSlug, id), statusCode: 301 };
  }
}

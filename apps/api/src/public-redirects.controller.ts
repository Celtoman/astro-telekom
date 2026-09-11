import { Controller, Get, Param, Redirect, Req } from '@nestjs/common';
import { RedirectService } from './redirect.service';

@Controller('public/sites/:siteSlug/redirects')
export class PublicRedirectsController {
  constructor(private readonly redirects: RedirectService) {}

  @Get(':id')
  @Redirect(undefined, 301)
  async resolve(
    @Param('siteSlug') siteSlug: string,
    @Param('id') id: string,
    @Req() request: { url?: string },
  ) {
    const requestUrl = request.url || '';
    const queryIndex = requestUrl.indexOf('?');
    const query = queryIndex >= 0 ? requestUrl.slice(queryIndex) : '';
    return { url: `${await this.redirects.resolvePublished(siteSlug, id)}${query}`, statusCode: 301 };
  }
}

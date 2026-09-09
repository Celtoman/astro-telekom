import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PublishStatus } from '../generated';
import { AdminTokenGuard } from './admin-token.guard';
import { RedirectService } from './redirect.service';

type RedirectBody = {
  siteId: string;
  cityId?: string | null;
  sourcePath: string;
  targetPath: string;
  status?: PublishStatus;
};

@Controller('admin/redirects')
@UseGuards(AdminTokenGuard)
export class AdminRedirectsController {
  constructor(private readonly redirects: RedirectService) {}

  @Get()
  list(@Query('siteId') siteId?: string) {
    return this.redirects.list(siteId);
  }

  @Post()
  create(@Body() body: RedirectBody) {
    return this.redirects.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<Omit<RedirectBody, 'siteId'>>) {
    return this.redirects.update(id, body);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.redirects.archive(id);
  }
}

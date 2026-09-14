import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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

interface AdminRequest {
  user?: { id: string };
}

@Controller('admin/redirects')
@UseGuards(AdminTokenGuard)
export class AdminRedirectsController {
  constructor(private readonly redirects: RedirectService) {}

  @Get()
  list(@Query('siteId') siteId?: string) {
    return this.redirects.list(siteId);
  }

  @Post()
  create(@Body() body: RedirectBody, @Req() request?: AdminRequest) {
    return this.redirects.create(body, request?.user?.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<Omit<RedirectBody, 'siteId'>>, @Req() request?: AdminRequest) {
    return this.redirects.update(id, body, request?.user?.id);
  }

  @Delete(':id')
  archive(@Param('id') id: string, @Req() request?: AdminRequest) {
    return this.redirects.archive(id, request?.user?.id);
  }
}

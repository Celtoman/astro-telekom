import {Body,Controller,Param,Post,Req,UseGuards} from '@nestjs/common';
import {AdminTokenGuard} from './admin-token.guard';
import {editorialBody,type EditorialRequest} from './admin-news.controller';
import {NewsImportService} from './news-import.service';
@Controller('admin/sites/:siteId/news/imports')
@UseGuards(AdminTokenGuard)
export class AdminNewsImportController {
  constructor(private readonly imports:NewsImportService){}
  @Post('wordpress')
  wordpress(@Param('siteId') siteId:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['sourceId','sourceHash','sourceUrl','category','content']);return this.imports.wordpress(siteId,body as Parameters<NewsImportService['wordpress']>[1],request.user?.id)}
}

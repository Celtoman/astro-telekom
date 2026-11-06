import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { EditorialStoreService } from './editorial-store.service';
import { EditorialPublicationService } from './editorial-publication.service';
import { editorialBody, type EditorialRequest } from './admin-news.controller';
@Controller('admin/sites/:siteId/news/categories')
@UseGuards(AdminTokenGuard)
export class AdminNewsCategoriesController {
  constructor(private readonly store:EditorialStoreService,private readonly publications:EditorialPublicationService){}
  @Get()
  list(@Param('siteId') siteId:string){return this.publications.categories(siteId)}
  @Post()
  create(@Param('siteId') siteId:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['clientId','content']);return this.store.create(siteId,'CATEGORY',body.clientId,body.content,request.user?.id)}
  @Get(':id')
  get(@Param('siteId') siteId:string,@Param('id') id:string){return this.publications.workspace(siteId,'CATEGORY',id)}
  @Patch(':id')
  save(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['content','expectedRevision','checkpoint']);return this.store.save(siteId,'CATEGORY',id,body.expectedRevision,body.content,request.user?.id,body.checkpoint===true)}
  @Post(':id/review')
  review(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown){const body=editorialBody(raw,['expectedRevision']);return this.publications.review(siteId,{kind:'CATEGORY',entityId:id,expectedRevision:body.expectedRevision,action:'PUBLISH'})}
  @Post(':id/publish')
  publish(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['expectedRevision','reviewDigest','operationId']);return this.publications.publish(siteId,{kind:'CATEGORY',entityId:id,expectedRevision:body.expectedRevision,action:'PUBLISH'},body.reviewDigest,body.operationId,request.user?.id)}
}

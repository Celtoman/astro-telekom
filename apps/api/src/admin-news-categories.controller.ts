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
  review(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown){const body=editorialBody(raw,['expectedRevision','action','targetCategoryId']);return this.publications.review(siteId,{kind:'CATEGORY',entityId:id,expectedRevision:body.expectedRevision,action:body.action??'PUBLISH',targetCategoryId:body.targetCategoryId})}
  @Post(':id/publish')
  publish(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['expectedRevision','reviewDigest','operationId','action','targetCategoryId']);return this.publications.publish(siteId,{kind:'CATEGORY',entityId:id,expectedRevision:body.expectedRevision,action:body.action??'PUBLISH',targetCategoryId:body.targetCategoryId},body.reviewDigest,body.operationId,request.user?.id)}
  @Get(':id/history')
  history(@Param('siteId') siteId:string,@Param('id') id:string){return this.store.history(siteId,'CATEGORY',id)}
  @Get(':id/history/:revision')
  revision(@Param('siteId') siteId:string,@Param('id') id:string,@Param('revision') revision:string){return this.store.revision(siteId,'CATEGORY',id,Number(revision))}
  @Post(':id/restore')
  restore(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['revision','expectedRevision']);return this.store.restore(siteId,'CATEGORY',id,body.revision,body.expectedRevision,request.user?.id)}
}

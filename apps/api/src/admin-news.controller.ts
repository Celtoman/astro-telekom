import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { EditorialStoreService } from './editorial-store.service';
import { EditorialPublicationService } from './editorial-publication.service';
export type EditorialRequest={user?:{id:string}};
export function editorialBody(body:unknown,keys:string[]):Record<string,any>{if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!keys.includes(key)))throw new BadRequestException('Неподдерживаемые поля запроса');return body as Record<string,any>}
@Controller('admin/sites/:siteId/news')
@UseGuards(AdminTokenGuard)
export class AdminNewsController {
  constructor(private readonly store:EditorialStoreService,private readonly publications:EditorialPublicationService){}
  @Get()
  list(@Param('siteId') siteId:string,@Query('search') search:string,@Query('categoryId') categoryId:string,@Query('state') state:string,@Query('page') page:string){return this.publications.list(siteId,{search,categoryId,state,page:Number(page)||1})}
  @Post()
  create(@Param('siteId') siteId:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['clientId','content']);return this.store.create(siteId,'ARTICLE',body.clientId,body.content,request.user?.id)}
  @Get('publications/:operationId')
  operation(@Param('siteId') siteId:string,@Param('operationId') operationId:string){return this.publications.operation(siteId,operationId)}
  @Get('related-options')
  related(@Param('siteId') siteId:string,@Query('currentId') currentId:string,@Query('categoryId') categoryId:string,@Query('ids') ids:string,@Query('search') search:string,@Query('page') page:string){return this.publications.relatedOptions(siteId,{currentId,categoryId,selectedIds:(ids??'').split(',').filter(Boolean),search,page:Number(page)||1})}
  @Post('batch/review')
  reviewBatch(@Param('siteId') siteId:string,@Body() raw:unknown){const body=editorialBody(raw,['items']);return this.publications.reviewBatch(siteId,body.items)}
  @Post('batch/publish')
  publishBatch(@Param('siteId') siteId:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['items','reviewDigest','operationId']);return this.publications.publishBatch(siteId,body.items,body.reviewDigest,body.operationId,request.user?.id)}
  @Get(':id')
  get(@Param('siteId') siteId:string,@Param('id') id:string){return this.publications.workspace(siteId,'ARTICLE',id)}
  @Patch(':id')
  save(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['content','expectedRevision','checkpoint']);return this.store.save(siteId,'ARTICLE',id,body.expectedRevision,body.content,request.user?.id,body.checkpoint===true)}
  @Get(':id/history')
  history(@Param('siteId') siteId:string,@Param('id') id:string){return this.store.history(siteId,'ARTICLE',id)}
  @Get(':id/history/:revision')
  revision(@Param('siteId') siteId:string,@Param('id') id:string,@Param('revision') revision:string){return this.store.revision(siteId,'ARTICLE',id,Number(revision))}
  @Post(':id/restore')
  restore(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['revision','expectedRevision','categoryId']);return this.store.restore(siteId,'ARTICLE',id,body.revision,body.expectedRevision,request.user?.id,body.categoryId)}
  @Post(':id/preview')
  preview(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown){const body=editorialBody(raw,['expectedRevision','mode','surface']);return this.publications.preview(siteId,'ARTICLE',id,body.expectedRevision,body.mode??'draft',body.surface)}
  @Post(':id/review')
  review(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown){const body=editorialBody(raw,['expectedRevision','action']);return this.publications.review(siteId,{kind:'ARTICLE',entityId:id,expectedRevision:body.expectedRevision,action:body.action??'PUBLISH'})}
  @Post(':id/publish')
  publish(@Param('siteId') siteId:string,@Param('id') id:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['expectedRevision','action','reviewDigest','operationId']);return this.publications.publish(siteId,{kind:'ARTICLE',entityId:id,expectedRevision:body.expectedRevision,action:body.action??'PUBLISH'},body.reviewDigest,body.operationId,request.user?.id)}
}

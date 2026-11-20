import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { EditorialStoreService } from './editorial-store.service';
import { EditorialPublicationService } from './editorial-publication.service';
import { editorialBody, type EditorialRequest } from './admin-news.controller';
function settingsKind(kind:string){if(kind==='news')return 'NEWS_SETTINGS' as const;if(kind==='not-found')return 'NOT_FOUND' as const;throw new BadRequestException('Неизвестная страница редакционных настроек')}
function publishBody(raw:unknown,keys:string[]){const body=editorialBody(raw,[...keys,'action']);if(body.action!==undefined&&body.action!=='PUBLISH')throw new BadRequestException('Настройки публикуются отдельным действием PUBLISH');return body}
@Controller('admin/sites/:siteId/editorial/:kind')
@UseGuards(AdminTokenGuard)
export class AdminEditorialSettingsController {
  constructor(private readonly store:EditorialStoreService,private readonly publications:EditorialPublicationService){}
  @Get()
  get(@Param('siteId') siteId:string,@Param('kind') kind:string){return this.publications.workspace(siteId,settingsKind(kind),'settings')}
  @Patch()
  save(@Param('siteId') siteId:string,@Param('kind') kind:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['content','expectedRevision','checkpoint']);return this.store.save(siteId,settingsKind(kind),'settings',body.expectedRevision,body.content,request.user?.id,body.checkpoint===true)}
  @Post('preview')
  preview(@Param('siteId') siteId:string,@Param('kind') kind:string,@Body() raw:unknown){const body=editorialBody(raw,['expectedRevision','mode','surface']);return this.publications.preview(siteId,settingsKind(kind),'settings',body.expectedRevision,body.mode??'draft',body.surface)}
  @Post('review')
  review(@Param('siteId') siteId:string,@Param('kind') kind:string,@Body() raw:unknown){const body=publishBody(raw,['expectedRevision']),type=settingsKind(kind);return this.publications.review(siteId,{kind:type,entityId:`${type.toLowerCase()}-${siteId}`,expectedRevision:body.expectedRevision,action:'PUBLISH'})}
  @Post('publish')
  publish(@Param('siteId') siteId:string,@Param('kind') kind:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=publishBody(raw,['expectedRevision','reviewDigest','operationId']),type=settingsKind(kind);return this.publications.publish(siteId,{kind:type,entityId:`${type.toLowerCase()}-${siteId}`,expectedRevision:body.expectedRevision,action:'PUBLISH'},body.reviewDigest,body.operationId,request.user?.id)}
  @Get('history')
  history(@Param('siteId') siteId:string,@Param('kind') kind:string){return this.store.history(siteId,settingsKind(kind),'settings')}
  @Get('history/:revision')
  revision(@Param('siteId') siteId:string,@Param('kind') kind:string,@Param('revision') revision:string){return this.store.revision(siteId,settingsKind(kind),'settings',Number(revision))}
  @Post('restore')
  restore(@Param('siteId') siteId:string,@Param('kind') kind:string,@Body() raw:unknown,@Req() request:EditorialRequest){const body=editorialBody(raw,['revision','expectedRevision']);return this.store.restore(siteId,settingsKind(kind),'settings',body.revision,body.expectedRevision,request.user?.id)}
}

import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import { AdminTokenGuard } from './admin-token.guard';
import { EditorialMediaService } from './editorial-media.service';
import { EDITORIAL_MEDIA_MAX_BYTES } from './editorial-media';
import type { MediaUse } from './news-types';
type UploadRequest = { file(options: {limits: {fileSize:number;files:number;fields:number;parts:number}}): Promise<MultipartFile | undefined> };
type ImageReply = { header(name:string,value:string):ImageReply; type(value:string):ImageReply; send(value:Buffer):unknown };

@Controller('admin/sites/:siteId/news/media')
@UseGuards(AdminTokenGuard)
export class AdminEditorialMediaController {
  constructor(private readonly media: EditorialMediaService) {}
  @Post()
  async upload(@Param('siteId') siteId: string, @Req() request: UploadRequest) {
    try {
      const file = await request.file({limits:{fileSize:EDITORIAL_MEDIA_MAX_BYTES,files:1,fields:0,parts:1}});
      if (!file) throw new BadRequestException('Выберите изображение для загрузки');
      const input = await file.toBuffer();
      if (file.file.truncated) throw new BadRequestException('Изображение больше 10 МБ');
      return await this.media.upload(siteId,input,file.mimetype);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && String(error.code).startsWith('FST_')) throw new BadRequestException('Загрузите один JPEG, PNG или WebP размером до 10 МБ');
      throw error;
    }
  }
  @Get(':id')
  async get(@Param('siteId') siteId: string, @Param('id') id: string) { return this.media.response(await this.media.get(siteId,id)); }
  @Get(':id/file')
  async file(@Param('siteId') siteId: string, @Param('id') id: string, @Query('kind') kind: string, @Query('crop') crop: string, @Res() reply: ImageReply) {
    const file = await this.media.preview(siteId,id,kind,crop);
    reply.header('cache-control','private, no-store').header('x-content-type-options','nosniff').type('image/webp').send(file);
  }
  @Post(':id/crop')
  async crop(@Param('siteId') siteId: string, @Param('id') id: string, @Body() body: {crop:MediaUse['crop'];kind:'cover'|'social'}) {
    if (!body || Object.keys(body).some(k => !['crop','kind'].includes(k)) || !['cover','social'].includes(body.kind) || !body.crop || Object.keys(body.crop).sort().join(',') !== 'height,width,x,y') throw new BadRequestException('Передайте область кадрирования и назначение cover/social');
    const asset = await this.media.prepareUse(siteId,{assetId:id,alt:'',crop:body.crop},body.kind);
    return this.media.response(asset);
  }
}

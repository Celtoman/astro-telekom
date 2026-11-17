import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AdminTokenGuard } from './admin-token.guard';
import { PrismaService } from './prisma.service';
import { EditorialMediaService } from './editorial-media.service';
import { EDITORIAL_MEDIA_MAX_BYTES, mediaHash, type MediaDerivatives } from './editorial-media';
import { SUPPORT_STATIC_IMAGES } from './support-static-images';
import { SUPPORT_CROP_SLOTS, supportCropValid, type SupportCrop, type SupportImageSlot } from './support-image-model';
type UploadRequest={file(options:{limits:{fileSize:number;files:number;fields:number;parts:number}}):Promise<MultipartFile|undefined>};
type ImageReply={header(name:string,value:string):ImageReply;type(value:string):ImageReply;send(value:Buffer):unknown};
@Controller('admin/sites/:siteId/support/media')
@UseGuards(AdminTokenGuard)
export class AdminSupportMediaController{
  constructor(private readonly media:EditorialMediaService,private readonly prisma:PrismaService){}
  @Post()
  async upload(@Param('siteId')siteId:string,@Req()request:UploadRequest){
    try{
      const file=await request.file({limits:{fileSize:EDITORIAL_MEDIA_MAX_BYTES,files:1,fields:0,parts:1}});
      if(!file)throw new BadRequestException('Выберите изображение для загрузки.');
      const input=await file.toBuffer();
      if(file.file.truncated)throw new BadRequestException('Изображение больше 10 МБ.');
      const uploaded=await this.media.upload(siteId,input,file.mimetype);
      return this.response(siteId,await this.media.get(siteId,uploaded.id));
    }catch(e){
      if(e&&typeof e==='object'&&'code'in e&&String(e.code).startsWith('FST_'))throw new BadRequestException('Загрузите один JPEG, PNG или WebP размером до 10 МБ.');
      throw e;
    }
  }
  private response(siteId:string,asset:Awaited<ReturnType<EditorialMediaService['get']>>){
    const body=(asset.derivatives as MediaDerivatives).body.at(-1);
    if(!body)throw new BadRequestException('Не подготовлено изображение.');
    return {id:asset.id,width:asset.width,height:asset.height,src:'/media/editorial/'+body.key,previewPath:'/admin/sites/'+encodeURIComponent(siteId)+'/support/media/'+encodeURIComponent(asset.id)+'/file'};
  }
  @Get('static/:slot')
  async staticImage(@Param('siteId')siteId:string,@Param('slot')slot:string,@Res()reply:ImageReply){
    if(!await this.prisma.site.findUnique({where:{id:siteId},select:{id:true}}))throw new NotFoundException('Сайт не найден.');
    if(!Object.hasOwn(SUPPORT_STATIC_IMAGES,slot))throw new NotFoundException('Изображение не найдено.');
    const image=SUPPORT_STATIC_IMAGES[slot as SupportImageSlot],bytes=await readFile(join(__dirname,'assets/support',basename(image.src)));
    if(mediaHash(bytes)!==image.sha256)throw new BadRequestException('Повреждён исходник изображения.');
    return reply.header('cache-control','private, no-store').header('x-content-type-options','nosniff').type(slot==='app'?'image/jpeg':'image/png').send(bytes);
  }
  @Post('static/:slot/crop')
  async staticCrop(@Param('siteId')siteId:string,@Param('slot')slot:string,@Body()body:{crop:SupportCrop}){
    if(!SUPPORT_CROP_SLOTS.includes(slot as SupportImageSlot)||!body||Object.keys(body).join(',')!=='crop'||!supportCropValid(body.crop))throw new BadRequestException('Выберите изображение и область внутри него.');
    const image=SUPPORT_STATIC_IMAGES[slot as SupportImageSlot],bytes=await readFile(join(__dirname,'assets/support',basename(image.src)));
    if(mediaHash(bytes)!==image.sha256)throw new BadRequestException('Повреждён исходник изображения.');
    const uploaded=await this.media.upload(siteId,bytes,'image/png');
    return this.response(siteId,await this.media.prepareUse(siteId,{assetId:uploaded.id,alt:'',crop:body.crop},'body'));
  }
  @Get(':id')
  async get(@Param('siteId')siteId:string,@Param('id')id:string){return this.response(siteId,await this.media.get(siteId,id));}
  @Get(':id/file')
  async file(@Param('siteId')siteId:string,@Param('id')id:string,@Query('crop')crop:string,@Query('variant')variant:string,@Res()reply:ImageReply){
    if(variant){
      if(!/^[a-f0-9]{64}$/.test(variant))throw new BadRequestException('Некорректный вариант изображения.');
      const asset=await this.media.get(siteId,id),d=asset.derivatives as MediaDerivatives;
      const found=Object.entries(d.crops??{}).find(([,variants])=>variants.some(v=>v.sha256===variant));
      if(!d.body.some(v=>v.sha256===variant)&&!found)throw new NotFoundException('Вариант изображения не принадлежит файлу.');
      crop=found?.[0]??'';
    }
    const bytes=await this.media.preview(siteId,id,'body',crop,variant);
    return reply.header('cache-control','private, no-store').header('x-content-type-options','nosniff').type('image/webp').send(bytes);
  }
  @Post(':id/crop')
  async crop(@Param('siteId')siteId:string,@Param('id')id:string,@Body()body:{crop:SupportCrop}){
    if(!body||Object.keys(body).join(',')!=='crop'||!supportCropValid(body.crop))throw new BadRequestException('Выберите область внутри изображения.');
    return this.response(siteId,await this.media.prepareUse(siteId,{assetId:id,alt:'',crop:body.crop},'body'));
  }
}

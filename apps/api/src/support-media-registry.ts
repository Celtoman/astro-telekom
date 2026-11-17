import { BadRequestException } from '@nestjs/common';
import { mediaCropKey, type MediaDerivatives } from './editorial-media';
import { newsMediaUseKey, type MediaUse, type PublishedNewsMediaVariant as NewsImageVariant } from './news-types';
import { SUPPORT_CROP_SLOTS, SUPPORT_IMAGE_PATHS, supportValue, type SupportImage } from './support-image-model';
import type { SupportPageContent } from './support-page-model';
import { supportPageFromTemplate } from './support-page-view';
import { assertSupportMedia, type SupportMediaRegistry } from './support-media-model';
export { assertSupportMedia, type SupportMediaRegistry } from './support-media-model';
type AssetClient={findFirst(args:any):Promise<any>};

export async function captureSupportMedia(siteId:string,templates:any[],assets:AssetClient):Promise<SupportMediaRegistry>{
  const template=templates.find(t=>t.kind==='CITY_SUPPORT');
  if(!template)return {};
  const content=supportPageFromTemplate(template,true),registry:SupportMediaRegistry={};
  for(const [slot,path]of Object.entries(SUPPORT_IMAGE_PATHS)){
    const image=supportValue(content,path) as SupportImage;
    if(!image.assetId)continue;
    const asset=await assets.findFirst({where:{id:image.assetId,siteId,ready:true}});
    if(!asset)throw new BadRequestException({block:'support',field:path+'.assetId',reason:'ASSET_SOURCE',message:'Изображение не найдено в медиатеке этого сайта.'});
    const d=asset.derivatives as MediaDerivatives;
    const full=d.body?.at(-1);
    if(!full||image.src!=='/media/editorial/'+full.key)throw new BadRequestException({block:'support',field:path+'.src',reason:'ASSET_SOURCE',message:'Источник изображения не совпал с выбранным файлом.'});
    const uses:MediaUse[]=[{assetId:image.assetId,alt:image.alt}];
    if(SUPPORT_CROP_SLOTS.includes(slot as keyof typeof SUPPORT_IMAGE_PATHS))uses.push({assetId:image.assetId,alt:image.alt,crop:image.crop});
    for(const use of uses){
      const key=newsMediaUseKey(use,'body');
      if(registry[key])continue;
      const variants=use.crop?d.crops?.[mediaCropKey('body',use.crop)]:d.body;
      if(!variants?.length)throw new BadRequestException({block:'support',field:path+'.crop',reason:'MEDIA_NOT_READY',message:'Область изображения не подготовлена. Примените кадрирование ещё раз.'});
      registry[key]=variants.map(v=>({src:'/media/editorial/'+v.key,sourceKey:v.key,sha256:v.sha256,width:v.width,height:v.height,bytes:v.bytes}));
    }
  }
  assertSupportMedia(content,registry);
  return registry;
}

import { newsMediaUseKey, type PublishedNewsMediaVariant } from './news-types';
import { SUPPORT_CROP_SLOTS, SUPPORT_IMAGE_PATHS, supportValue, type SupportImage } from './support-image-model';
import type { SupportPageContent } from './support-page-model';
export type SupportMediaRegistry=Record<string,PublishedNewsMediaVariant[]>;
/** Captured-only validation; no private API, filesystem, or working database reads. */
export function assertSupportMedia(content:SupportPageContent,registry:SupportMediaRegistry={}):void{
  for(const[slot,path]of Object.entries(SUPPORT_IMAGE_PATHS)){
    const image=supportValue(content,path) as SupportImage;
    if(!image.assetId)continue;
    for(const crop of SUPPORT_CROP_SLOTS.includes(slot as keyof typeof SUPPORT_IMAGE_PATHS)?[false,true]:[false]){
      const key=newsMediaUseKey({assetId:image.assetId,alt:image.alt,...(crop?{crop:image.crop}:{})},'body'),variants=registry[key];
      if(!variants?.length)throw new Error('SUPPORT: отсутствуют файлы изображения '+path);
      for(const v of variants){
        if(!/^[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(v.sourceKey)||v.src!=='/media/editorial/'+v.sourceKey||v.sha256!==v.sourceKey.slice(65,-5)||![v.width,v.height,v.bytes].every(n=>Number.isSafeInteger(n)&&n>0)||v.bytes>10*1024*1024)throw new Error('SUPPORT: повреждён манифест изображения '+path);
      }
      if(!crop&&image.src!==variants.at(-1)!.src)throw new Error('SUPPORT: источник изображения не совпал с манифестом '+path);
    }
  }
}

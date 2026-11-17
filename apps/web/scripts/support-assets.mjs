import {readFile,readdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SUPPORT_STATIC_IMAGES} from '../../api/src/support-static-images.ts';
import {SUPPORT_IMAGE_SLOTS} from '../../api/src/support-image-model.ts';

/** Verify exact local bytes and dimensions; SUPPORT never fetches remote assets at build time. */
export async function verifySupportAssets({distDirectory}) {
  const root=resolve(distDirectory),cache=new Map();let pages=0;
  for(const city of await readdir(root,{withFileTypes:true})){
    if(!city.isDirectory())continue;
    let document;try{document=await readFile(resolve(root,city.name,'tehpodderzhka/index.html'),'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
    pages++;
    const tags=[...document.matchAll(/<img\b[^>]*\bdata-support-image="([^"]+)"[^>]*>/g)];
    if(tags.length!==11||SUPPORT_IMAGE_SLOTS.some(slot=>tags.filter(m=>m[1]===slot).length!==(slot==='phone'?2:1)))throw Error('SUPPORT: нарушен состав изображений '+city.name);
    for(const [tag,slot] of tags){
      const source=tag.match(/\bsrc="([^"]+)"/)?.[1]?.replace(/^\/__publication_assets\/[a-f0-9]{64}(?=\/)/,'');
      if(!source||!source.startsWith('/')||source.startsWith('//'))throw Error('SUPPORT: изображение должно входить в сборку '+slot);
      const path=resolve(root,'.'+source);if(!path.startsWith(root+sep))throw Error('SUPPORT: небезопасный путь');
      let dimensions=cache.get(source);
      if(!dimensions){
        const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');
        if(source===SUPPORT_STATIC_IMAGES[slot].src){if(hash!==SUPPORT_STATIC_IMAGES[slot].sha256)throw Error('SUPPORT: исходник не совпал с эталоном '+slot);}
        else if(!/^\/media\/editorial\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(source)||!source.endsWith('/'+hash+'.webp'))throw Error('SUPPORT: контрольная сумма не совпала '+slot);
        const decoder=sharp(bytes,{failOn:'warning',limitInputPixels:24_000_000,animated:false}),meta=await decoder.metadata();
        if(!meta.width||!meta.height||(meta.pages??1)!==1||!['png','jpeg','webp'].includes(meta.format))throw Error('SUPPORT: некорректное изображение '+slot);
        await decoder.stats();dimensions={width:meta.width,height:meta.height};cache.set(source,dimensions);
      }
      if(Number(tag.match(/\bwidth="(\d+)"/)?.[1])!==dimensions.width||Number(tag.match(/\bheight="(\d+)"/)?.[1])!==dimensions.height)throw Error('SUPPORT: неверные размеры '+slot);
    }
  }
  return {pages,images:cache.size};
}

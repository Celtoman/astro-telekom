import { SUPPORT_PAGE_VERSION, type SupportPageContent } from './support-page-model';
import { SUPPORT_CROP_SLOTS, SUPPORT_IMAGE_PATHS, supportCropValid, supportValue, type SupportImage } from './support-image-model';
import { SUPPORT_STATIC_IMAGES } from './support-static-images';
import { supportRichField, supportTextRuns } from './support-rich-text';

export function checkSupportPolicy(c:SupportPageContent, fail:(field:string,reason:string,message:string)=>never):void {
  if(c.version!==SUPPORT_PAGE_VERSION)fail('version','VERSION','Неизвестная версия страницы поддержки.');
  for(const [slot,path]of Object.entries(SUPPORT_IMAGE_PATHS)){
    const image=supportValue(c,path) as SupportImage;
    if(!image||typeof image!=='object'||Array.isArray(image)||Object.keys(image).sort().join(',')!=='alt,assetId,caption,crop,src')fail(path,'IMAGE','Передайте изображение с описанием, подписью и областью.');
    if(typeof image.assetId!=='string'||(image.assetId&&!/^[a-zA-Z0-9_-]{1,128}$/.test(image.assetId)))fail(path+'.assetId','ASSET_SOURCE','Некорректное изображение.');
    if(!supportCropValid(image.crop))fail(path+'.crop','CROP','Выберите область внутри изображения.');
    if(!SUPPORT_CROP_SLOTS.includes(slot as keyof typeof SUPPORT_IMAGE_PATHS)&&(image.crop.x!==0||image.crop.y!==0||image.crop.width!==1||image.crop.height!==1))fail(path+'.crop','CROP','Этот слот показывает изображение целиком.');
    if(image.assetId){
      if(!/^\/media\/editorial\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(image.src))fail(path+'.src','ASSET_SOURCE','Нужен подготовленный файл медиатеки этого сайта.');
    }else{
      const original=SUPPORT_STATIC_IMAGES[slot as keyof typeof SUPPORT_STATIC_IMAGES];
      if(image.src!==original.src)fail(path+'.src','ASSET_SOURCE','Загрузите новое изображение через редактор.');
      if((['x','y','width','height'] as const).some(k=>image.crop[k]!==original.crop[k]))fail(path+'.crop','CROP','Примените область исходника через редактор.');
    }
  }
  const visit=(value:unknown,path='')=>{
    if(typeof value==='string'&&supportRichField(path)){try{supportTextRuns(value);}catch(e){fail(path,'RICH_TEXT',e instanceof Error?e.message:'Некорректное форматирование.');}}
    else if(Array.isArray(value))value.forEach((v,i)=>visit(v,path+'.'+i));
    else if(value&&typeof value==='object')for(const[k,v]of Object.entries(value))visit(v,path?path+'.'+k:k);
  };
  visit(c);
  for(const [field,href]of Object.entries({'social.vk.href':c.social.vk.href,'social.ok.href':c.social.ok.href,'social.telegram.href':c.social.telegram.href,'app.stores.googlePlay':c.app.stores.googlePlay,'app.stores.ruStore':c.app.stores.ruStore,'app.stores.appGallery':c.app.stores.appGallery})){
    if(!href.trim())continue;
    try{const u=new URL(href);if(u.protocol!=='https:'||u.username||u.password||u.port||/[<>\s{}\\]/.test(href))throw Error();}
    catch{fail(field,'URL','Нужна HTTPS-ссылка без имени пользователя, пароля и порта.');}
  }
}

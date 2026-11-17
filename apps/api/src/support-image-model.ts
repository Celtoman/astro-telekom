export interface SupportCrop { x:number; y:number; width:number; height:number }
export interface SupportImage { src:string; assetId:string; alt:string; caption:string; crop:SupportCrop }
export const SUPPORT_IMAGE_PATHS = {introduction:'introduction.image',phone:'phones.image',callbackMenu:'callback.menu',callbackForm:'callback.form',chatEntry:'chat.entry',chatDialogue:'chat.image',social:'social.image',account:'account.image',app:'app.image',business:'business.image'} as const;
export type SupportImageSlot = keyof typeof SUPPORT_IMAGE_PATHS;
export const SUPPORT_IMAGE_SLOTS = Object.keys(SUPPORT_IMAGE_PATHS) as SupportImageSlot[];
export const SUPPORT_CROP_SLOTS:readonly SupportImageSlot[]=['phone','callbackMenu','callbackForm','chatEntry','chatDialogue'];
export const SUPPORT_FULL_CROP:SupportCrop={x:0,y:0,width:1,height:1};
export function supportCropValid(c:unknown):c is SupportCrop {
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join(',')!=='height,width,x,y')return false;
  const v=c as SupportCrop;
  return Object.values(v).every(n=>typeof n==='number'&&Number.isFinite(n))&&v.x>=0&&v.y>=0&&v.width>0&&v.height>0&&v.x+v.width<=1.000001&&v.y+v.height<=1.000001;
}
export function supportValue(value:unknown,path:string):unknown {
  return path.split('.').reduce<unknown>((n,k)=>n&&typeof n==='object'&&Object.hasOwn(n,k)?(n as Record<string,unknown>)[k]:undefined,value);
}
export function supportSetValue(value:unknown,path:string,next:unknown):void {
  const parts=path.split('.'),key=parts.pop()!;
  const parent=parts.reduce<any>((n,k)=>n[k],value);parent[key]=next;
}
/** General text-schema validation never receives image transport/crop metadata. */
export function supportSchemaValue<T>(content:T):T {
  const c=structuredClone(content);
  for(const path of Object.values(SUPPORT_IMAGE_PATHS)){
    const image=supportValue(c,path);
    if(image&&typeof image==='object'){const {assetId:_id,crop:_crop,...base}=image as SupportImage;supportSetValue(c,path,base);}
  }
  return c;
}
export function supportRestoreImages<T>(original:unknown,resolved:T):T {
  for(const path of Object.values(SUPPORT_IMAGE_PATHS)){
    const source=supportValue(original,path) as SupportImage, target=supportValue(resolved,path) as SupportImage;
    if(source&&target)supportSetValue(resolved,path,{...target,assetId:source.assetId,crop:structuredClone(source.crop)});
  }
  return resolved;
}

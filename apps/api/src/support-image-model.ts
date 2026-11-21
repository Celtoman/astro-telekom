export interface SupportCrop { x:number; y:number; width:number; height:number }
export interface SupportImage { src:string; assetId:string; alt:string; caption:string; crop:SupportCrop }
export const SUPPORT_IMAGE_PATHS = {introduction:'introduction.image',phone:'phones.image',callbackMenu:'callback.menu',callbackForm:'callback.form',chatEntry:'chat.entry',chatDialogue:'chat.image',social:'social.image',account:'account.image',app:'app.image',business:'business.image'} as const;
export type SupportImageSlot = keyof typeof SUPPORT_IMAGE_PATHS;
export const SUPPORT_IMAGE_SLOTS = Object.keys(SUPPORT_IMAGE_PATHS) as SupportImageSlot[];
const supportImageFields = Object.values(SUPPORT_IMAGE_PATHS).map(path => path.split('.') as [string, string]);
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
/** Build a read-only schema view. Copy only the branches with image transport metadata. */
export function supportSchemaValue<T>(content:T):T {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return content;
  const source = content as Record<string, unknown>;
  const projection = { ...source };
  for (const [section, field] of supportImageFields) {
    if (!Object.hasOwn(projection, section)) continue;
    const value = projection[section];
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, field)) continue;
    const fields = value as Record<string, unknown>;
    const image = fields[field];
    if (!image || typeof image !== 'object') continue;
    const { assetId: _assetId, crop: _crop, ...schemaImage } = image as SupportImage;
    projection[section] = { ...fields, [field]: schemaImage };
  }
  return projection as T;
}
export function supportRestoreImages<T>(original:unknown,resolved:T):T {
  for(const path of Object.values(SUPPORT_IMAGE_PATHS)){
    const source=supportValue(original,path) as SupportImage, target=supportValue(resolved,path) as SupportImage;
    if(source&&target)supportSetValue(resolved,path,{...target,assetId:source.assetId,crop:structuredClone(source.crop)});
  }
  return resolved;
}

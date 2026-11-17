import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import type { MediaUse } from './news-types';

export const EDITORIAL_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const EDITORIAL_MEDIA_MAX_PIXELS = 24_000_000;
export type MediaVariant = { key: string; width: number; height: number; bytes: number; sha256: string; mimeType: 'image/webp' };
export type MediaDerivatives = { body: MediaVariant[]; cover: MediaVariant[]; social: MediaVariant[]; crops?: Record<string, MediaVariant[]> };
const decoderOptions = { limitInputPixels: EDITORIAL_MEDIA_MAX_PIXELS, failOn: 'warning' as const };
const formats: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const mediaHash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

export async function inspectEditorialImage(input: Buffer, mimeType: string) {
  if (!input.length || input.length > EDITORIAL_MEDIA_MAX_BYTES) throw new Error('Размер изображения должен быть от 1 байта до 10 МБ');
  const signature = input.subarray(0, 3).equals(Buffer.from([255,216,255])) ? 'jpeg'
    : input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : input.subarray(0, 4).toString() === 'RIFF' && input.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
  if (!signature || formats[signature] !== mimeType) throw new Error('Формат файла не совпадает с типом. Нужны JPEG, PNG или WebP');
  try {
    const info = await sharp(input, decoderOptions).metadata();
    if (info.format !== signature || !info.width || !info.height || (info.pages ?? 1) !== 1) throw new Error('Нужно статичное изображение');
    if (info.width * info.height > EDITORIAL_MEDIA_MAX_PIXELS) throw new Error('Изображение превышает 24 миллиона пикселей');
    await sharp(input, decoderOptions).stats(); // Decode all pixels; a valid header alone is insufficient.
    const rotated = [5,6,7,8].includes(info.orientation ?? 1);
    return { width: rotated ? info.height : info.width, height: rotated ? info.width : info.height, mimeType };
  } catch (error) {
    throw new Error(`Не удалось прочитать изображение: проверьте формат и размер (не более 24 млн пикселей). ${error instanceof Error ? error.message : ''}`);
  }
}

export async function renderEditorialImage(input: Buffer, kind: 'body' | 'cover' | 'social', requestedWidth: number, crop?: MediaUse['crop']) {
  if (!Number.isSafeInteger(requestedWidth) || requestedWidth < 1 || requestedWidth > 2560) throw new Error('Некорректная ширина изображения');
  const metadata = await sharp(input, decoderOptions).metadata();
  const rotated = [5,6,7,8].includes(metadata.orientation ?? 1);
  const width = rotated ? metadata.height! : metadata.width!, height = rotated ? metadata.width! : metadata.height!;
  const region = crop ?? { x:0, y:0, width:1, height:1 };
  if (Object.values(region).some(value => !Number.isFinite(value)) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1.000001 || region.y + region.height > 1.000001) throw new Error('Некорректная область кадрирования crop');
  const left = Math.floor(region.x * width), top = Math.floor(region.y * height);
  const regionWidth = Math.min(width-left,Math.max(1,Math.floor(region.width*width))), regionHeight = Math.min(height-top,Math.max(1,Math.floor(region.height*height)));
  let pipeline = sharp(input, decoderOptions).autoOrient().extract({left,top,width:regionWidth,height:regionHeight});
  if (kind === 'body') pipeline = pipeline.resize({width:requestedWidth,withoutEnlargement:true});
  else {
    const [horizontal,vertical] = kind === 'cover' ? [16,9] : [40,21];
    const unit = Math.floor(Math.min(requestedWidth/horizontal,regionWidth/horizontal,regionHeight/vertical));
    if (unit < 1) throw new Error('Изображение слишком маленькое для кадрирования');
    pipeline = pipeline.resize({width:unit*horizontal,height:unit*vertical,fit:'cover',position:'centre',withoutEnlargement:true});
  }
  const result = await pipeline.webp({quality:82,effort:4}).toBuffer({resolveWithObject:true});
  return {buffer:result.data,width:result.info.width,height:result.info.height};
}

export function safeMediaPath(root: string, key: string) {
  if (!/^[a-f0-9]{64}\/[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(key)) throw new Error('Invalid media storage key');
  const base = resolve(root), target = resolve(base,...key.split('/'));
  if (!target.startsWith(base+sep)) throw new Error('Invalid media storage path');
  return target;
}
export function mediaReferences(content: unknown): Set<string> {
  const refs = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const object = value as Record<string,unknown>;
    if (typeof object.assetId === 'string' && object.assetId) refs.add(object.assetId);
    Object.values(object).forEach(visit);
  };
  visit(content); return refs;
}
export function mediaCropKey(kind: 'body' | 'cover' | 'social', crop?: MediaUse['crop']) {
  return mediaHash(JSON.stringify({kind,crop:crop?{x:crop.x,y:crop.y,width:crop.width,height:crop.height}:null}));
}

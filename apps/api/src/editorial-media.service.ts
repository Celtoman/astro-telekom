import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { inspectEditorialImage, mediaHash, mediaCropKey, renderEditorialImage, safeMediaPath, type MediaDerivatives, type MediaVariant } from './editorial-media';
import type { MediaUse } from './news-types';

@Injectable()
export class EditorialMediaService {
  constructor(private readonly prisma: PrismaService) {}
  root() {
    if (process.env.EDITORIAL_MEDIA_ROOT) return resolve(process.env.EDITORIAL_MEDIA_ROOT);
    if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Хранилище изображений не настроено');
    return resolve(process.cwd(), '.local-media');
  }
  private async persist(key: string, buffer: Buffer) {
    const path = safeMediaPath(this.root(),key);
    await mkdir(dirname(path),{recursive:true});
    try { await writeFile(path,buffer,{flag:'wx',mode:0o640}); }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
      if (mediaHash(await readFile(path)) !== mediaHash(buffer)) throw new ConflictException('Содержимое файла не совпало с контрольной суммой');
    }
  }
  private async variants(siteId: string, input: Buffer, kind: 'body' | 'cover' | 'social', crop?: MediaUse['crop']) {
    const variants: MediaVariant[] = [];
    for (const width of kind === 'social' ? [1200] : [360,720,1360]) {
      const image = await renderEditorialImage(input,kind,width,crop);
      if (variants.some(item => item.width === image.width && item.height === image.height)) continue;
      const sha256 = mediaHash(image.buffer), key = `${mediaHash(siteId)}/${sha256}.webp`;
      await this.persist(key,image.buffer);
      variants.push({key,sha256,width:image.width,height:image.height,bytes:image.buffer.length,mimeType:'image/webp'});
    }
    return variants;
  }
  async upload(siteId: string, input: Buffer, mimeType: string) {
    if (!await this.prisma.site.findUnique({where:{id:siteId},select:{id:true}})) throw new NotFoundException('Сайт не найден');
    let info: Awaited<ReturnType<typeof inspectEditorialImage>>;
    try { info = await inspectEditorialImage(input,mimeType); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Не удалось обработать изображение'); }
    const sha256 = mediaHash(input);
    const existing = await this.prisma.mediaAsset.findUnique({where:{siteId_sha256:{siteId,sha256}}});
    if (existing?.ready) return this.response(existing);
    const originalKey = `${mediaHash(siteId)}/${sha256}.${mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp'}`;
    await this.persist(originalKey,input);
    let derivatives: MediaDerivatives;
    try { derivatives = {body:await this.variants(siteId,input,'body'),cover:await this.variants(siteId,input,'cover'),social:await this.variants(siteId,input,'social')}; }
    catch { throw new BadRequestException('Не удалось подготовить изображение. Проверьте размер и повторите загрузку.'); }
    const asset = await this.prisma.mediaAsset.upsert({where:{siteId_sha256:{siteId,sha256}},create:{siteId,sha256,originalKey,mimeType,bytes:input.length,width:info.width,height:info.height,derivatives:derivatives as unknown as Prisma.InputJsonValue,ready:true},update:{derivatives:derivatives as unknown as Prisma.InputJsonValue,ready:true}});
    return this.response(asset);
  }
  response(asset: {id:string;siteId:string;width:number;height:number;mimeType:string;bytes:number;ready:boolean;derivatives:unknown}) {
    const derivatives = asset.derivatives as MediaDerivatives;
    return {id:asset.id,width:asset.width,height:asset.height,mimeType:asset.mimeType,bytes:asset.bytes,ready:asset.ready,
      previewPath:`/admin/sites/${encodeURIComponent(asset.siteId)}/news/media/${encodeURIComponent(asset.id)}/file`,
      variants:{body:derivatives.body.map(({width,height})=>({width,height})),cover:derivatives.cover.map(({width,height})=>({width,height}))}};
  }
  async get(siteId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({where:{siteId,id,ready:true}});
    if (!asset) throw new NotFoundException('Изображение не найдено');
    return asset;
  }
  async preview(siteId: string, id: string, kind: string, cropKey?: string, variantHash?: string) {
    const asset = await this.get(siteId,id);
    const derivatives = asset.derivatives as MediaDerivatives;
    const variants = cropKey ? derivatives.crops?.[cropKey] : kind === 'cover' ? derivatives.cover : kind === 'social' ? derivatives.social : derivatives.body;
    if (!variants?.length) throw new NotFoundException('Вариант изображения не найден');
    if(variantHash!==undefined&&!/^[a-f0-9]{64}$/.test(variantHash))throw new BadRequestException('Некорректный вариант изображения');
    const variant = variantHash ? variants.find(item=>item.sha256===variantHash) : variants[variants.length-1];
    if(!variant)throw new NotFoundException('Вариант изображения не принадлежит этому материалу');
    const buffer = await readFile(safeMediaPath(this.root(),variant.key));
    if (mediaHash(buffer) !== variant.sha256) throw new ServiceUnavailableException('Контрольная сумма изображения не совпала');
    return buffer;
  }
  async prepareUse(siteId: string, use: MediaUse, kind: 'cover'|'social') {
    const asset = await this.get(siteId,use.assetId);
    if (!use.crop) return asset;
    const key = mediaCropKey(kind,use.crop);
    // A transaction avoids concurrent crops losing each other's immutable variants.
    if (!(asset.derivatives as MediaDerivatives).crops?.[key]) {
      const original = await readFile(safeMediaPath(this.root(),asset.originalKey));
      if (mediaHash(original) !== asset.sha256) throw new ServiceUnavailableException('Оригинал изображения повреждён');
      let variants: MediaVariant[];
      try { variants = await this.variants(siteId,original,kind,use.crop); }
      catch { throw new BadRequestException('Не удалось применить кадрирование. Проверьте область изображения.'); }
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id=${asset.id} FOR UPDATE`;
        const latest = await tx.mediaAsset.findUniqueOrThrow({where:{id:asset.id}});
        const derivatives = latest.derivatives as MediaDerivatives;
        await tx.mediaAsset.update({where:{id:asset.id},data:{derivatives:{...derivatives,crops:{...derivatives.crops,[key]:variants}} as unknown as Prisma.InputJsonValue}});
      });
    }
    return this.get(siteId,use.assetId);
  }
}

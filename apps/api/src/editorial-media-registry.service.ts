import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EditorialMediaService } from './editorial-media.service';
import { mediaCropKey, type MediaDerivatives } from './editorial-media';
import { newsMediaUseKey, type MediaUse, type NewsBodyNode } from './news-types';
import type { EditorialSource } from './editorial-publication-model';

type MediaRequest = { use: MediaUse; kind: 'body' | 'cover' | 'social' };

function collectBodyImages(node: NewsBodyNode, uses: MediaRequest[]) {
  if (node.type === 'image') uses.push({ use: { assetId: String(node.attrs?.assetId ?? ''), alt: String(node.attrs?.alt ?? '') }, kind: 'body' });
  node.content?.forEach(child => collectBodyImages(child, uses));
}

@Injectable()
export class EditorialMediaRegistryService {
  constructor(private readonly media:EditorialMediaService){}
  async prepare(siteId:string,editorial:EditorialSource){
    const uses: MediaRequest[] = [];
    for(const article of editorial.articles){
      if(article.cover)uses.push({use:article.cover,kind:'cover'});
      const social=article.social?.image??article.cover??editorial.settings.social?.image;
      if(social)uses.push({use:social,kind:'social'});
      collectBodyImages(article.body, uses);
    }
    for(const category of editorial.categories)if(category.social?.image)uses.push({use:category.social.image,kind:'social'});
    if(editorial.settings.social?.image)uses.push({use:editorial.settings.social.image,kind:'social'});
    return this.prepareUses(siteId, editorial, uses);
  }

  preparePreview(siteId: string, editorial: EditorialSource, articleBodyId: string | null) {
    const uses: MediaRequest[] = [];
    for (const article of editorial.articles) {
      if (article.cover) uses.push({ use: article.cover, kind: 'cover' });
      if (article.id === articleBodyId) collectBodyImages(article.body, uses);
    }
    return this.prepareUses(siteId, editorial, uses);
  }

  private async prepareUses(siteId: string, editorial: EditorialSource, uses: MediaRequest[]) {
    const assets=await this.media.readReadyDerivatives(siteId,uses.map(({use})=>use.assetId));
    const registry:NonNullable<EditorialSource['media']>={};
    for(const {use,kind} of uses){
      const key=newsMediaUseKey(use,kind);if(registry[key])continue;
      const asset=assets.get(use.assetId);
      if(asset===undefined)throw new NotFoundException('Изображение не найдено');
      const derivatives=asset as MediaDerivatives;
      const variants=kind!=='body'&&use.crop?derivatives.crops?.[mediaCropKey(kind,use.crop)]:derivatives[kind];
      if(!variants?.length)throw new BadRequestException({field:kind==='cover'?'cover.crop':'social.image',message:'Не готовы размеры выбранного изображения. Примените кадрирование ещё раз перед проверкой.'});
      registry[key]=variants.map(variant=>({src:`/media/editorial/${variant.key}`,sourceKey:variant.key,sha256:variant.sha256,width:variant.width,height:variant.height,bytes:variant.bytes}));
    }
    return {...editorial,media:registry};
  }
}

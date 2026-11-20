import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { newsSettingsDefaults, notFoundDefaults, validateNewsArticle, validateNewsCategory, validateNewsSettings, validateNotFound } from './news-model';
import { DRAFT_CHECKPOINT_LIMIT, editorialDigest } from './editorial-revisions';
import type { EditorialKind } from './editorial-publication-model';
import type { EditorialCategoryPatch } from './editorial-category-plan';

type Tx=Prisma.TransactionClient;
export type EditorialRow={id:string;siteId:string;content:Prisma.JsonValue;revision:number;publishedRevision:number|null;updatedAt:Date;createdAt:Date;[key:string]:any};
export function editorialMissing(kind:EditorialKind,content:unknown,draft=true,id?:string) {
  return kind==='ARTICLE'?validateNewsArticle(content,draft,id):kind==='CATEGORY'?validateNewsCategory(content,draft):kind==='NEWS_SETTINGS'?validateNewsSettings(content,draft):validateNotFound(content,draft);
}
@Injectable()
export class EditorialStoreService {
  constructor(private readonly prisma:PrismaService){}
  async requireSite(siteId:string,tx:Tx|PrismaService=this.prisma){const site=await tx.site.findUnique({where:{id:siteId}});if(!site)throw new NotFoundException('Сайт не найден');return site}
  async row(siteId:string,kind:EditorialKind,id:string,tx:Tx|PrismaService=this.prisma):Promise<EditorialRow|null>{
    const where={siteId,id,archivedAt:null};
    if(kind==='ARTICLE')return tx.newsArticle.findFirst({where});
    if(kind==='CATEGORY')return tx.newsCategory.findFirst({where});
    return tx.editorialSettings.findUnique({where:{siteId_kind:{siteId,kind}}});
  }
  async read(siteId:string,kind:EditorialKind,id:string){
    await this.requireSite(siteId);const row=await this.row(siteId,kind,id);
    if(!row&&['ARTICLE','CATEGORY'].includes(kind))throw new NotFoundException('Материал не найден');
    const content=row?.content??(kind==='NEWS_SETTINGS'?newsSettingsDefaults():notFoundDefaults());
    return {id:row?.id??`${kind.toLowerCase()}-${siteId}`,content,revision:row?.revision??0,updatedAt:row?.updatedAt??null,missingFields:editorialMissing(kind,content,true,row?.id)};
  }
  async create(siteId:string,kind:'ARTICLE'|'CATEGORY',id:string,content:unknown,actorId?:string){
    if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id))throw new BadRequestException('Нужен постоянный идентификатор нового черновика');
    if(kind==='ARTICLE'&&['media','categories','publications','related-options','batch'].includes(id))throw new BadRequestException('Этот идентификатор зарезервирован системой. Создайте новый черновик.');
    return this.save(siteId,kind,id,0,content,actorId,true);
  }
  async save(siteId:string,kind:EditorialKind,id:string,expectedRevision:number,content:unknown,actorId?:string,checkpoint=false){
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new BadRequestException('Передайте актуальную ревизию черновика');
    const missingFields=editorialMissing(kind,content,true,id), next=content as Record<string,any>;
    try{return await this.prisma.$transaction(async tx=>{
      await this.requireSite(siteId,tx);
      let previous=await this.row(siteId,kind,id,tx);
      const guardedCategory=kind==='CATEGORY'?id:kind==='ARTICLE'?next.categoryId:null;
      if(guardedCategory&&await tx.editorialPublicationItem.findFirst({where:{kind:'CATEGORY',entityId:guardedCategory,action:{in:['WITHDRAW','REASSIGN']},publication:{siteId,status:{in:['PENDING','RUNNING']}}}}))throw new ConflictException('Категория готовится к удалению или переносу. Обновите данные и выберите доступную категорию. Введённый текст остался в редакторе.');
      if(previous&&previous.revision!==expectedRevision){
        if(expectedRevision===0&&previous.id===id&&editorialDigest(previous.content)===editorialDigest(content))return {id:previous.id,content:previous.content,revision:previous.revision,updatedAt:previous.updatedAt,missingFields};
        throw new ConflictException({message:'Новость изменена в другой вкладке. Введённый текст сохранён в редакторе. Сравните версии перед продолжением.',reason:'REVISION_CONFLICT',serverRevision:previous.revision});
      }
      if(!previous&&expectedRevision!==0)throw new ConflictException('Редакция больше не доступна. Обновите данные.');
      if(previous&&editorialDigest(previous.content)===editorialDigest(content)){
        if(checkpoint){await tx.editorialRevision.updateMany({where:{siteId,kind,entityId:previous.id,revision:previous.revision,checkpoint:false},data:{checkpoint:true}});await this.prune(tx,siteId,kind,previous.id,previous.revision)}
        return {id:previous.id,content:previous.content,revision:previous.revision,updatedAt:previous.updatedAt,missingFields};
      }
      if(kind==='ARTICLE'&&next.categoryId&&!await tx.newsCategory.findFirst({where:{id:next.categoryId,siteId,archivedAt:null}}))throw new BadRequestException({field:'categoryId',message:'Выберите категорию этого сайта'});
      if(kind==='ARTICLE'&&['page','category'].includes(next.slug))throw new ConflictException({field:'slug',message:'Этот адрес зарезервирован разделом новостей'});
      const revision=(previous?.revision??0)+1, data={content:next as Prisma.InputJsonValue,revision};
      let after:EditorialRow;
      if(kind==='ARTICLE'){
        const query={...data,slug:next.slug||null,title:next.title,summary:next.summary,categoryId:next.categoryId||null,publishedDate:new Date(next.publishedDate)};
        after=previous?await tx.newsArticle.update({where:{id:previous.id,revision:expectedRevision},data:query}):await tx.newsArticle.create({data:{id,siteId,...query}});
      }else if(kind==='CATEGORY'){
        const query={...data,slug:next.slug||null,name:next.name};
        after=previous?await tx.newsCategory.update({where:{id:previous.id,revision:expectedRevision},data:query}):await tx.newsCategory.create({data:{id,siteId,...query}});
      }else after=previous?await tx.editorialSettings.update({where:{id:previous.id,revision:expectedRevision},data}):await tx.editorialSettings.create({data:{id:`${kind.toLowerCase()}-${siteId}`,siteId,kind,...data}});
      const lastCheckpoint = checkpoint ? null : await tx.editorialRevision.findFirst({
        where: { siteId, kind, entityId: after.id, checkpoint: true },
        orderBy: { revision: 'desc' },
        select: { createdAt: true },
      });
      await tx.editorialRevision.create({data:{siteId,kind,entityId:after.id,revision,snapshot:next as Prisma.InputJsonValue,digest:editorialDigest(next),actorId:actorId??null,checkpoint:checkpoint||!lastCheckpoint||Date.now()-lastCheckpoint.createdAt.getTime()>=60_000}});
      await this.prune(tx,siteId,kind,after.id,revision);
      return {id:after.id,content:after.content,revision,updatedAt:after.updatedAt,missingFields};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
    catch(error){
      if(error&&typeof error==='object'&&'code'in error){
        if(error.code==='P2002')throw new ConflictException({field:'slug',message:'Этот адрес или идентификатор уже занят. Проверьте адрес и повторите сохранение.'});
        if(['P2034','P2025'].includes(String(error.code)))throw new ConflictException({reason:'REVISION_CONFLICT',message:'Данные изменились параллельно. Введённый текст сохранён в форме; сравните версии.'});
      }throw error;
    }
  }
  private async prune(tx: Tx, siteId: string, kind: EditorialKind, entityId: string, workingRevision: number) {
    const scope = { siteId, kind, entityId };
    const [checkpoints, pending] = await Promise.all([
      tx.editorialRevision.findMany({
        where: { ...scope, checkpoint: true, publishedAt: null },
        orderBy: { revision: 'desc' },
        take: DRAFT_CHECKPOINT_LIMIT,
        select: { revision: true },
      }),
      tx.editorialPublicationItem.findMany({
        where: { kind, entityId, publication: { siteId, status: { in: ['PENDING', 'RUNNING'] } } },
        select: { revision: true },
      }),
    ]);

    const protectedRevisions = new Set([workingRevision, ...checkpoints.map(row => row.revision), ...pending.map(item => item.revision)]);
    const candidates = { ...scope, publishedAt: null, revision: { notIn: [...protectedRevisions] } };
    if (await tx.editorialRevision.findFirst({ where: candidates, select: { id: true } })) {
      await tx.editorialRevision.deleteMany({ where: candidates });
    }
  }
  async applyCategoryPatches(tx:Tx,siteId:string,patches:EditorialCategoryPatch[],actorId?:string) {
    for(const patch of patches){
      if(patch.liveContent)await tx.editorialRevision.create({data:{siteId,kind:'ARTICLE',entityId:patch.id,revision:patch.liveRevision!,snapshot:patch.liveContent as unknown as Prisma.InputJsonValue,digest:editorialDigest(patch.liveContent),actorId:actorId??null,checkpoint:false}});
      await tx.newsArticle.update({where:{id:patch.id,siteId,revision:patch.expectedRevision},data:{revision:patch.workingRevision,categoryId:patch.workingContent.categoryId,content:patch.workingContent as unknown as Prisma.InputJsonValue}});
      await tx.editorialRevision.create({data:{siteId,kind:'ARTICLE',entityId:patch.id,revision:patch.workingRevision,snapshot:patch.workingContent as unknown as Prisma.InputJsonValue,digest:editorialDigest(patch.workingContent),actorId:actorId??null,checkpoint:true}});
      // Pending publication items are written after this method. Retain all new
      // rows until that ledger exists; the next save applies the normal policy.
    }
  }
  async history(siteId:string,kind:EditorialKind,id:string){
    const workspace=await this.read(siteId,kind,id);
    return this.prisma.editorialRevision.findMany({where:{siteId,kind,entityId:workspace.id},orderBy:{revision:'desc'},select:{revision:true,createdAt:true,publishedAt:true,checkpoint:true,digest:true}});
  }
  async revision(siteId:string,kind:EditorialKind,id:string,revision:number){
    if(!Number.isSafeInteger(revision)||revision<1)throw new BadRequestException('Укажите положительный номер редакции');
    const workspace=await this.read(siteId,kind,id);
    const row=await this.prisma.editorialRevision.findUnique({where:{siteId_kind_entityId_revision:{siteId,kind,entityId:workspace.id,revision}}});
    if(!row)throw new NotFoundException('Редакция не найдена');
    const categoryId=kind==='ARTICLE'?String((row.snapshot as Record<string,any>).categoryId||''):'';
    const category=categoryId?await this.prisma.newsCategory.findFirst({where:{siteId,id:categoryId},select:{id:true,name:true,archivedAt:true}}):null;
    const restoreCategory=kind==='ARTICLE'?{required:!!categoryId&&(!category||!!category.archivedAt),options:await this.prisma.newsCategory.findMany({where:{siteId,archivedAt:null},select:{id:true,name:true},orderBy:{name:'asc'}})}:undefined;
    return {restoreCategory,content:row.snapshot,revision:row.revision,createdAt:row.createdAt,...(category?{categoryNames:{[category.id]:category.name||'Категория без названия'}}:{})};
  }
  async restore(siteId:string,kind:EditorialKind,id:string,revision:number,expectedRevision:number,actorId?:string,categoryId?:string){
    const selected=await this.revision(siteId,kind,id,revision);
    if(selected.restoreCategory?.required&&!categoryId)throw new BadRequestException({field:'categoryId',message:'Категория этой редакции удалена. Явно выберите действующую категорию для восстановления текста.'});
    if(categoryId!==undefined&&(kind!=='ARTICLE'||!selected.restoreCategory?.required||typeof categoryId!=='string'||!categoryId))throw new BadRequestException('Категорию восстановления можно выбрать только вместо недоступной исходной.');
    const content=categoryId?{...selected.content as Record<string,any>,categoryId}:selected.content;return this.save(siteId,kind,id,expectedRevision,content,actorId,true);
  }
}

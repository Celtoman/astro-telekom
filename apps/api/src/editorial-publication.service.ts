import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { EditorialStoreService, editorialMissing } from './editorial-store.service';
import { SiteCatalogService } from './site-catalog.service';
import { EditorialMediaRegistryService } from './editorial-media-registry.service';
import { RebuildQueueService } from './rebuild-queue.service';
import { editorialServingSource } from './editorial-serving-source';
import { applyEditorialChangeSet, type EditorialChange, type EditorialKind } from './editorial-publication-model';
import { editorialDigest } from './editorial-revisions';
import { newsRoutes, relatedNewsOptions } from './news-projection';
import { normalizeRedirectPath } from './redirect-path';
import { validatePublicationSource } from './publication-validation';
import { APP_VERSION } from './app-version';
import { editorialLiveUrl } from './editorial-live-url';
type Tx=Prisma.TransactionClient;
export type EditorialReleaseInput={kind:EditorialKind;entityId:string;expectedRevision:number;action:'PUBLISH'|'WITHDRAW'};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class EditorialPublicationService {
  constructor(private readonly prisma:PrismaService,private readonly store:EditorialStoreService,private readonly catalog:SiteCatalogService,private readonly media:EditorialMediaRegistryService,private readonly rebuilds:RebuildQueueService){}
  private async candidate(siteId:string,input:EditorialReleaseInput,tx:Tx|PrismaService,commitAliases=false){
    if(!['PUBLISH','WITHDRAW'].includes(input.action)||input.action==='WITHDRAW'&&input.kind!=='ARTICLE')throw new BadRequestException('Неподдерживаемое действие выпуска');
    const site=await this.store.requireSite(siteId,tx),baseline=await editorialServingSource(tx,site);
    const pending=await tx.sitePublication.findFirst({where:{siteId,id:{not:baseline.publication.id},status:{in:['PENDING','RUNNING']}},select:{id:true}});
    if(pending)throw new ConflictException('На сайте уже выполняется публикация. Дождитесь её результата и повторите проверку.');
    const row=await this.store.row(siteId,input.kind,input.entityId,tx);
    if(!row||row.revision!==input.expectedRevision)throw new ConflictException('Черновик изменился. Сохраните текущую версию и повторите проверку.');
    const old=baseline.source.editorial;
    if(input.action==='WITHDRAW'&&!old?.articles.some(a=>a.id===row.id))throw new ConflictException('Эта новость уже не опубликована');
    const items:EditorialChange[]=[];
    let source=baseline.source;
    const selected=row.content as Record<string,any>;
    if(input.action==='PUBLISH')editorialMissing(input.kind,selected,false,row.id);
    if(input.kind==='ARTICLE'&&input.action==='PUBLISH'){
      if(!old?.categories.some(c=>c.id===selected.categoryId)){
        const category=await this.store.row(siteId,'CATEGORY',selected.categoryId,tx);
        if(!category)throw new BadRequestException({field:'categoryId',message:'Категория не найдена'});
        editorialMissing('CATEGORY',category.content,false,category.id);
        const dependency:EditorialChange={kind:'CATEGORY',entityId:category.id,revision:category.revision,action:'PUBLISH',snapshot:{...category.content as Record<string,any>,id:category.id,revision:category.revision}};
        items.push(dependency);source=applyEditorialChangeSet(source,dependency);
      }
      if(selected.related.mode==='manual'&&selected.related.ids.some((id:string)=>!old?.articles.some(a=>a.id===id&&id!==row.id)))throw new BadRequestException({field:'related.ids',message:'Вручную можно выбрать только опубликованные новости, кроме текущей. Обновите подборку.'});
    }
    const revision=await tx.editorialRevision.findUnique({where:{siteId_kind_entityId_revision:{siteId,kind:input.kind,entityId:row.id,revision:row.revision}}});
    if(!revision)throw new ConflictException('Сохранённая редакция недоступна. Повторите сохранение.');
    const snapshot=input.action==='PUBLISH'?{...selected,id:row.id,revision:row.revision,...(input.kind==='ARTICLE'?{dateModified:row.sourceId&&row.revision===1?selected.publishedDate:revision.createdAt.toISOString()}: {})}:null;
    const change:EditorialChange={kind:input.kind,entityId:row.id,revision:row.revision,action:input.action,snapshot};
    items.push(change);source=applyEditorialChangeSet(source,change);
    const mappings=new Map<string,string>();
    const aliasOwners=new Map<string,string>();
    const addAlias=(from:string,to:string,owner=`${input.kind}:${input.entityId}`)=>{if(from!==to){const path=normalizeRedirectPath(from,'sourcePath');mappings.set(path,normalizeRedirectPath(to,'targetPath'));aliasOwners.set(path,owner)}};
    if(input.kind==='ARTICLE'&&input.action==='PUBLISH'){
      const to=`/news/${selected.slug}`,previous=old?.articles.find(a=>a.id===row.id);
      if(previous?.slug&&previous.slug!==selected.slug){
        const from=`/news/${previous.slug}`;addAlias(from,to);
        for(const alias of baseline.source.redirects.filter(a=>a.targetPath===from))addAlias(alias.sourcePath,to);
      }
      if(row.sourceUrl){const from=new URL(row.sourceUrl).pathname.replace(/\/+$/,'')||'/';if(from!=='/'&&from!=='/akcii-domru')addAlias(from,to)}
    }
    if(input.kind==='CATEGORY'&&input.action==='PUBLISH'){
      const previous=old?.categories.find(c=>c.id===row.id);
      if(previous?.slug&&previous.slug!==selected.slug){
        for(const route of newsRoutes(old!).filter(r=>r.kind==='NEWS_CATEGORY'&&r.categorySlug===previous.slug)){
          const to=route.path.replace(`/news/category/${previous.slug}`,`/news/category/${selected.slug}`);addAlias(route.path,to);
          for(const alias of baseline.source.redirects.filter(a=>a.targetPath===route.path))addAlias(alias.sourcePath,to);
        }
      }
    }
    const newsPaths=new Set(newsRoutes(source.editorial!).map(r=>r.path));
    if(newsPaths.has('/news')){addAlias('/news/page/1','/news','NEWS_SETTINGS');addAlias('/novosti','/news','NEWS_SETTINGS')}
    for(const route of newsRoutes(source.editorial!).filter(r=>r.kind==='NEWS_CATEGORY'&&r.page===1))addAlias(`${route.path}/page/1`,route.path,`CATEGORY:${source.editorial!.categories.find(c=>c.slug===route.categorySlug)!.id}`);
    const owned=new Set(old?.redirectIds??[]);
    const aliases:Array<{id:string;sourcePath:string;targetPath:string;status:'PUBLISHED'}>=[];
    for(const [from,to] of mappings){
      if(!newsPaths.has(to))continue;
      const existing=await tx.redirect.findUnique({where:{siteId_sourcePath:{siteId,sourcePath:from}}});
      const owner=aliasOwners.get(from)!;
      if(existing?.managedEditorialKey&&existing.managedEditorialKey!==owner)throw new ConflictException(`Адрес ${from} управляется другим материалом.`);
      if(existing&&!owned.has(existing.id)&&existing.managedEditorialKey!==owner&&existing.targetPath!==to)throw new ConflictException(`Адрес ${from} уже используется перенаправлением. Проверьте конфликт перед выпуском.`);
      const id=existing?.id??`edr_${editorialDigest({siteId,from}).slice(0,40)}`;
      if(commitAliases){
        if(!existing)await tx.redirect.create({data:{id,siteId,sourcePath:from,targetPath:to,status:'DRAFT',managedEditorialKey:owner}});
        else if(!existing.managedEditorialKey)await tx.redirect.update({where:{id},data:{managedEditorialKey:owner}});
      }
      aliases.push({id,sourcePath:from,targetPath:to,status:'PUBLISHED'});
    }
    if(aliases.length)source=applyEditorialChangeSet(source,{...change,redirects:aliases});
    const managed=new Set(source.editorial!.redirectIds??[]);
    source.redirects=source.redirects.filter(alias=>!managed.has(alias.id)||newsPaths.has(alias.targetPath));
    source.editorial!.redirectIds=source.redirects.filter(alias=>managed.has(alias.id)).map(alias=>alias.id);
    source.editorial=await this.media.prepare(siteId,source.editorial!);
    source.publicationBaseId=baseline.publication.id;
    const validation=validatePublicationSource(source,{appVersion:APP_VERSION,siteRevision:baseline.publication.siteRevision},(s,now)=>this.catalog.renderSource(s,now));
    const reviewDigest=editorialDigest({basePublicationId:baseline.publication.id,items,editorial:source.editorial,redirects:source.redirects});
    return {source,validation,reviewDigest,items,baseline:baseline.publication,selectedTitle:String(selected.title??selected.name??(input.kind==='NOT_FOUND'?'Страница 404':'Настройки новостей'))};
  }
  private publicReview(candidate:Awaited<ReturnType<EditorialPublicationService['candidate']>>){
    const {validation,items,baseline,reviewDigest,source}=candidate;
    return {reviewDigest,basePublicationId:baseline.id,ready:!!validation.catalog,report:validation.report,items:items.map(item=>({kind:item.kind,entityId:item.entityId,revision:item.revision,action:item.action,title:item.snapshot?.title??item.snapshot?.name??candidate.selectedTitle})),affectedPaths:[...new Set(['/',...newsRoutes(source.editorial!).map(r=>r.path),...(items.some(i=>i.kind==='NOT_FOUND')?['Все неизвестные адреса (HTTP 404)']:[])])],redirects:source.redirects.filter(a=>source.editorial!.redirectIds?.includes(a.id)).map(({sourcePath,targetPath})=>({sourcePath,targetPath}))};
  }
  async review(siteId:string,input:EditorialReleaseInput){return this.publicReview(await this.candidate(siteId,input,this.prisma))}
  async publish(siteId:string,input:EditorialReleaseInput,reviewDigest:string,operationId:string,actorId?:string){
    if(!/^[a-f0-9]{64}$/.test(reviewDigest)||!/^[a-zA-Z0-9_-]{1,100}$/.test(operationId))throw new BadRequestException('Нужны актуальная проверка и идентификатор операции');
    const scopeKey=`editorial:${operationId}`;
    const publication=await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Site" WHERE id=${siteId} FOR UPDATE`;
      const existing=await tx.sitePublication.findFirst({where:{siteId,scopeKey}});
      if(existing){if(existing.changeSetDigest!==reviewDigest)throw new ConflictException('Идентификатор операции уже использован для другого выпуска');return existing}
      const candidate=await this.candidate(siteId,input,tx,true);
      if(candidate.reviewDigest!==reviewDigest)throw new ConflictException('Состав или опубликованная версия изменились после проверки. Повторите проверку.');
      if(!candidate.validation.catalog)throw new ConflictException({message:'Публикация заблокирована. Исправьте ошибки проверки.',report:candidate.validation.report});
      const validation=await tx.sitePublicationValidation.create({data:{siteId,siteRevision:candidate.baseline.siteRevision,sourceSnapshot:json(candidate.source),report:json(candidate.validation.report),appVersion:APP_VERSION,outcome:candidate.validation.report.outcome,checkedUrlCount:candidate.validation.report.checkedUrlCount,requestedById:actorId??null}});
      return tx.sitePublication.create({data:{siteId,siteRevision:candidate.baseline.siteRevision,scopeKey,basePublicationId:candidate.baseline.id,changeSetDigest:reviewDigest,catalog:json(candidate.validation.catalog),validationId:validation.id,triggerEntity:'editorial',triggerEntityId:input.entityId,requestedById:actorId??null,status:'PENDING',editorialItems:{create:candidate.items.map(item=>({kind:item.kind,entityId:item.entityId,revision:item.revision,action:item.action,snapshot:item.snapshot?json(item.snapshot):Prisma.DbNull}))}}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60_000});
    const rebuild=['PENDING','RUNNING'].includes(publication.status)?await this.rebuilds.enqueue({entity:'editorial',id:input.entityId,siteId,publicationId:publication.id}):null;
    return {publicationId:publication.id,status:publication.status,rebuild};
  }
  async operation(siteId:string,operationId:string){
    const publication=await this.prisma.sitePublication.findFirst({where:{siteId,scopeKey:`editorial:${operationId}`},select:{id:true,status:true,lastError:true,siteRevision:true,releaseSequence:true,basePublicationId:true,validationId:true,publishedAt:true}});
    if(!publication)throw new NotFoundException('Операция не найдена');
    const rebuild=await this.prisma.siteRebuild.findUnique({where:{dedupeKey:`site:${siteId}`},select:{id:true,status:true,requestedRevision:true,publishedRevision:true,requestedPublicationId:true,processingPublicationId:true,lastError:true,providerStatus:true}});
    return {...publication,rebuild:rebuild&&[rebuild.requestedPublicationId,rebuild.processingPublicationId].includes(publication.id)?rebuild:null};
  }
  async workspace(siteId:string,kind:EditorialKind,id:string){
    const working=await this.store.read(siteId,kind,id),row=await this.store.row(siteId,kind,id);
    const site=await this.store.requireSite(siteId);
    let publishedAvailable=true,published:Record<string,any>|null=null,publicUrl:string|null=null;
    try{
      const baseline=(await editorialServingSource(this.prisma,site)).source,source=baseline.editorial;
      publicUrl=editorialLiveUrl(baseline,kind,id);
      published=kind==='ARTICLE'?source?.articles.find(a=>a.id===id)??null:kind==='CATEGORY'?source?.categories.find(c=>c.id===id)??null:kind==='NEWS_SETTINGS'?source&&source.newsEnabled!==false?source.settings:null:source?.notFound??null;
    }catch{publishedAvailable=false}
    const content=published?Object.fromEntries(Object.keys(working.content as object).map(key=>[key,published![key]])):null;
    const state=!publishedAvailable?'UNKNOWN':published?editorialDigest(content)===editorialDigest(working.content)?'PUBLISHED':'CHANGED':row?.everPublished?'WITHDRAWN':'DRAFT';
    return {...working,published:content,publishedAvailable,publishedRevision:published?.revision??null,state,publicUrl};
  }
  async list(siteId:string,query:{search?:string;categoryId?:string;state?:string;page?:number}={}){
    const site=await this.store.requireSite(siteId),rows=await this.prisma.newsArticle.findMany({where:{siteId,archivedAt:null,...(query.search?{title:{contains:query.search.slice(0,250),mode:'insensitive' as const}}:{}),...(query.categoryId?{categoryId:query.categoryId}:{})},orderBy:[{publishedDate:'desc'},{id:'asc'}],select:{id:true,title:true,summary:true,slug:true,categoryId:true,publishedDate:true,revision:true,content:true,everPublished:true,updatedAt:true}});
    let publishedAvailable=true,live:Array<Record<string,any>>=[];
    try{live=(await editorialServingSource(this.prisma,site)).source.editorial?.articles??[]}catch{publishedAvailable=false}
    const items=rows.map(row=>{
      const published=live.find(a=>a.id===row.id),content=published?Object.fromEntries(Object.keys(row.content as object).map(key=>[key,published[key]])):null;
      const state=!publishedAvailable?'UNKNOWN':published?editorialDigest(content)===editorialDigest(row.content)?'PUBLISHED':'CHANGED':row.everPublished?'WITHDRAWN':'DRAFT';
      const {content:_content,...item}=row;return {...item,state};
    }).filter(item=>!query.state||item.state===query.state);
    const page=Math.max(1,Number.isSafeInteger(query.page)?Number(query.page):1),pageSize=25;
    return {items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize,publishedAvailable};
  }
  async categories(siteId:string){
    const site=await this.store.requireSite(siteId),rows=await this.prisma.newsCategory.findMany({where:{siteId,archivedAt:null},orderBy:{name:'asc'},include:{_count:{select:{articles:{where:{archivedAt:null}}}}}});
    let publishedAvailable=true,live:Array<Record<string,any>>=[],categories:Array<Record<string,any>>=[];
    try{const source=(await editorialServingSource(this.prisma,site)).source.editorial;live=source?.articles??[];categories=source?.categories??[]}catch{publishedAvailable=false}
    return {items:rows.map(row=>({id:row.id,name:row.name,slug:row.slug,revision:row.revision,totalCount:row._count.articles,liveCount:publishedAvailable?live.filter(a=>a.categoryId===row.id).length:null,publishedRevision:categories.find(c=>c.id===row.id)?.revision??null})),publishedAvailable};
  }
  async relatedOptions(siteId:string,query:Parameters<typeof relatedNewsOptions>[1]) {
    const site=await this.store.requireSite(siteId),baseline=await editorialServingSource(this.prisma,site);
    return relatedNewsOptions(baseline.source.editorial?.articles??[],query);
  }
}

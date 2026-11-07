import { retiredEditorialPaths } from './editorial-redirects';
import { editorialPreviewOverlay } from './editorial-preview-model';
import { mediaCropKey } from './editorial-media';
import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
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
import { prepareCategoryRetirement } from './editorial-category-retirement';
import { confirmedEditorialTransfers,remapEditorialAliasOwners,restoreEditorialAliases } from './editorial-redirects';
type Tx=Prisma.TransactionClient;
export type EditorialReleaseInput={kind:EditorialKind;entityId:string;expectedRevision:number;action:'PUBLISH'|'WITHDRAW'|'REASSIGN';targetCategoryId?:string};
export function editorialBatchInputs(raw:unknown):EditorialReleaseInput[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>100)throw new BadRequestException('Выберите от 1 до 100 новых или изменённых материалов.');
  const ids=new Set<string>();
  return raw.map((item):EditorialReleaseInput=>{
    if(!item||typeof item!=='object'||Object.keys(item).some(key=>!['entityId','expectedRevision'].includes(key))||typeof item.entityId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(item.entityId)||!Number.isSafeInteger(item.expectedRevision)||item.expectedRevision<1||ids.has(item.entityId))throw new BadRequestException('Нужен список разных материалов с точными сохранёнными редакциями.');
    ids.add(item.entityId);return {kind:'ARTICLE',action:'PUBLISH',entityId:item.entityId,expectedRevision:item.expectedRevision};
  }).sort((a,b)=>a.entityId.localeCompare(b.entityId,'en'));
}
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class EditorialPublicationService {
  constructor(private readonly prisma:PrismaService,private readonly store:EditorialStoreService,private readonly catalog:SiteCatalogService,private readonly media:EditorialMediaRegistryService,private readonly rebuilds:RebuildQueueService){}
  private async candidate(siteId:string,releaseInput:EditorialReleaseInput|EditorialReleaseInput[],tx:Tx|PrismaService,commitAliases=false,actorId?:string){
    const batch=Array.isArray(releaseInput),inputs=batch?releaseInput:[releaseInput],input=inputs[0];
    if(!input)throw new BadRequestException('Выберите материал.');
    if(!['PUBLISH','WITHDRAW','REASSIGN'].includes(input.action)||input.action==='WITHDRAW'&&!['ARTICLE','CATEGORY'].includes(input.kind)||input.action==='REASSIGN'&&input.kind!=='CATEGORY'||input.targetCategoryId!==undefined&&input.action!=='REASSIGN')throw new BadRequestException('Неподдерживаемое действие выпуска');
    if(input.action==='REASSIGN'&&(typeof input.targetCategoryId!=='string'||!input.targetCategoryId||input.targetCategoryId.length>200))throw new BadRequestException('Выберите категорию для переноса.');
    const site=await this.store.requireSite(siteId,tx),baseline=await editorialServingSource(tx,site);
    const pending=await tx.sitePublication.findFirst({where:{siteId,id:{not:baseline.publication.id},status:{in:['PENDING','RUNNING']}},select:{id:true}});
    if(pending)throw new ConflictException('На сайте уже выполняется публикация. Дождитесь её результата и повторите проверку.');
    const old=baseline.source.editorial;
    const items:EditorialChange[]=[];
    let source=baseline.source,selectedTitle='Выбранные новости';
    let retirement:Awaited<ReturnType<typeof prepareCategoryRetirement>>|null=null;
    let change:EditorialChange;
    const mappings=new Map<string,string>(),aliasOwners=new Map<string,string>();
    const addAlias=(from:string,to:string,owner=`${input.kind}:${input.entityId}`)=>{
      if(from===to)return;
      const path=normalizeRedirectPath(from,'sourcePath'),target=normalizeRedirectPath(to,'targetPath'),previousOwner=aliasOwners.get(path);
      if(mappings.has(path)&&(mappings.get(path)!==target||previousOwner!==owner&&previousOwner!=='@preserve'&&owner!=='@preserve'))throw new ConflictException(`Адрес ${from} выбран для разных материалов.`);
      mappings.set(path,target);aliasOwners.set(path,owner==='@preserve'&&previousOwner?previousOwner:owner);
    };
    for(const input of inputs){
    selectedTitle=`Новость без заголовка (${input.entityId})`;
    try{
    const row=await this.store.row(siteId,input.kind,input.entityId,tx);
    const selected=(row?.content??{}) as Record<string,any>;
    selectedTitle=String(selected.title||selected.name||(input.kind==='NOT_FOUND'?'Страница 404':input.kind==='NEWS_SETTINGS'?'Настройки новостей':selectedTitle));
    if(!row||row.revision!==input.expectedRevision)throw new ConflictException('Черновик изменился. Сохраните текущую версию и повторите проверку.');
    if(batch){
      const published=old?.articles.find(a=>a.id===row.id);
      const publishedContent=published?Object.fromEntries(Object.keys(selected).map(key=>[key,published[key]])):null;
      if(published?editorialDigest(publishedContent)===editorialDigest(selected):row.everPublished)throw new ConflictException('Выберите новые или изменённые материалы. Новость без изменений или снятая с публикации недоступна для пакетного выпуска.');
    }
    if(input.kind==='CATEGORY'&&input.action==='PUBLISH'&&await tx.editorialPublicationItem.findFirst({where:{kind:'CATEGORY',entityId:row.id,action:{in:['WITHDRAW','REASSIGN']},publication:{siteId,status:{in:['PENDING','RUNNING']}}},select:{id:true}}))throw new ConflictException('Категория готовится к удалению. Дождитесь подтверждения результата; повторная публикация недоступна.');
    if(input.kind==='ARTICLE'&&input.action==='WITHDRAW'&&!old?.articles.some(a=>a.id===row.id))throw new ConflictException('Эта новость уже не опубликована');
    retirement=input.kind==='CATEGORY'&&input.action!=='PUBLISH'?await prepareCategoryRetirement(tx,this.store,siteId,row,input.targetCategoryId??null,old):null;
    if(retirement){
      for(const dependency of retirement.dependencies){items.push(dependency);source=applyEditorialChangeSet(source,dependency)}
      for(const item of retirement.items){items.push(item);if(!item.snapshot?.draftOnly)source=applyEditorialChangeSet(source,item)}
      if(commitAliases)await this.store.applyCategoryPatches(tx as Tx,siteId,retirement.plan.patches,actorId);
    }
    if(input.action==='PUBLISH')editorialMissing(input.kind,selected,false,row.id);
    if(input.kind==='ARTICLE'&&input.action==='PUBLISH'){
      if(!source.editorial?.categories.some(c=>c.id===selected.categoryId)){
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
    const snapshot=input.action==='PUBLISH'?{...selected,id:row.id,revision:row.revision,...(input.kind==='ARTICLE'?{dateModified:row.sourceId&&row.revision===1?selected.publishedDate:revision.createdAt.toISOString()}: {})}:input.action==='REASSIGN'?{targetCategoryId:input.targetCategoryId}:null;
    change={kind:input.kind,entityId:row.id,revision:row.revision,action:input.action,snapshot,...(input.targetCategoryId?{targetCategoryId:input.targetCategoryId}:{})};
    items.push(change);source=applyEditorialChangeSet(source,change);
    if(input.kind==='ARTICLE'&&input.action==='PUBLISH'){
      const to=`/news/${selected.slug}`,previous=old?.articles.find(a=>a.id===row.id);
      if(previous?.slug&&previous.slug!==selected.slug){
        const from=`/news/${previous.slug}`;addAlias(from,to,`ARTICLE:${row.id}`);
        for(const alias of baseline.source.redirects.filter(a=>a.targetPath===from))addAlias(alias.sourcePath,to,'@preserve');
      }
      if(row.sourceUrl){const from=new URL(row.sourceUrl).pathname.replace(/\/+$/,'')||'/';if(from!=='/'&&from!=='/akcii-domru')addAlias(from,to,`ARTICLE:${row.id}`)}
    }
    if(input.kind==='CATEGORY'&&input.action==='PUBLISH'){
      const previous=old?.categories.find(c=>c.id===row.id);
      if(previous?.slug&&previous.slug!==selected.slug){
        for(const route of newsRoutes(old!).filter(r=>r.kind==='NEWS_CATEGORY'&&r.categorySlug===previous.slug)){
          const to=route.path.replace(`/news/category/${previous.slug}`,`/news/category/${selected.slug}`);addAlias(route.path,to);
          for(const alias of baseline.source.redirects.filter(a=>a.targetPath===route.path))addAlias(alias.sourcePath,to,'@preserve');
        }
      }
    }
    if(retirement&&input.targetCategoryId){
      const previous=old?.categories.find(c=>c.id===row.id),target=source.editorial!.categories.find(c=>c.id===input.targetCategoryId);
      if(previous&&target)for(const route of newsRoutes(old!).filter(r=>r.kind==='NEWS_CATEGORY'&&r.categorySlug===previous.slug)){
        const to=route.path.replace(`/news/category/${previous.slug}`,`/news/category/${target.slug}`);addAlias(route.path,to);
        for(const alias of baseline.source.redirects.filter(a=>a.targetPath===route.path))addAlias(alias.sourcePath,to,'@preserve');
      }
    }
    }catch(error){
      if(batch&&error instanceof HttpException)throw new HttpException({message:`«${selectedTitle}»: ${error.message}`,entityId:input.entityId,details:error.getResponse()},error.getStatus());
      throw error;
    }
    }
    const newsPaths=new Set(newsRoutes(source.editorial!).map(r=>r.path));
    const approved=await tx.redirect.findMany({where:{siteId,managedEditorialKey:{not:null},managedEditorialReleaseSequence:{not:null}},select:{id:true,sourcePath:true,targetPath:true,managedEditorialKey:true,managedEditorialReleaseSequence:true}});
    const transfers=await confirmedEditorialTransfers(tx,siteId,baseline.publication.id);
    if(retirement&&input.targetCategoryId)transfers.push({sourceId:input.entityId,targetId:input.targetCategoryId,releaseSequence:baseline.publication.releaseSequence+1});
    for(const alias of restoreEditorialAliases(source.editorial!,remapEditorialAliasOwners(approved,transfers)))addAlias(alias.sourcePath,alias.targetPath,'@preserve');
    if(newsPaths.has('/news')){addAlias('/news/page/1','/news','NEWS_SETTINGS');addAlias('/novosti','/news','NEWS_SETTINGS')}
    for(const route of newsRoutes(source.editorial!).filter(r=>r.kind==='NEWS_CATEGORY'&&r.page===1))addAlias(`${route.path}/page/1`,route.path,`CATEGORY:${source.editorial!.categories.find(c=>c.slug===route.categorySlug)!.id}`);
    const owned=new Set(old?.redirectIds??[]);
    const aliases:Array<{id:string;sourcePath:string;targetPath:string;status:'PUBLISHED'}>=[];
    for(const [from,to] of mappings){
      if(!newsPaths.has(to))continue;
      const existing=await tx.redirect.findUnique({where:{siteId_sourcePath:{siteId,sourcePath:from}}});
      const requestedOwner=aliasOwners.get(from)!,owner=requestedOwner==='@preserve'?(existing?.managedEditorialKey??`${input.kind}:${input.entityId}`):requestedOwner;
      if(existing?.managedEditorialKey&&existing.managedEditorialKey!==owner)throw new ConflictException(`Адрес ${from} управляется другим материалом.`);
      if(existing&&!owned.has(existing.id)&&existing.managedEditorialKey!==owner&&existing.targetPath!==to)throw new ConflictException(`Адрес ${from} уже используется перенаправлением. Проверьте конфликт перед выпуском.`);
      const id=existing?.id??`edr_${editorialDigest({siteId,from}).slice(0,40)}`;
      if(commitAliases){
        if(!existing)await tx.redirect.create({data:{id,siteId,sourcePath:from,targetPath:to,status:'DRAFT',managedEditorialKey:owner}});
        else if(!existing.managedEditorialKey)await tx.redirect.update({where:{id},data:{managedEditorialKey:owner}});
      }
      aliases.push({id,sourcePath:from,targetPath:to,status:'PUBLISHED'});
    }
    if(aliases.length)source=applyEditorialChangeSet(source,{...change!,redirects:aliases});
    const managed=new Set(source.editorial!.redirectIds??[]);
    source.redirects=source.redirects.filter(alias=>!managed.has(alias.id)||newsPaths.has(alias.targetPath));
    source.editorial!.redirectIds=source.redirects.filter(alias=>managed.has(alias.id)).map(alias=>alias.id);
    source.editorial=await this.media.prepare(siteId,source.editorial!);
    source.publicationBaseId=baseline.publication.id;
    const validation=validatePublicationSource(source,{appVersion:APP_VERSION,siteRevision:baseline.publication.siteRevision},(s,now)=>this.catalog.renderSource(s,now));
    const reviewDigest=editorialDigest({basePublicationId:baseline.publication.id,items,editorial:source.editorial,redirects:source.redirects,...(retirement?{draftPatches:retirement.plan.patches,targetName:retirement.targetName}:{})});
    return {source,validation,reviewDigest,items,previousSource:baseline.source,baseline:baseline.publication,retirement,selectedTitle};
  }
  private publicReview(candidate:Awaited<ReturnType<EditorialPublicationService['candidate']>>){
    const {validation,items,baseline,reviewDigest,source}=candidate;
    const retiredPaths=retiredEditorialPaths(candidate.previousSource.editorial,candidate.previousSource.redirects,source.editorial!,source.redirects);
    return {retiredPaths,reviewDigest,basePublicationId:baseline.id,ready:!!validation.catalog,report:validation.report,retirementTarget:candidate.retirement?.targetName??null,items:items.map(item=>({kind:item.kind,entityId:item.entityId,revision:item.revision,action:item.action,title:item.snapshot?.title??item.snapshot?.name??candidate.selectedTitle,draftOnly:!!item.snapshot?.draftOnly})),draftChanges:candidate.retirement?.plan.patches.map(patch=>({entityId:patch.id,title:patch.workingContent.title||'Черновик без заголовка',previousRevision:patch.expectedRevision,revision:patch.workingRevision,categoryId:patch.workingContent.categoryId}))??[],affectedPaths:[...new Set(['/',...retiredPaths.map(row=>row.path),...newsRoutes(source.editorial!).map(r=>r.path),...(items.some(i=>i.kind==='NOT_FOUND')?['Все неизвестные адреса (HTTP 404)']:[])])],redirects:source.redirects.filter(a=>source.editorial!.redirectIds?.includes(a.id)).map(({sourcePath,targetPath})=>({sourcePath,targetPath}))};
  }
  async review(siteId:string,input:EditorialReleaseInput){return this.publicReview(await this.candidate(siteId,input,this.prisma))}
  async reviewBatch(siteId:string,items:unknown){return this.publicReview(await this.candidate(siteId,editorialBatchInputs(items),this.prisma))}
  async publishBatch(siteId:string,items:unknown,reviewDigest:string,operationId:string,actorId?:string){return this.publish(siteId,editorialBatchInputs(items),reviewDigest,operationId,actorId)}
  async publish(siteId:string,input:EditorialReleaseInput|EditorialReleaseInput[],reviewDigest:string,operationId:string,actorId?:string){
    if(!/^[a-f0-9]{64}$/.test(reviewDigest)||!/^[a-zA-Z0-9_-]{1,100}$/.test(operationId))throw new BadRequestException('Нужны актуальная проверка и идентификатор операции');
    const scopeKey=`editorial:${operationId}`;
    const entityId=Array.isArray(input)?'batch':input.entityId;
    const publication=await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Site" WHERE id=${siteId} FOR UPDATE`;
      const existing=await tx.sitePublication.findFirst({where:{siteId,scopeKey}});
      if(existing){if(existing.changeSetDigest!==reviewDigest)throw new ConflictException('Идентификатор операции уже использован для другого выпуска');return existing}
      const candidate=await this.candidate(siteId,input,tx,true,actorId);
      if(candidate.reviewDigest!==reviewDigest)throw new ConflictException('Состав или опубликованная версия изменились после проверки. Повторите проверку.');
      if(!candidate.validation.catalog)throw new ConflictException({message:'Публикация заблокирована. Исправьте ошибки проверки.',report:candidate.validation.report});
      const validation=await tx.sitePublicationValidation.create({data:{siteId,siteRevision:candidate.baseline.siteRevision,sourceSnapshot:json(candidate.source),report:json(candidate.validation.report),appVersion:APP_VERSION,outcome:candidate.validation.report.outcome,checkedUrlCount:candidate.validation.report.checkedUrlCount,requestedById:actorId??null}});
      return tx.sitePublication.create({data:{siteId,siteRevision:candidate.baseline.siteRevision,scopeKey,basePublicationId:candidate.baseline.id,changeSetDigest:reviewDigest,catalog:json(candidate.validation.catalog),validationId:validation.id,triggerEntity:'editorial',triggerEntityId:entityId,requestedById:actorId??null,status:'PENDING',editorialItems:{create:candidate.items.map(item=>({kind:item.kind,entityId:item.entityId,revision:item.revision,action:item.action,snapshot:item.snapshot?json(item.snapshot):Prisma.DbNull}))}}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60_000});
    const rebuild=['PENDING','RUNNING'].includes(publication.status)?await this.rebuilds.enqueue({entity:'editorial',id:entityId,siteId,publicationId:publication.id}):null;
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
    const pendingRemoval=kind==='CATEGORY'&&!!await this.prisma.editorialPublicationItem.findFirst({where:{kind:'CATEGORY',entityId:id,action:{in:['WITHDRAW','REASSIGN']},publication:{siteId,status:{in:['PENDING','RUNNING']}}},select:{id:true}});
    const categoryIds=kind==='ARTICLE'?[String((working.content as Record<string,any>).categoryId||''),String(published?.categoryId||'')].filter(Boolean):[];
    const categoryNames=Object.fromEntries((categoryIds.length?await this.prisma.newsCategory.findMany({where:{siteId,id:{in:categoryIds}},select:{id:true,name:true}}):[]).map(category=>[category.id,category.name||'Категория без названия']));
    return {...working,published:content,publishedAvailable,publishedRevision:published?.revision??null,state,publicUrl,pendingRemoval,categoryNames};
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
    const pending=await this.prisma.editorialPublicationItem.findMany({where:{kind:'CATEGORY',action:{in:['WITHDRAW','REASSIGN']},publication:{siteId,status:{in:['PENDING','RUNNING']}}},select:{entityId:true}});
    let publishedAvailable=true,live:Array<Record<string,any>>=[],categories:Array<Record<string,any>>=[],baseline:Awaited<ReturnType<typeof editorialServingSource>>['source']|null=null;
    try{baseline=(await editorialServingSource(this.prisma,site)).source;const source=baseline.editorial;live=source?.articles??[];categories=source?.categories??[]}catch{publishedAvailable=false}
    return {items:rows.map(row=>({id:row.id,name:row.name,slug:row.slug,revision:row.revision,totalCount:row._count.articles,liveCount:publishedAvailable?live.filter(a=>a.categoryId===row.id).length:null,publishedRevision:categories.find(c=>c.id===row.id)?.revision??null,publishedName:categories.find(c=>c.id===row.id)?.name??null,publicUrl:baseline?editorialLiveUrl(baseline,'CATEGORY',row.id):null,pendingRemoval:pending.some(item=>item.entityId===row.id)})),publishedAvailable};
  }
  async preview(siteId:string,kind:EditorialKind,id:string,expectedRevision:number,mode:string='draft') {
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!['draft','published'].includes(mode))throw new BadRequestException('Укажите сохранённую редакцию и режим предпросмотра.');
    const site=await this.store.requireSite(siteId),row=await this.store.read(siteId,kind,id);
    if(row.revision!==expectedRevision)throw new ConflictException('Редакция изменилась. Сохраните или обновите материал перед предпросмотром.');
    const baseline=await editorialServingSource(this.prisma,site);
    let editorial=baseline.source.editorial;
    if(mode==='draft'){
      const content=row.content as Record<string,any>;
      const category=kind==='ARTICLE'&&content.categoryId&&!editorial?.categories.some(c=>c.id===content.categoryId)?await this.store.row(siteId,'CATEGORY',content.categoryId):null;
      editorial=editorialPreviewOverlay(editorial,kind,row as typeof row&{content:Record<string,any>},category?{...category.content as object,id:category.id,revision:category.revision}:undefined);
    }
    const selected=kind==='ARTICLE'?editorial?.articles.find(a=>a.id===row.id):kind==='CATEGORY'?editorial?.categories.find(c=>c.id===row.id):kind==='NEWS_SETTINGS'?(editorial?.newsEnabled===false?null:editorial?.settings):editorial?.notFound;
    if(mode==='draft'&&selected&&!(selected.title||selected.name)?.trim())throw new BadRequestException('Добавьте заголовок или название перед предпросмотром.');
    if(kind==='ARTICLE'&&selected&&!editorial?.categories.some(c=>c.id===selected.categoryId))throw new BadRequestException('Выберите категорию перед предпросмотром.');
    if(!selected&&kind!=='NOT_FOUND')return {available:false,mode,revision:row.revision,publicationId:baseline.publication.id};
    if(editorial)editorial=await this.media.prepare(siteId,editorial);
    const mediaRequests:Record<string,string>={};
    for(const [key,variants] of Object.entries(editorial?.media??{})){
      const [assetId,mediaKind,crop]=key.split('|');const area=crop==='default'?null:JSON.parse(crop);
      const cropKey=area?mediaCropKey(mediaKind as 'cover'|'social',{x:area[0],y:area[1],width:area[2],height:area[3]}):null;
      for(const variant of variants){const query=new URLSearchParams({kind:mediaKind,variant:variant.sha256,...(cropKey?{crop:cropKey}:{})});mediaRequests[variant.src]=`/admin/sites/${encodeURIComponent(siteId)}/news/media/${encodeURIComponent(assetId)}/file?${query}`;}
    }
    return {available:true,mode,kind,entityId:row.id,revision:row.revision,selectedRevision:selected?.revision??null,publicationId:baseline.publication.id,editorial:editorial??null,mediaRequests,catalog:this.catalog.renderSource(baseline.source)};
  }
  async relatedOptions(siteId:string,query:Parameters<typeof relatedNewsOptions>[1]) {
    const site=await this.store.requireSite(siteId),baseline=await editorialServingSource(this.prisma,site);
    return relatedNewsOptions(baseline.source.editorial?.articles??[],query);
  }
}

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated';
import { PrismaService } from './prisma.service';
import { EditorialStoreService } from './editorial-store.service';
import { EditorialMediaRegistryService } from './editorial-media-registry.service';
import { editorialDigest } from './editorial-revisions';
import { validateNewsArticle, validateNewsCategory, newsSettingsDefaults } from './news-model';
type ImportInput = { sourceId:number;sourceHash:string;sourceUrl:string;category:{sourceId:number;content:Record<string,any>};content:Record<string,any> };
@Injectable()
export class NewsImportService {
  constructor(private readonly prisma:PrismaService,private readonly store:EditorialStoreService,private readonly media:EditorialMediaRegistryService){}
  async wordpress(siteId:string,input:ImportInput,actorId?:string) {
    if(!input||Object.keys(input).some(key=>!['sourceId','sourceHash','sourceUrl','category','content'].includes(key))||!Number.isSafeInteger(input.sourceId)||input.sourceId<1||!/^[a-f0-9]{64}$/.test(input.sourceHash)||!input.category||Object.keys(input.category).sort().join(',')!=='content,sourceId'||!Number.isSafeInteger(input.category.sourceId)||input.category.sourceId<1)throw new BadRequestException('Нужны sourceId, SHA256 исходника и исходная категория.');
    let url:URL;try{url=new URL(input.sourceUrl);if(url.protocol!=='https:'||url.hostname!=='tarify-dom.ru'||url.port||url.username||url.password||url.search||url.hash||url.pathname.replace(/\/+$/,'').split('/').at(-1)!==input.content?.slug||url.pathname==='/akcii-domru')throw Error()}catch{throw new BadRequestException('Нужен исходный адрес статьи tarify-dom.ru с сохранённым слагом.');}
    validateNewsCategory(input.category.content);
    if(['page','category'].includes(input.content?.slug))throw new ConflictException('Исходный слаг зарезервирован разделом новостей.');
    const id=`edwp_${editorialDigest({siteId,sourceId:input.sourceId}).slice(0,40)}`;
    try{return await this.prisma.$transaction(async tx=>{
      await this.store.requireSite(siteId,tx);await tx.$queryRaw`SELECT id FROM "Site" WHERE id=${siteId} FOR UPDATE`;
      const existing=await tx.newsArticle.findUnique({where:{siteId_sourceId:{siteId,sourceId:input.sourceId}}});
      if(existing){
        if(existing.sourceHash!==input.sourceHash)throw new ConflictException({reason:'SOURCE_CHANGED',message:'Исходник изменился после переноса. Автоматическая перезапись черновика запрещена; сравните материалы вручную.'});
        return {status:existing.archivedAt?'SKIPPED_ARCHIVED':'SKIPPED_IDENTICAL',id:existing.id,revision:existing.revision,sourceId:input.sourceId,sourceHash:existing.sourceHash,publishedRevision:existing.publishedRevision};
      }
      if(await tx.newsArticle.findUnique({where:{siteId_slug:{siteId,slug:input.content.slug}}}))throw new ConflictException('Слаг уже занят другой новостью. Нужна ручная проверка дубля.');
      let category=await tx.newsCategory.findUnique({where:{siteId_sourceId:{siteId,sourceId:input.category.sourceId}}});
      if(category?.archivedAt)throw new ConflictException('Исходная категория удалена. Выберите перенос вручную.');
      if(category&&await tx.editorialPublicationItem.findFirst({where:{kind:'CATEGORY',entityId:category.id,action:{in:['WITHDRAW','REASSIGN']},publication:{siteId,status:{in:['PENDING','RUNNING']}}},select:{id:true}}))throw new ConflictException('Категория готовится к удалению. Перенос остановлен без создания статьи.');
      if(!category){
        if(await tx.newsCategory.findUnique({where:{siteId_slug:{siteId,slug:input.category.content.slug}}}))throw new ConflictException('Слаг категории уже занят. Сопоставьте категории перед повтором импорта.');
        const categoryId=`edwpc_${editorialDigest({siteId,sourceId:input.category.sourceId}).slice(0,40)}`;
        category=await tx.newsCategory.create({data:{id:categoryId,siteId,sourceId:input.category.sourceId,name:input.category.content.name,slug:input.category.content.slug,content:input.category.content as Prisma.InputJsonValue,revision:1}});
        await tx.editorialRevision.create({data:{siteId,kind:'CATEGORY',entityId:category.id,revision:1,snapshot:input.category.content as Prisma.InputJsonValue,digest:editorialDigest(input.category.content),checkpoint:true,actorId:actorId??null}});
      }
      const content:Record<string,any>={...input.content,categoryId:category.id};const missingFields=validateNewsArticle(content,true,id);
      await this.media.prepare(siteId,{version:'1.0.0',articles:[content],categories:[],settings:newsSettingsDefaults(),notFound:null});
      const article=await tx.newsArticle.create({data:{id,siteId,sourceId:input.sourceId,sourceHash:input.sourceHash,sourceUrl:url.href,slug:content.slug,title:content.title,summary:content.summary,categoryId:category.id,publishedDate:new Date(content.publishedDate),content:content as Prisma.InputJsonValue,revision:1}});
      await tx.editorialRevision.create({data:{siteId,kind:'ARTICLE',entityId:id,revision:1,snapshot:content as Prisma.InputJsonValue,digest:editorialDigest(content),checkpoint:true,actorId:actorId??null}});
      return {status:'IMPORTED_DRAFT',id:article.id,revision:article.revision,sourceId:input.sourceId,sourceHash:input.sourceHash,publishedRevision:null,categoryId:category.id,missingFields,pendingRedirect:{sourcePath:url.pathname.replace(/\/+$/,'')||'/',targetPath:`/news/${content.slug}`,active:false}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});}
    catch(error){if(error&&typeof error==='object'&&'code'in error&&['P2002','P2034'].includes(String(error.code)))throw new ConflictException('Параллельный перенос или занятый адрес. Повторите после проверки списка.');throw error}
  }
}

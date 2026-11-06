import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated';
import { EditorialStoreService, editorialMissing, type EditorialRow } from './editorial-store.service';
import { editorialCategoryPlan } from './editorial-category-plan';
import type { EditorialSource, EditorialChange } from './editorial-publication-model';
import type { PrismaService } from './prisma.service';

export async function prepareCategoryRetirement(tx:Prisma.TransactionClient|PrismaService,store:EditorialStoreService,siteId:string,category:EditorialRow,targetId:string|null,live:EditorialSource|undefined) {
  const rows=await tx.newsArticle.findMany({where:{siteId,archivedAt:null},select:{id:true,revision:true,content:true}});
  let plan:ReturnType<typeof editorialCategoryPlan>;
  try{plan=editorialCategoryPlan(category.id,targetId,rows.map(row=>({...row,content:row.content as Record<string,any>})),live?.articles??[])}catch(error){throw new BadRequestException(error instanceof Error?error.message:'Не удалось подготовить перенос')}
  const dependencies:EditorialChange[]=[],items:EditorialChange[]=[];let targetName:string|null=null;
  if(targetId){
    const target=await store.row(siteId,'CATEGORY',targetId,tx);
    if(!target)throw new BadRequestException('Категория для переноса не найдена на этом сайте.');
    targetName=String(live?.categories.find(c=>c.id===targetId)?.name||(target.content as Record<string,any>).name||'Категория без названия');
    const pending=await tx.editorialPublicationItem.findFirst({where:{kind:'CATEGORY',entityId:targetId,action:{in:['WITHDRAW','REASSIGN']},publication:{siteId,status:{in:['PENDING','RUNNING']}}}});
    if(pending)throw new ConflictException('Категория для переноса уже готовится к удалению.');
    if(plan.patches.some(patch=>patch.liveContent)&&!live?.categories.some(c=>c.id===targetId)){
      editorialMissing('CATEGORY',target.content,false,target.id);
      dependencies.push({kind:'CATEGORY',entityId:target.id,revision:target.revision,action:'PUBLISH',snapshot:{...target.content as Record<string,any>,id:target.id,revision:target.revision}});
    }
  }
  for(const patch of plan.patches){
    if(patch.liveContent){
      editorialMissing('ARTICLE',patch.liveContent,false,patch.id);
      const previous=live!.articles.find(a=>a.id===patch.id)!;
      items.push({kind:'ARTICLE',entityId:patch.id,revision:patch.liveRevision!,action:'PUBLISH',snapshot:{...patch.liveContent,id:patch.id,revision:patch.liveRevision,dateModified:previous.dateModified??previous.publishedDate}});
    }else items.push({kind:'ARTICLE',entityId:patch.id,revision:patch.workingRevision,action:'REASSIGN',snapshot:{...patch.workingContent,draftOnly:true}});
  }
  return {plan,dependencies,items,targetName};
}

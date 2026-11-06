import { newsDraft, type NewsArticleContent } from './news-types';
type WorkingArticle={id:string;revision:number;content:Record<string,any>};
export type EditorialCategoryPatch={id:string;expectedRevision:number;liveRevision:number|null;liveContent:NewsArticleContent|null;workingRevision:number;workingContent:NewsArticleContent};
/** A live metadata patch and a carried-forward draft own different revisions. */
export function editorialCategoryPlan(sourceId:string,targetId:string|null,working:WorkingArticle[],live:Array<Record<string,any>>) {
  if(sourceId===targetId)throw new Error('Выберите другую категорию для переноса.');
  const rows=new Map(working.map(row=>[row.id,row]));
  if(rows.size!==working.length)throw new Error('Рабочие материалы содержат повторяющиеся идентификаторы.');
  const affected=[...new Set([...working.filter(row=>row.content.categoryId===sourceId).map(row=>row.id),...live.filter(row=>row.categoryId===sourceId).map(row=>String(row.id))])].sort();
  if(affected.length&&!targetId)throw new Error('Перед удалением категории нужен перенос всех её материалов.');
  const keys=Object.keys(newsDraft());
  const clean=(value:Record<string,any>)=>structuredClone(Object.fromEntries(keys.map(key=>[key,value[key]]))) as NewsArticleContent;
  const patches:EditorialCategoryPatch[]=affected.map(id=>{
    const row=rows.get(id);if(!row)throw new Error('Не найдена рабочая запись опубликованного материала. Перенос остановлен.');
    const published=live.find(article=>article.id===id&&article.categoryId===sourceId),workingContent=clean(row.content);
    if(workingContent.categoryId===sourceId)workingContent.categoryId=targetId!;
    const liveContent=published?clean(published):null;if(liveContent)liveContent.categoryId=targetId!;
    return {id,expectedRevision:row.revision,liveRevision:published?row.revision+1:null,liveContent,workingRevision:row.revision+(published?2:1),workingContent};
  });
  return {sourceId,targetId,patches};
}

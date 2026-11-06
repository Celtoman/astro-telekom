import type { EditorialSource } from './editorial-publication-model';
import { newsRoutes } from './news-projection';
import type { Prisma } from '../generated';
type OwnedAlias={id:string;sourcePath:string;targetPath:string;managedEditorialKey:string|null;managedEditorialReleaseSequence:number|null};
type CategoryTransfer={sourceId:string;targetId:string;releaseSequence:number};
export async function confirmedEditorialTransfers(client:Pick<Prisma.TransactionClient,'editorialPublicationItem'>,siteId:string,servingPublicationId?:string):Promise<CategoryTransfer[]> {
  const publication:Prisma.SitePublicationWhereInput={siteId,...(servingPublicationId?{OR:[{status:'SUCCEEDED'},{id:servingPublicationId}]}:{status:'SUCCEEDED'})};
  const rows=await client.editorialPublicationItem.findMany({where:{kind:'CATEGORY',action:'REASSIGN',publication},orderBy:{publication:{releaseSequence:'asc'}},select:{entityId:true,snapshot:true,publication:{select:{releaseSequence:true}}}});
  return rows.flatMap(row=>{const snapshot=row.snapshot as Record<string,unknown>|null;return typeof snapshot?.targetCategoryId==='string'?[{sourceId:row.entityId,targetId:snapshot.targetCategoryId,releaseSequence:row.publication.releaseSequence}]:[]});
}
export function remapEditorialAliasOwners(rows:OwnedAlias[],transfers:CategoryTransfer[]) {
  return rows.map(original=>{const row={...original};for(const transfer of transfers)if(row.managedEditorialKey===`CATEGORY:${transfer.sourceId}`&&row.managedEditorialReleaseSequence!==null&&row.managedEditorialReleaseSequence<transfer.releaseSequence){row.managedEditorialKey=`CATEGORY:${transfer.targetId}`;row.managedEditorialReleaseSequence=transfer.releaseSequence}return row});
}
function destinations(editorial:EditorialSource) {
  const owners=new Map<string,string>(),roots=new Map<string,string>();
  for(const route of newsRoutes(editorial)){
    if(route.kind==='NEWS_ARTICLE'){
      const article=editorial.articles.find(a=>a.slug===route.newsSlug)!;owners.set(route.path,`ARTICLE:${article.id}`);roots.set(`ARTICLE:${article.id}`,route.path);
    }else if(route.kind==='NEWS_CATEGORY'){
      const category=editorial.categories.find(c=>c.slug===route.categorySlug)!;owners.set(route.path,`CATEGORY:${category.id}`);if(route.page===1)roots.set(`CATEGORY:${category.id}`,route.path);
    }else{owners.set(route.path,'NEWS_SETTINGS');if(route.page===1)roots.set('NEWS_SETTINGS',route.path)}
  }
  return {owners,roots};
}
/** Failed/pending rows are reservations, never evidence of an approved 301. */
export function restoreEditorialAliases(editorial:EditorialSource,rows:OwnedAlias[]) {
  const {owners,roots}=destinations(editorial),result:Array<{id:string;sourcePath:string;targetPath:string}>=[];
  for(const row of rows){
    if(row.managedEditorialReleaseSequence===null||!row.managedEditorialKey||owners.has(row.sourcePath))continue;
    const root=roots.get(row.managedEditorialKey);if(!root)continue;
    const suffix=row.managedEditorialKey.startsWith('CATEGORY:')||row.managedEditorialKey==='NEWS_SETTINGS'?row.targetPath.match(/\/page\/([1-9]\d*)$/)?.[0]??'':'';
    const targetPath=root+suffix;
    if(owners.has(targetPath)&&row.sourcePath!==targetPath)result.push({id:row.id,sourcePath:row.sourcePath,targetPath});
  }
  return result;
}
export function acknowledgedEditorialAliases(catalog:Record<string,any>) {
  const editorial=catalog.editorial as EditorialSource|undefined;if(!editorial)return [];
  const ids=new Set(editorial.redirectIds??[]),{owners}=destinations(editorial);
  return (catalog.redirects??[]).filter((row:any)=>ids.has(row.id)&&owners.has(row.targetPath)).map((row:any)=>({id:String(row.id),targetPath:String(row.targetPath),managedEditorialKey:owners.get(row.targetPath)!})) as Array<{id:string;targetPath:string;managedEditorialKey:string}>;
}

/** Explain disappearing public URLs before a selected release. */
export function retiredEditorialPaths(before:EditorialSource|undefined,previousAliases:Array<{id:string;sourcePath:string;targetPath:string}>,after:EditorialSource,nextAliases:Array<{id:string;sourcePath:string;targetPath:string}>) {
  const paths=new Set(newsRoutes(after).map(route=>route.path));
  const owned=new Set(before?.redirectIds??[]),previous=new Set([...(before?newsRoutes(before).map(route=>route.path):[]),...previousAliases.filter(alias=>owned.has(alias.id)).map(alias=>alias.sourcePath)]);
  const redirects=new Map(nextAliases.map(alias=>[alias.sourcePath,alias.targetPath]));
  return [...previous].filter(path=>!paths.has(path)).sort().map(path=>{const targetPath=redirects.get(path);return targetPath?{path,status:301 as const,targetPath}:{path,status:404 as const}});
}

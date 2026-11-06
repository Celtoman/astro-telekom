import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv,isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {newsSourceInventory,wordpressNewsDraft,wordpressNewsBody} from './lib/wordpress-news.mjs';
const sourceOrigin='https://tarify-dom.ru',sourceHeaders={'user-agent':'AstroTelekom-Migration/1.0'};
function option(args,name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1]}
function importTarget(apiUrl,siteId,backupProof){
 const url=new URL(apiUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.protocol==='http:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Нужен HTTPS API или изолированный localhost');
 if(!siteId)throw Error('Укажите siteId');if(!['127.0.0.1','localhost'].includes(url.hostname)&&(!backupProof?.editorialMediaCovered||!backupProof?.restoreVerified||backupProof.apiOrigin!==url.origin))throw Error('Внешний перенос требует проверенный backup/restore нового media volume');return url;
}
async function jsonFile(path){return JSON.parse(await readFile(path,'utf8'))}
export async function fetchWordpressCollection(kind,fetchImpl=fetch){
 const items=[];let total=null,totalPages=null;
 for(let page=1;page<1001;page++){
  const response=await fetchImpl(`${sourceOrigin}/wp-json/wp/v2/${kind}?per_page=100&page=${page}${kind==='posts'?'&_embed=1':''}`,{headers:sourceHeaders,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`Источник ${kind}: HTTP ${response.status}`);
  const rows=await response.json();if(!Array.isArray(rows))throw Error('Источник не вернул коллекцию');
  const count=Number(response.headers.get('x-wp-total')),pages=Number(response.headers.get('x-wp-totalpages'));if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(pages)||pages<1)throw Error('Источник не подтвердил полное число страниц');
  if(total!==null&&(total!==count||totalPages!==pages))throw Error('Источник изменился во время обхода');total=count;totalPages=pages;items.push(...rows);
  if(page===pages){if(items.length!==total)throw Error('Не все исходные записи получены');return {items,total,totalPages,exhausted:true}}
 }
 throw Error('Превышен предел обхода источника');
}
async function sourceImage(url,fetchImpl=fetch){
 let current=new URL(url);
 for(let attempt=0;attempt<4;attempt++){
  if(current.protocol!=='https:'||current.hostname!=='tarify-dom.ru'||current.port||current.username||current.password||!current.pathname.startsWith('/wp-content/uploads/'))throw Error('Изображение вне разрешённого источника');
  const response=await fetchImpl(current,{headers:sourceHeaders,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('Пустое перенаправление изображения');current=new URL(location,current);continue}
  const mime=(response.headers.get('content-type')??'').split(';')[0];if(!response.ok||!['image/jpeg','image/png','image/webp'].includes(mime))throw Error(`Изображение: HTTP ${response.status} или неверный формат`);
  const size=Number(response.headers.get('content-length'));if(size>10*1024*1024)throw Error('Изображение больше10МБ');const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>10*1024*1024)throw Error('Изображение больше10МБ');chunks.push(chunk)}
  return {buffer:Buffer.concat(chunks),mime,url:current.href};
 }
 throw Error('Слишком много перенаправлений изображения');
}
export async function runNewsImport({posts,categories,apiUrl,siteId,headers={},apply=false,backupProof,reportDirectory,fetchImpl=fetch}){
 const inventory=newsSourceInventory(posts),category=categories.find(item=>item.id===62);
 if(!category)throw Error('Исходная категория62 не найдена');
 if(apply)importTarget(apiUrl,siteId,backupProof);
 const map=new Map(inventory.eligible.map(post=>[new URL(post.link).pathname.replace(/\/+$/,''),`/news/${post.slug}`]));map.set('/category/'+category.slug,`/news/category/${category.slug}`);
 const report={version:1,checkedAt:new Date().toISOString(),mode:apply?'APPLY_DRAFTS':'DRY_RUN',source:sourceOrigin,siteId:siteId??null,fetched:inventory.fetched,eligible:inventory.eligible.length,excluded:inventory.excluded,unresolved:[...inventory.unresolved],inventoryUnresolved:inventory.unresolved.length,requiresOwnerReview:true,imported:0,skipped:0,failed:0,ready:0,readbackFailed:0,rows:[],publicationAttempted:false};
 const checkpoint=async()=>{if(reportDirectory){await writeFile(resolve(reportDirectory,'report.json.tmp'),JSON.stringify(report,null,2)+'\n');await rename(resolve(reportDirectory,'report.json.tmp'),resolve(reportDirectory,'report.json'));}};
 if(reportDirectory){const privateRoot=resolve('.codex-tmp');if(!resolve(reportDirectory).startsWith(privateRoot+sep))throw Error('Сырые исходники и отчёт храните только в .codex-tmp');await mkdir(reportDirectory,{recursive:true});await writeFile(resolve(reportDirectory,'source-posts.json'),JSON.stringify(posts,null,2));await writeFile(resolve(reportDirectory,'source-categories.json'),JSON.stringify(categories,null,2));await checkpoint();}
 const api=async(path,{method='GET',body}={})=>{const response=await fetchImpl(apiUrl.replace(/\/$/,'')+path,{method,headers:{...headers,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(`API ${response.status}: ${typeof data.message==='string'?data.message:'операция не выполнена'}`)}return response.json()};
 let before;if(apply)before=await api(`/admin/sites/${encodeURIComponent(siteId)}/publication-state`);
 for(const post of inventory.eligible){
  const record={sourceId:post.id,sourceUrl:post.link,targetPath:`/news/${post.slug}`,slug:post.slug,publishedDate:post.date_gmt+'Z',images:[],issues:[],status:'READY'};report.rows.push(record);
  try{
   const media=new Map();let cover=null;const featured=post._embedded?.['wp:featuredmedia']?.[0];const bodyImages=wordpressNewsBody(post.content?.rendered,{urlMap:map}).images;
   const uses=[...(featured?.source_url?[{src:featured.source_url,alt:featured.alt_text??'',cover:true}]:[]),...bodyImages.map(image=>({...image,cover:false}))];
   for(const use of uses){
    if(!use.alt.trim())throw Error('У исходного изображения нет описания: требуется ручная проверка');
    if(apply){const original=await sourceImage(use.src,fetchImpl);const form=new FormData();form.append('file',new Blob([original.buffer],{type:original.mime}),new URL(use.src).pathname.split('/').at(-1));const uploaded=await api(`/admin/sites/${encodeURIComponent(siteId)}/news/media`,{method:'POST',body:form});const value={assetId:uploaded.id,alt:use.alt,decorative:false};if(use.cover)cover=value;else media.set(use.src,value);record.images.push({source:use.src,assetId:uploaded.id,status:'UPLOADED',width:uploaded.width,height:uploaded.height,sha256:createHash('sha256').update(original.buffer).digest('hex')});}
    else {record.images.push({source:use.src,alt:use.alt,status:'PENDING_UPLOAD'});if(!use.cover)media.set(use.src,{assetId:'pending-source-image',alt:use.alt,decorative:false});}
   }
   const draft=wordpressNewsDraft(post,category,{urlMap:map,media,cover});record.sourceHash=draft.sourceHash;record.issues=draft.issues;
   const blocking=draft.issues.filter(issue=>issue.reason!=='unmapped_internal_link');
   if(blocking.length){record.status='REQUIRES_REVIEW';report.failed++;continue}
   if(draft.issues.length){record.requiresReview=true;record.status='READY_WITH_NOTES';report.unresolved.push(...draft.issues.map(issue=>({sourceId:post.id,...issue})));}
   if(!apply)report.ready++;
   if(apply){const {issues:_issues,...input}=draft;const result=await api(`/admin/sites/${encodeURIComponent(siteId)}/news/imports/wordpress`,{method:'POST',body:input});Object.assign(record,{status:result.status,id:result.id,revision:result.revision,pendingRedirect:result.pendingRedirect});if(result.status==='IMPORTED_DRAFT')report.imported++;else report.skipped++;
    if(result.status==='SKIPPED_ARCHIVED')record.readback='ARCHIVED_PRESERVED';else{const readback=await api(`/admin/sites/${encodeURIComponent(siteId)}/news/${encodeURIComponent(result.id)}`);if(readback.revision!==result.revision||result.status==='IMPORTED_DRAFT'&&(!isDeepStrictEqual(readback.content,{...draft.content,categoryId:result.categoryId})||readback.published!==null||readback.publishedRevision!==null))throw Error('Readback перенесённой новости не подтвердил сохранённый текст, изображения и редакцию');record.readback=true;record.preservedOwnerChanges=result.status==='SKIPPED_IDENTICAL'&&(result.revision>1||result.publishedRevision!==null);}
   }
  }catch(error){if(record.id){record.status=record.status==='IMPORTED_DRAFT'?'IMPORTED_REQUIRES_REVIEW':'SKIPPED_REQUIRES_REVIEW';report.readbackFailed++;}else{record.status='FAILED';report.failed++;}record.error=error.message;}
  finally{await checkpoint()}
 }
 if(apply){report.before={workingRevision:before.workingRevision,publishedRevision:before.publishedRevision,publicationId:before.latestPublication?.id};try{const after=await api(`/admin/sites/${encodeURIComponent(siteId)}/publication-state`);report.unchangedPublication=before.workingRevision===after.workingRevision&&before.publishedRevision===after.publishedRevision&&before.latestPublication?.id===after.latestPublication?.id;report.after={workingRevision:after.workingRevision,publishedRevision:after.publishedRevision,publicationId:after.latestPublication?.id};if(!report.unchangedPublication)report.publicationCheckError='Во время переноса изменился обслуживаемый выпуск: нужна сверка.';}catch(error){report.unchangedPublication=null;report.publicationCheckError=error.message;}}
 report.requiresReview=report.failed>0||report.readbackFailed>0||report.unresolved.length>0||apply&&report.unchangedPublication!==true;
 if(reportDirectory){await mkdir(reportDirectory,{recursive:true});await writeFile(resolve(reportDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(resolve(reportDirectory,'source-posts.json'),JSON.stringify(posts,null,2));await writeFile(resolve(reportDirectory,'source-categories.json'),JSON.stringify(categories,null,2));}
 return report;
}
export async function main(args=process.argv.slice(2)){
 const reportDirectory=resolve(option(args,'--report-dir','.codex-tmp/news-import-'+Date.now())),postsFile=option(args,'--posts-file'),categoriesFile=option(args,'--categories-file');
 const collection=postsFile?{items:await jsonFile(postsFile),exhausted:null}:await fetchWordpressCollection('posts'),taxonomy=categoriesFile?{items:await jsonFile(categoriesFile),exhausted:null}:await fetchWordpressCollection('categories');
 const proofFile=option(args,'--media-backup-proof'),backupProof=proofFile?await jsonFile(proofFile):null;
 const apply=args.includes('--apply'),apiUrl=option(args,'--api-url',process.env.NEWS_IMPORT_API_URL),siteId=option(args,'--site-id',process.env.NEWS_IMPORT_SITE_ID);let headers={};
 if(apply){importTarget(apiUrl,siteId,backupProof);const credentialsPath=option(args,'--credentials-file');const credentials=credentialsPath?parseEnv(await readFile(credentialsPath,'utf8')):process.env;const email=credentials.NEWS_IMPORT_ADMIN_EMAIL??credentials.ADMIN_EMAIL,password=credentials.NEWS_IMPORT_ADMIN_PASSWORD??credentials.ADMIN_PASSWORD;if(!email||!password)throw Error('Для записи нужен существующий аккаунт администратора');if(credentials.BASIC_AUTH_USERNAME&&credentials.BASIC_AUTH_PASSWORD)headers.authorization='Basic '+Buffer.from(`${credentials.BASIC_AUTH_USERNAME}:${credentials.BASIC_AUTH_PASSWORD}`).toString('base64');const response=await fetch(apiUrl.replace(/\/$/,'')+'/auth/login',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`Вход администратора: HTTP ${response.status}`);const cookie=response.headers.get('set-cookie');if(!cookie?.includes('HttpOnly'))throw Error('Cookie-сессия не подтверждена');headers.cookie=cookie.split(';')[0];}
 const report=await runNewsImport({posts:collection.items,categories:taxonomy.items,apiUrl,siteId,headers,apply,backupProof,reportDirectory});report.sourcePagination={postsExhausted:collection.exhausted,categoriesExhausted:taxonomy.exhausted,sourceFiles:!!postsFile};await writeFile(resolve(reportDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({reportDirectory,fetched:report.fetched,eligible:report.eligible,excluded:report.excluded.length,imported:report.imported,skipped:report.skipped,failed:report.failed,unresolved:report.unresolved.length,publicationAttempted:false}));if(report.failed||report.readbackFailed||report.inventoryUnresolved||apply&&report.unchangedPublication!==true)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1});

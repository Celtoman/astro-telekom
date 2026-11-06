import { editorialErrorMessage } from '../lib/editorial-errors.mjs'
import { useEffect, useRef, useState } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import type { PublicationValidationReport } from '../../../api/src/publication-validation'
import { AdminApiError, requestJson } from '../lib/admin-api.mjs'
import { editorialFingerprint } from '../lib/editorial-autosave.mjs'
import { editorialOperationState, type EditorialOperation } from '../lib/editorial-review.mjs'
import type { PublicationState } from '../lib/publication-display.mjs'
import { useEditorialDraft } from './useEditorialDraft'
import { editorialModal, editorialOverlay } from './EditorialDraftTools'
import { PublicationProgress } from './PublicationProgress'
import { PublicationIssueCard } from './PublicationIssueCard'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
type ReleaseAction='PUBLISH'|'WITHDRAW'|'REASSIGN'
type ReleaseRequest={operationId:string;expectedRevision:number;reviewDigest:string;action:ReleaseAction;targetCategoryId?:string}
interface Review {retiredPaths?:Array<{path:string;status:301|404;targetPath?:string}>;retirementTarget?:string|null;ready:boolean;reviewDigest:string;items:Array<{kind:string;entityId:string;revision:number;action:string;title:string;draftOnly?:boolean}>;draftChanges?:Array<{entityId:string;title:string;previousRevision:number;revision:number}>;affectedPaths:string[];redirects:Array<{sourcePath:string;targetPath:string}>;report:PublicationValidationReport}
export function EditorialRelease<T extends {version:string}>({apiUrl,userId,siteId,draft,disabled=false,withdraw=false,retire,onCompleted,onPendingChange}:{apiUrl:string;userId:string;siteId:string;draft:ReturnType<typeof useEditorialDraft<T>>;disabled?:boolean;withdraw?:boolean;retire?:{hasReferences:boolean;targetCategoryId?:string};onCompleted?:(action:ReleaseAction,status:string)=>void;onPendingChange?:(pending:boolean,action:ReleaseAction|undefined)=>void}) {
  const [requestedAction,setRequestedAction]=useState<ReleaseAction>('PUBLISH')
  const [open,setOpen]=useState(false),[review,setReview]=useState<(Review&{fingerprint:string;revision:number;action:ReleaseAction;targetCategoryId?:string})|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [pending,setPending]=useState<ReleaseRequest|null>(null),[operation,setOperation]=useState<EditorialOperation|null>(null),[global,setGlobal]=useState<PublicationState|null>(null),[unavailable,setUnavailable]=useState(false)
  const key=`admin:editorial:operation:${userId}:${siteId}:${draft.endpoint}`,terminal=useRef(''),completed=useRef(onCompleted),pendingChanged=useRef(onPendingChange);completed.current=onCompleted;pendingChanged.current=onPendingChange
  useEffect(()=>{setPending(null);setOperation(null);setGlobal(null);terminal.current='';try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&typeof value.operationId==='string'&&/^[a-f0-9]{64}$/.test(value.reviewDigest)&&Number.isSafeInteger(value.expectedRevision))setPending(value)}catch{}},[key])
  useEffect(()=>{
    if(!pending)return;let active=true,timer:number|undefined
    async function poll(){
      try {
        const result=await requestJson<EditorialOperation>(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/news/publications/${encodeURIComponent(pending!.operationId)}`)
        if(!active)return;setOperation(result);setUnavailable(false)
        try{const state=await requestJson<PublicationState>(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/publication-state`);if(active)setGlobal(state)}catch{/* Operation still supplies an honest coarse status. */}
        if(!active)return
        if(['SUCCEEDED','FAILED','CANCELLED'].includes(result.status)) {
          if(terminal.current!==result.id){terminal.current=result.id;try{localStorage.removeItem(key)}catch{};void draft.refreshPublished().catch(()=>undefined);window.dispatchEvent(new Event('admin:publication-changed'));completed.current?.(pending!.action,result.status)}
          return
        }
      }catch{if(active)setUnavailable(true)}
      if(active)timer=window.setTimeout(()=>void poll(),2500)
    }
    void poll();return()=>{active=false;window.clearTimeout(timer)}
  },[apiUrl,siteId,key,pending])
  const inProgress=!!pending&&(!operation||['PENDING','RUNNING'].includes(operation.status))
  useEffect(()=>{pendingChanged.current?.(inProgress,pending?.action)},[inProgress,pending?.action])
  const stale=!!review&&(review.fingerprint!==editorialFingerprint(draft.content)||review.action==='REASSIGN'&&review.targetCategoryId!==retire?.targetCategoryId)
  async function check(action:ReleaseAction){
    setRequestedAction(action);setOpen(true);setBusy(true);setError('');setReview(null)
    try{const saved=await draft.flush(),targetCategoryId=action==='REASSIGN'?retire?.targetCategoryId:undefined;const result=await requestJson<Review>(apiUrl,`${draft.endpoint}/review`,{method:'POST',body:{expectedRevision:saved.revision,action,...(targetCategoryId?{targetCategoryId}:{})}});setReview({...result,fingerprint:saved.fingerprint,revision:saved.revision,action,targetCategoryId})}
    catch(error){setError(editorialErrorMessage(error,'Проверка недоступна. Текст остаётся в черновике.'))}
    finally{setBusy(false)}
  }
  async function send(request:ReleaseRequest){
    setBusy(true);setError('')
    try{await requestJson(apiUrl,`${draft.endpoint}/publish`,{method:'POST',body:request});setOpen(false);setUnavailable(false)}
    catch(error){
      if(error instanceof AdminApiError&&[400,401,403,404,409,422].includes(error.status)){setPending(null);setOperation(null);try{localStorage.removeItem(key)}catch{};setError(error.message);setReview(null)}
      else{setError(`${editorialErrorMessage(error,'Связь прервана.')} Проверяем результат по прежнему идентификатору операции.`);setUnavailable(true)}
    }
    finally{setBusy(false)}
  }
  async function publish(){if(!review||stale)return;const request:ReleaseRequest={operationId:crypto.randomUUID(),expectedRevision:review.revision,reviewDigest:review.reviewDigest,action:review.action,...(review.targetCategoryId?{targetCategoryId:review.targetCategoryId}:{})};try{localStorage.setItem(key,JSON.stringify(request))}catch{};setOperation(null);setPending(request);await send(request)}
  return <><div className="flex flex-wrap gap-2 [&_button]:min-h-11 sm:[&_button]:min-h-9"><Button type="button" disabled={disabled||busy||inProgress} onClick={()=>void check('PUBLISH')}>Проверить и опубликовать</Button>{withdraw&&<Button type="button" variant="outline" disabled={disabled||busy||inProgress} onClick={()=>void check('WITHDRAW')}>Снять с публикации</Button>}{retire&&<Button type="button" variant="outline" disabled={disabled||busy||inProgress||retire.hasReferences&&!retire.targetCategoryId} onClick={()=>void check(retire.hasReferences?'REASSIGN':'WITHDRAW')}>Проверить удаление категории</Button>}</div>
    {pending&&<section aria-label="Результат выпуска" className="w-full space-y-3">{operation?<><p role="status" className="text-sm">{operation.status==='SUCCEEDED'?'Изменение опубликовано.':operation.status==='FAILED'?'Выпуск не завершён. Проверьте причину перед новой попыткой.':operation.status==='CANCELLED'?'Выпуск отменён.':'Публикация выполняется. Можно продолжать редактировать следующий черновик.'}</p><PublicationProgress state={editorialOperationState(siteId,operation,global)} unavailable={unavailable}/>{operation.lastError&&<p role="alert" className="break-words text-sm text-destructive">{operation.lastError}</p>}</>:<p role="status" className="text-sm">Проверяем результат публикации…</p>}{unavailable&&inProgress&&<Alert><AlertDescription>Результат пока не подтверждён. Проверка продолжается. Повторный запрос использует ту же операцию и не создаёт новый выпуск. <Button type="button" variant="link" disabled={busy} onClick={()=>void send(pending)}>Повторить запрос</Button></AlertDescription></Alert>}</section>}
    <ModalOverlay isOpen={open} onOpenChange={value=>{if(!busy)setOpen(value)}} isDismissable={!busy} className={editorialOverlay}><Modal className={editorialModal}><Dialog className="space-y-5 outline-none"><Heading slot="title" className="text-lg font-semibold">{requestedAction!=='PUBLISH'&&retire?'Удалить категорию':requestedAction==='WITHDRAW'?'Снять новость с сайта':'Проверка перед публикацией'}</Heading>{busy&&<p role="status">Проверяем сохранённую редакцию…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{review&&<><p className="text-sm text-muted-foreground">В выпуск войдут только перечисленные изменения. Другие рабочие материалы сайта останутся черновиками.</p>{review.action==='WITHDRAW'&&!retire&&<Alert variant="destructive"><AlertDescription>Материал исчезнет из списка, категорий, главной и подборок. Его адрес вернёт 404. Черновик и история сохранятся для повторной публикации.</AlertDescription></Alert>}{retire&&review.action!=='PUBLISH'&&<Alert><AlertDescription>Категория исчезнет из справочника после подтверждения выпуска. {review.retirementTarget&&<>Материалы перейдут в категорию «{review.retirementTarget}». </>}При переносе опубликованные тексты сохранятся, а категория изменится отдельно. Рабочие тексты не будут опубликованы.</AlertDescription></Alert>}<ul className="divide-y rounded-lg border">{review.items.map(item=><li key={`${item.kind}:${item.entityId}`} className="break-words p-3 text-sm"><strong>{item.title}</strong> · редакция {item.revision}{item.kind==='CATEGORY'?' · категория':''}{item.draftOnly?' · только рабочий черновик':item.action==='REASSIGN'?' · перенос материалов':item.action==='WITHDRAW'?(item.kind==='CATEGORY'?' · удаление категории':' · снятие с сайта'):''}</li>)}</ul>{!!review.draftChanges?.length&&<details className="text-sm"><summary className="cursor-pointer py-2">Изменения рабочих черновиков ({review.draftChanges.length})</summary><p className="my-2 text-muted-foreground">Сохраняются отдельные рабочие редакции. Незавершённые тексты останутся черновиками.</p><ul className="space-y-1">{review.draftChanges.map(item=><li key={item.entityId} className="break-words">{item.title} · {item.previousRevision} → {item.revision}</li>)}</ul></details>}<details className="text-sm"><summary className="cursor-pointer py-2">Затронутые адреса ({review.affectedPaths.length})</summary><ul className="max-h-48 space-y-1 overflow-y-auto">{review.affectedPaths.map(path=><li key={path} className="break-all">{path}</li>)}</ul></details>{Boolean(review.retiredPaths?.length)&&<details className="text-sm"><summary className="cursor-pointer py-2">Прежние адреса после выпуска ({review.retiredPaths!.length})</summary><ul className="max-h-48 space-y-2 overflow-y-auto">{review.retiredPaths!.map(row=><li key={row.path} className="break-all">{row.path} — {row.status===301?`301 → ${row.targetPath}`:"404 · страница станет недоступна"}</li>)}</ul></details>}{review.redirects.length>0&&<details className="text-sm"><summary className="cursor-pointer py-2">Перенаправления ({review.redirects.length})</summary><ul className="max-h-48 overflow-y-auto">{review.redirects.map(alias=><li key={alias.sourcePath} className="break-all">{alias.sourcePath} → {alias.targetPath}</li>)}</ul></details>}{review.report.issues.length>0&&<ul className="space-y-3">{review.report.issues.map((issue,index)=><PublicationIssueCard key={index} issue={issue} siteId={siteId}/>)}</ul>}{stale&&<Alert variant="destructive"><AlertDescription>Черновик изменился после проверки. Повторите её перед публикацией.</AlertDescription></Alert>}<div className="flex flex-wrap gap-2"><Button type="button" disabled={busy||!review.ready||stale||inProgress} onClick={()=>void publish()}>{retire&&review.action!=='PUBLISH'?'Подтвердить удаление и выпуск':review.action==='WITHDRAW'?'Подтвердить снятие':'Опубликовать этот состав'}</Button><Button type="button" variant="outline" disabled={busy||inProgress} onClick={()=>void check(review.action)}>Повторить проверку</Button></div></>}<Button type="button" variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>Закрыть</Button></Dialog></Modal></ModalOverlay>
  </>
}

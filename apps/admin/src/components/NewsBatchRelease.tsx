import { useEffect, useRef, useState } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { AdminApiError, requestJson } from '../lib/admin-api.mjs'
import { editorialErrorMessage } from '../lib/editorial-errors.mjs'
import { editorialOperationState, type EditorialOperation } from '../lib/editorial-review.mjs'
import type { PublicationState } from '../lib/publication-display.mjs'
import type { PublicationValidationReport } from '../../../api/src/publication-validation'
import { editorialModal, editorialOverlay } from './EditorialDraftTools'
import { PublicationProgress } from './PublicationProgress'
import { PublicationIssueCard } from './PublicationIssueCard'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'

export interface SelectedDraft { id: string; title: string; revision: number }
interface BatchItem { entityId: string; expectedRevision: number }
interface Review { ready: boolean; reviewDigest: string; items: Array<{kind:string;entityId:string;revision:number;title:string}>; affectedPaths:string[]; report:PublicationValidationReport }
interface Pending { operationId: string; reviewDigest: string; items: BatchItem[] }
export function NewsBatchRelease({apiUrl,siteId,userId,selected,disabled,onCompleted,onBusyChange}:{apiUrl:string;siteId:string;userId:string;selected:SelectedDraft[];disabled:boolean;onCompleted:(status:string)=>void;onBusyChange:(busy:boolean)=>void}) {
  const [open,setOpen]=useState(false),[review,setReview]=useState<Review|null>(null),[items,setItems]=useState<BatchItem[]>([])
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState(''),[unavailable,setUnavailable]=useState(false)
  const [errorEntityId,setErrorEntityId]=useState('')
  const [pending,setPending]=useState<Pending|null>(null),[operation,setOperation]=useState<EditorialOperation|null>(null),[global,setGlobal]=useState<PublicationState|null>(null)
  const key=`admin:editorial:operation:${userId}:${siteId}:batch`,endpoint=`/admin/sites/${encodeURIComponent(siteId)}/news`
  const completed=useRef(onCompleted),changed=useRef(onBusyChange),terminal=useRef('');completed.current=onCompleted;changed.current=onBusyChange
  useEffect(()=>{
    setPending(null);setOperation(null);setReview(null);terminal.current=''
    try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved.operationId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(saved.operationId)&&/^[a-f0-9]{64}$/.test(saved.reviewDigest)&&Array.isArray(saved.items)&&saved.items.length>0&&saved.items.length<=100&&saved.items.every((i:BatchItem)=>typeof i.entityId==='string'&&Number.isSafeInteger(i.expectedRevision)&&i.expectedRevision>0))setPending(saved)}catch{setStorageError('Восстановление операции после перезагрузки недоступно. Не закрывайте страницу до результата.')}
  },[key])
  const inProgress=!!pending&&(!operation||['PENDING','RUNNING'].includes(operation.status))
  useEffect(()=>{changed.current(inProgress||busy)},[inProgress,busy])
  useEffect(()=>{
    if(!pending)return;let active=true,timer:number|undefined
    async function poll(){
      try{
        const result=await requestJson<EditorialOperation>(apiUrl,`${endpoint}/publications/${encodeURIComponent(pending!.operationId)}`)
        if(!active)return;setOperation(result);setUnavailable(false);setError('')
        try{const state=await requestJson<PublicationState>(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/publication-state`);if(active)setGlobal(state)}catch{/* The scoped operation remains authoritative. */}
        if(!active)return
        if(['SUCCEEDED','FAILED','CANCELLED'].includes(result.status)){
          if(terminal.current!==result.id){terminal.current=result.id;setReview(null);setOpen(false);try{localStorage.removeItem(key)}catch{};window.dispatchEvent(new Event('admin:publication-changed'));completed.current(result.status)}
          return
        }
      }catch{if(active)setUnavailable(true)}
      if(active)timer=window.setTimeout(()=>void poll(),2500)
    }
    void poll();return()=>{active=false;window.clearTimeout(timer)}
  },[apiUrl,endpoint,siteId,key,pending])
  async function check(){
    const captured=selected.map(row=>({entityId:row.id,expectedRevision:row.revision}))
    setOpen(true);setReview(null);setError('');setErrorEntityId('');setBusy(true);setItems(captured)
    try{setReview(await requestJson<Review>(apiUrl,`${endpoint}/batch/review`,{method:'POST',body:{items:captured}}))}
    catch(error){setError(editorialErrorMessage(error,'Проверка выбранных черновиков недоступна.'));if(error instanceof AdminApiError&&typeof error.payload?.entityId==='string')setErrorEntityId(error.payload.entityId)}
    finally{setBusy(false)}
  }
  async function send(request:Pending){
    setBusy(true);setError('')
    try{await requestJson(apiUrl,`${endpoint}/batch/publish`,{method:'POST',body:request});setOpen(false);setUnavailable(false)}
    catch(error){
      if(terminal.current)return
      if(error instanceof AdminApiError&&[400,401,403,404,409,422].includes(error.status)){
        setPending(null);setOperation(null);setReview(null);try{localStorage.removeItem(key)}catch{};setError(error.message);setErrorEntityId(typeof error.payload?.entityId==='string'?error.payload.entityId:'');setOpen(true)
      }else{setError('Связь прервана. Проверяем результат той же операции; новая публикация не запущена.');setUnavailable(true)}
    }finally{setBusy(false)}
  }
  async function publish(){
    if(!review?.ready||busy||inProgress)return
    const request={items,reviewDigest:review.reviewDigest,operationId:crypto.randomUUID()}
    try{localStorage.setItem(key,JSON.stringify(request))}catch{setStorageError('Не удалось сохранить идентификатор операции. Не закрывайте страницу до результата.')}
    setPending(request);setOperation(null);terminal.current='';await send(request)
  }
  return <div className="space-y-3">
    <Button type="button" className="min-h-11 sm:min-h-9" disabled={disabled||selected.length===0||busy||inProgress} onClick={()=>void check()}>Опубликовать выбранные ({selected.length})</Button>
    {storageError&&<p role="status" className="text-sm text-muted-foreground">{storageError}</p>}
    {!open&&error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {pending&&unavailable&&inProgress&&<Alert><AlertDescription>Состояние операции временно недоступно. Проверка продолжится автоматически. <Button type="button" variant="link" disabled={busy} onClick={()=>void send(pending)}>Повторить тот же запрос</Button></AlertDescription></Alert>}
    {operation&&<PublicationProgress state={editorialOperationState(siteId,operation,global)} unavailable={unavailable}/>}
    {operation?.status==='SUCCEEDED'&&<p role="status" className="text-sm">Выбранные материалы опубликованы одной операцией.</p>}
    {operation?.status==='FAILED'&&<Alert variant="destructive"><AlertDescription>{operation.lastError||'Публикация не завершена. Обновите список и повторите проверку состава.'}</AlertDescription></Alert>}
    <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable={!busy} className={editorialOverlay}><Modal className={editorialModal}><Dialog className="space-y-5 p-6 outline-none">
      <Heading slot="title" className="text-xl font-semibold">Публикация выбранных черновиков</Heading>
      <p className="text-sm text-muted-foreground">Выбранные материалы и указанные категории выйдут вместе. Сайт будет собран один раз. Остальные черновики останутся без публикации.</p>
      {busy&&<p role="status">Проверяем состав…</p>}
      {error&&<Alert variant="destructive"><AlertDescription>{error}{errorEntityId&&<a className="ml-2 underline underline-offset-4" href={`/news/edit?id=${encodeURIComponent(errorEntityId)}`}>Открыть проблемный черновик</a>}</AlertDescription></Alert>}
      {review&&<><ul className="divide-y rounded-lg border">{review.items.map(item=><li key={`${item.kind}:${item.entityId}`} className="break-words p-3 text-sm"><strong>{item.title}</strong> · редакция {item.revision}{item.kind==='CATEGORY'?' · категория-зависимость':''}</li>)}</ul>
        <details><summary className="cursor-pointer py-2 text-sm">Затронутые адреса ({review.affectedPaths.length})</summary><ul className="max-h-48 overflow-auto text-sm">{review.affectedPaths.map(path=><li key={path} className="break-all">{path}</li>)}</ul></details>
        {review.report.issues.map((issue,index)=><PublicationIssueCard key={index} issue={issue} siteId={siteId}/>)}
        <Button type="button" disabled={busy||inProgress||!review.ready} onClick={()=>void publish()}>Опубликовать этот состав</Button></>}
      {!inProgress&&<Button type="button" variant="outline" disabled={busy||selected.length===0} onClick={()=>void check()}>Повторить проверку</Button>}
      <Button type="button" variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>Закрыть</Button>
    </Dialog></Modal></ModalOverlay>
  </div>
}

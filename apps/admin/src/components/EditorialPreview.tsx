import { editorialErrorMessage } from '../lib/editorial-errors.mjs'
import {useEffect,useRef,useState} from 'react'
import {Dialog,Heading,Modal,ModalOverlay} from 'react-aria-components'
import {requestJson} from '../lib/admin-api.mjs'
import type {EditorialPreviewPayload,editorialPreviewDocument} from '../lib/editorial-preview-document'
import {useEditorialDraft} from './useEditorialDraft'
import {Button} from './ui/button'
import {Alert,AlertDescription} from './ui/alert'
import {editorialOverlay} from './EditorialDraftTools'
const selectClass='min-h-11 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
export function EditorialPreview<T extends {version:string}>({draft,kind,disabled=false}:{draft:ReturnType<typeof useEditorialDraft<T>>;kind:'ARTICLE'|'CATEGORY'|'NEWS_SETTINGS'|'NOT_FOUND';disabled?:boolean}) {
 const [presentation,setPresentation]=useState<{build:typeof editorialPreviewDocument;styles:string}|null>(null)
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState('draft'),[surface,setSurface]=useState(kind==='ARTICLE'?'article':'list'),[width,setWidth]=useState(1440),[data,setData]=useState<EditorialPreviewPayload|null>(null),[assets,setAssets]=useState<Record<string,string>>({}),generation=useRef(0),controller=useRef<AbortController|null>(null)
 useEffect(()=>()=>{generation.current++;controller.current?.abort()},[])
 async function load(nextMode=mode,nextSurface=surface){
  const run=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setOpen(true);setBusy(true);setError('');setData(null);setAssets({})
  try{
   const saved=await draft.flush();if(run!==generation.current)return
   const payload=await requestJson<EditorialPreviewPayload>(draft.apiUrl,`${draft.endpoint}/preview`,{method:'POST',body:{expectedRevision:saved.revision,mode:nextMode,surface:nextSurface},signal:abort.signal});if(run!==generation.current)return
   if(!payload.available)throw new Error('У этого материала пока нет опубликованной версии. Выберите «Черновик».')
   const [renderer,styleModule]=await Promise.all([import('../lib/editorial-preview-document'),import('virtual:preview-public-styles')]);if(run!==generation.current)return
   const loaded:Record<string,string>=Object.fromEntries(Object.entries(styleModule.assets).map(([path,url])=>[path,new URL(url,window.location.origin).href]))
   // Authenticated media stays in memory and is never embedded as a public API URL.
   const initialDocument=renderer.editorialPreviewDocument(payload,nextSurface,styleModule.default,loaded).document
   const requests=Object.entries(payload.mediaRequests).filter(([path])=>initialDocument.includes(path));let cursor=0
   await Promise.all(Array.from({length:Math.min(4,requests.length)},async()=>{while(cursor<requests.length){const [path,endpoint]=requests[cursor++]
    const response=await fetch(`${draft.apiUrl.replace(/\/$/,'')}${endpoint}`,{credentials:'include',signal:abort.signal});if(!response.ok)throw new Error('Изображение не загрузилось. Повторите предпросмотр: текст сохранён.');const blob=await response.blob();loaded[path]=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)})
   }}));if(run===generation.current){setPresentation({build:renderer.editorialPreviewDocument,styles:styleModule.default});setAssets(loaded);setData(payload)}
  }catch(error){if(run===generation.current&&!abort.signal.aborted)setError(editorialErrorMessage(error,'Предпросмотр недоступен. Сохранённый текст не изменён.'))}
  finally{if(run===generation.current)setBusy(false)}
 }
 function close(){generation.current++;controller.current?.abort();setOpen(false);setData(null);setPresentation(null);setAssets({});setBusy(false)}
 let preview:{document:string;notice:string}|null=null,renderError='';if(data&&presentation)try{preview=presentation.build(data,surface,presentation.styles,assets)}catch(error){renderError=editorialErrorMessage(error,'Не удалось показать сохранённую редакцию.')}
 return <><Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={disabled||busy} onClick={()=>void load()}>Предпросмотр</Button><ModalOverlay isOpen={open} onOpenChange={value=>{if(!value)close()}} isDismissable className={editorialOverlay}><Modal className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-none overflow-y-auto rounded-xl border bg-background p-4 shadow-lg"><Dialog className="space-y-4 outline-none"><div className="flex flex-wrap items-center justify-between gap-3"><Heading slot="title" className="text-lg font-semibold">Предпросмотр сохранённой версии</Heading><Button type="button" variant="outline" onClick={close}>Закрыть предпросмотр</Button></div><div className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-2 text-sm">Версия<select className={selectClass} value={mode} onChange={event=>{setMode(event.target.value);void load(event.target.value)}}><option value="draft">Черновик</option><option value="published">На сайте</option></select></label>{kind==='ARTICLE'&&<label className="flex flex-col gap-2 text-sm">Вид<select className={selectClass} value={surface} disabled={busy} onChange={event=>{setSurface(event.target.value);void load(mode,event.target.value)}}><option value="article">Статья целиком</option><option value="list">Карточка в списке</option><option value="home">Блок главной</option></select></label>}<label className="flex flex-col gap-2 text-sm">Ширина<select className={selectClass} value={width} onChange={event=>setWidth(Number(event.target.value))}>{[1440,834,390,320].map(size=><option key={size} value={size}>{size} px</option>)}</select></label><Button type="button" variant="outline" disabled={busy} onClick={()=>void load()}>Обновить</Button></div><p className="text-sm text-muted-foreground">{data?`${data.mode==='draft'?'Черновик':'На сайте'} · редакция ${data.mode==='draft'?data.revision:data.selectedRevision??'системного шаблона'}. `:''}Ссылки отключены. Размер показывает ширину страницы в пикселях.</p>{busy&&<p role="status">Сохраняем и готовим точную версию…</p>}{(error||renderError)&&<p role="alert" className="text-sm text-destructive">{error||renderError}</p>}{preview?.notice&&<Alert><AlertDescription>{preview.notice}</AlertDescription></Alert>}{preview&&<div className="max-w-full overflow-auto rounded-lg border bg-muted/30 p-2"><iframe title="Предпросмотр новости или страницы" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.document} width={width} height="900" className="block max-w-none border-0 bg-white"/></div>}</Dialog></Modal></ModalOverlay></>
}

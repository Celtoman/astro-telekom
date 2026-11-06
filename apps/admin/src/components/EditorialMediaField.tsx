import { useEffect, useId, useRef, useState } from 'react'
import { Button as AriaButton, DropZone, FileTrigger, Text } from 'react-aria-components'
import type { MediaUse } from '../../../api/src/news-types'
import { requestJson } from '../lib/admin-api.mjs'
import { editorialMediaPreviewPath } from '../lib/editorial-media-preview.mjs'
import { Button, buttonVariants } from './ui/button'
import { Field, FieldLabel } from './ui/field'
import { Input } from './ui/input'

const accepted = ['image/jpeg','image/png','image/webp']
export function usePrivateMediaPreview(apiUrl:string, siteId:string, assetId:string | undefined, kind='body',crop?:MediaUse['crop']) {
  const [state,setState] = useState({src:'',error:''})
  const cropSignature=crop?JSON.stringify([crop.x,crop.y,crop.width,crop.height]):''
  useEffect(() => {
    setState({src:'',error:''}); if (!assetId || !siteId) return
    let active=true; const abort=new AbortController()
    editorialMediaPreviewPath(siteId,assetId,kind,crop).then(path=>fetch(`${apiUrl.replace(/\/$/,'')}${path}`,{credentials:'include',signal:abort.signal}))
      .then(async response => {
        if (!response.ok) { if (response.status===401) window.dispatchEvent(new Event('admin:session-expired')); throw new Error('Не удалось загрузить изображение') }
        const blob=await response.blob()
        return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)})
      }).then(src=>{if(active)setState({src,error:''})}).catch(error=>{if(active&&!abort.signal.aborted)setState({src:'',error:error instanceof Error?error.message:'Не удалось загрузить изображение'})})
    return()=>{active=false;abort.abort()}
  },[apiUrl,siteId,assetId,kind,cropSignature])
  return state
}
export function EditorialMediaField({apiUrl,siteId,label,value,onChange,onBusyChange,kind='cover',disabled=false}:{apiUrl:string;siteId:string;label:string;value:MediaUse|null;onChange:(value:MediaUse|null)=>void;onBusyChange?:(busy:boolean)=>void;kind?:'cover'|'social'|'body';disabled?:boolean}) {
  const id=useId(), fileRef=useRef<File|null>(null), abortRef=useRef<AbortController|null>(null), generation=useRef(0)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(false),[cropOpen,setCropOpen]=useState(false)
  const [dimensions,setDimensions]=useState({width:1,height:1}),[zoom,setZoom]=useState(1),[horizontal,setHorizontal]=useState(50),[vertical,setVertical]=useState(50)
  const preview=usePrivateMediaPreview(apiUrl,siteId,value?.assetId,cropOpen?'body':kind,cropOpen?undefined:value?.crop)
  const valueRef=useRef(value);valueRef.current=value
  useEffect(()=>()=>{generation.current++;abortRef.current?.abort();onBusyChange?.(false)},[])
  const markBusy=(next:boolean)=>{setBusy(next);onBusyChange?.(next)}
  async function upload(file:File) {
    if (disabled || busy) return
    if (!accepted.includes(file.type) || file.size>10*1024*1024) {setError('Выберите JPEG, PNG или WebP размером до 10 МБ.');return}
    fileRef.current=file;setError('');setRetry(false);markBusy(true);const current=++generation.current,abort=new AbortController();abortRef.current=abort
    try {
      const form=new FormData();form.append('file',file)
      const result=await requestJson<{id:string;width:number;height:number}>(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/news/media`,{method:'POST',body:form,signal:abort.signal})
      if(current===generation.current){setDimensions(result);onChange({assetId:result.id,alt:'',decorative:false});setCropOpen(false)}
    }catch(error){if(current===generation.current&&!abort.signal.aborted){setError(error instanceof Error?error.message:'Не удалось загрузить изображение. Текст новости сохранён в редакторе.');setRetry(true)}}
    finally{if(current===generation.current){abortRef.current=null;markBusy(false)}}
  }
  const ratio=kind==='social'?40/21:16/9, sourceRatio=dimensions.width/dimensions.height
  const frameWidth=Math.min(1,ratio/sourceRatio)/zoom,frameHeight=Math.min(1,sourceRatio/ratio)/zoom
  const crop={x:(1-frameWidth)*horizontal/100,y:(1-frameHeight)*vertical/100,width:frameWidth,height:frameHeight}
  async function applyCrop(){
    if(!value || kind==='body')return
    markBusy(true);setError('')
    try{await requestJson(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/news/media/${encodeURIComponent(value.assetId)}/crop`,{method:'POST',body:{kind,crop}});if(valueRef.current?.assetId===value.assetId){onChange({...valueRef.current,crop});setCropOpen(false)}}
    catch(error){setError(error instanceof Error?error.message:'Не удалось применить кадрирование')}
    finally{markBusy(false)}
  }
  async function openCrop(){
    if(!value)return
    setError('')
    try{const result=await requestJson<{width:number;height:number}>(apiUrl,`/admin/sites/${encodeURIComponent(siteId)}/news/media/${encodeURIComponent(value.assetId)}`);setDimensions(result);setZoom(1);setHorizontal(50);setVertical(50);setCropOpen(true)}
    catch(error){setError(error instanceof Error?error.message:'Не удалось открыть кадрирование')}
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-3"><legend className="mb-2 text-sm font-medium">{label}</legend>
    {preview.src && <div className="relative overflow-hidden rounded-lg bg-muted"><img className={cropOpen?'block h-auto w-full':'block max-h-80 w-full object-contain'} src={preview.src} alt={value?.alt||'Предпросмотр загруженного изображения'} />{cropOpen&&<div aria-hidden="true" className="pointer-events-none absolute border-2 border-primary" style={{left:`${crop.x*100}%`,top:`${crop.y*100}%`,width:`${crop.width*100}%`,height:`${crop.height*100}%`}} />}</div>}
    {preview.error&&<p className="text-sm text-destructive" role="status">{preview.error}</p>}
    <DropZone isDisabled={disabled||busy} className="rounded-lg border border-dashed border-input p-4 text-center outline-none data-[drop-target]:border-primary data-[drop-target]:bg-accent focus-visible:ring-2 focus-visible:ring-ring" getDropOperation={types=>accepted.some(t=>types.has(t))?'copy':'cancel'} onDrop={async event=>{const item=event.items.find(item=>item.kind==='file');if(item?.kind==='file')await upload(await item.getFile())}}>
      <Text slot="label" className="mb-3 block text-sm text-muted-foreground">Перетащите изображение сюда или выберите файл. JPEG, PNG, WebP до 10 МБ.</Text>
      <FileTrigger acceptedFileTypes={accepted} onSelect={files=>{if(files?.[0])void upload(files[0])}}><AriaButton isDisabled={disabled||busy} className={buttonVariants({variant:'outline'})}>{value?'Заменить изображение':'Выбрать изображение'}</AriaButton></FileTrigger>
    </DropZone>
    {busy&&<div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm">Загружаем и обрабатываем изображение…</p>{abortRef.current&&<Button type="button" variant="ghost" onClick={()=>{generation.current++;abortRef.current?.abort();abortRef.current=null;markBusy(false)}}>Отменить загрузку</Button>}</div>}
    {error&&<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{retry&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{if(fileRef.current)void upload(fileRef.current)}}>Повторить загрузку</Button>}</div>}
    {value&&<><Field><FieldLabel htmlFor={`${id}-alt`}>Описание изображения для незрячих пользователей</FieldLabel><Input id={`${id}-alt`} maxLength={1000} disabled={value.decorative} value={value.alt} onChange={e=>onChange({...value,alt:e.target.value})}/></Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={!!value.decorative} onChange={e=>onChange({...value,decorative:e.target.checked})}/>Изображение декоративное и не добавляет смысла</label>
      <Field><FieldLabel htmlFor={`${id}-caption`}>Подпись под изображением, необязательно</FieldLabel><Input id={`${id}-caption`} maxLength={2000} value={value.caption||''} onChange={e=>onChange({...value,caption:e.target.value})}/></Field>
      <div className="flex flex-wrap gap-2">{kind!=='body'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void openCrop()}>Кадрирование {kind==='cover'?'16:9':'для соцсетей'}</Button>}{value.crop&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>{const {crop,...rest}=value;onChange(rest)}}>Сбросить кадрирование</Button>}<Button type="button" variant="ghost" disabled={busy} onClick={()=>{onChange(null);setCropOpen(false)}}>Убрать изображение</Button></div>
      {cropOpen&&<div className="space-y-4 rounded-lg border p-4"><p className="text-sm">Выберите область. Оригинал сохранится; изменение применится к этому использованию изображения.</p>{[{label:'Масштаб',value:zoom,min:1,max:3,step:.1,set:setZoom},{label:'По горизонтали',value:horizontal,min:0,max:100,step:1,set:setHorizontal},{label:'По вертикали',value:vertical,min:0,max:100,step:1,set:setVertical}].map((field,index)=><Field key={field.label}><FieldLabel htmlFor={`${id}-crop-${index}`}>{field.label}: {field.value}</FieldLabel><input id={`${id}-crop-${index}`} type="range" min={field.min} max={field.max} step={field.step} value={field.value} className="w-full accent-primary" onChange={e=>field.set(Number(e.target.value))}/></Field>)}<div className="flex gap-2"><Button type="button" disabled={busy} onClick={()=>void applyCrop()}>Применить кадрирование</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setCropOpen(false)}>Отмена</Button></div></div>}
    </>}
  </fieldset>
}

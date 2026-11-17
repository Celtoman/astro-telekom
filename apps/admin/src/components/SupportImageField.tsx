import {useEffect,useRef,useState} from 'react'
import {Button as AriaButton,DropZone,FileTrigger,Text} from 'react-aria-components'
import {requestJson} from '../lib/admin-api.mjs'
import {SUPPORT_CROP_SLOTS,SUPPORT_FULL_CROP,supportCropValid,type SupportCrop,type SupportImage,type SupportImageSlot} from '../../../api/src/support-image-model'
import {Button,buttonVariants} from './ui/button'
import {Field,FieldLabel} from './ui/field'
import {Input} from './ui/input'
const accepted=['image/jpeg','image/png','image/webp']
interface Upload {id:string;src:string;width:number;height:number}
interface Props {id:string;apiUrl:string;siteId:string;slot:SupportImageSlot;label:string;value:SupportImage;disabled?:boolean;onChange:(value:SupportImage)=>void;onBusyChange:(busy:boolean)=>void}
function CropPreview({src,alt,crop,width,height}:{src:string;alt:string;crop:SupportCrop;width:number;height:number}){
 return <div className="relative w-full overflow-hidden rounded-lg border bg-white" style={{aspectRatio:(crop.width*width)/(crop.height*height)}}><img src={src} alt={alt} className="absolute block max-w-none" style={{width:100/crop.width+'%',height:'auto',left:-100*crop.x/crop.width+'%',top:-100*crop.y/crop.height+'%'}}/></div>
}
export function SupportImageField({id,apiUrl,siteId,slot,label,value,disabled=false,onChange,onBusyChange}:Props){
 const [src,setSrc]=useState(''),[previewError,setPreviewError]=useState(''),[previewRetry,setPreviewRetry]=useState(0)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(false),[cropOpen,setCropOpen]=useState(false)
 const [region,setRegion]=useState<SupportCrop>(value.crop),[dimensions,setDimensions]=useState({width:1,height:1})
 const abort=useRef<AbortController|null>(null),file=useRef<File|null>(null),generation=useRef(0),rollback=useRef(value),valueRef=useRef(value);valueRef.current=value
 const busyCallback=useRef(onBusyChange);busyCallback.current=onBusyChange
 const base='/admin/sites/'+encodeURIComponent(siteId)+'/support/media'
 const croppable=SUPPORT_CROP_SLOTS.includes(slot)
 useEffect(()=>{busyCallback.current(busy||cropOpen)},[busy,cropOpen])
 useEffect(()=>()=>{generation.current++;abort.current?.abort();busyCallback.current(false)},[])
 useEffect(()=>{
  setSrc('');setPreviewError('');const controller=new AbortController();let current=true
  const path=value.assetId?base+'/'+encodeURIComponent(value.assetId)+'/file':base+'/static/'+slot
  fetch(apiUrl.replace(/\/$/,'')+path,{credentials:'include',signal:controller.signal}).then(async res=>{
   if(!res.ok){if(res.status===401)window.dispatchEvent(new Event('admin:session-expired'));throw Error('Не удалось показать изображение.')}
   const blob=await res.blob();return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)})
  }).then(data=>{if(current)setSrc(data)}).catch(e=>{if(current&&!controller.signal.aborted)setPreviewError(e instanceof Error?e.message:'Не удалось показать изображение.')})
  return()=>{current=false;controller.abort()}
 },[apiUrl,base,slot,value.assetId,previewRetry])
 async function upload(nextFile:File){
  if(disabled||busy||cropOpen)return
  if(!accepted.includes(nextFile.type)||!nextFile.size||nextFile.size>10*1024*1024){setError('Выберите JPEG, PNG или WebP размером до 10 МБ.');return}
  file.current=nextFile;rollback.current=valueRef.current;setError('');setRetry(false);setBusy(true)
  const current=++generation.current,controller=new AbortController();abort.current=controller
  try{
   const form=new FormData();form.append('file',nextFile)
   const result=await requestJson<Upload>(apiUrl,base,{method:'POST',body:form,signal:controller.signal})
   if(current!==generation.current)return
   const crop={...SUPPORT_FULL_CROP}
   setDimensions({width:result.width,height:result.height});setRegion(crop)
   onChange({...valueRef.current,assetId:result.id,src:result.src,crop})
   if(croppable)setCropOpen(true)
  }catch(e){if(current===generation.current&&!controller.signal.aborted){setError(e instanceof Error?e.message:'Не удалось загрузить изображение.');setRetry(true)}}
  finally{if(current===generation.current){abort.current=null;setBusy(false)}}
 }
 async function applyCrop(){
  if(!supportCropValid(region)||busy)return
  setBusy(true);setError('')
  try{
   const current=valueRef.current,path=current.assetId?base+'/'+encodeURIComponent(current.assetId)+'/crop':base+'/static/'+slot+'/crop'
   const result=await requestJson<Upload>(apiUrl,path,{method:'POST',body:{crop:region}})
   onChange({...current,assetId:result.id,src:result.src,crop:{...region}});setCropOpen(false)
  }catch(e){setError(e instanceof Error?e.message:'Не удалось применить область.')}
  finally{setBusy(false)}
 }
 const crop=value.crop
 return <fieldset id={id+'-assetId'} tabIndex={-1} className="min-w-0 space-y-4 rounded-lg border p-4" disabled={disabled}>
  <legend className="px-2 text-sm font-semibold">{label}</legend>
  {src?<div className="grid min-w-0 gap-4 md:grid-cols-2"><div><p className="mb-2 text-sm text-muted-foreground">Полное изображение</p><div className="relative overflow-hidden rounded-lg bg-muted"><img src={src} alt={value.alt||'Предпросмотр исходного изображения'} className="block max-h-72 w-full object-contain" onLoad={e=>setDimensions({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})}/></div></div>{croppable&&<div><p className="mb-2 text-sm text-muted-foreground">{slot==='phone'?'Увеличение номера':'Выбранная область'}</p><CropPreview src={src} alt={value.alt} crop={cropOpen?region:crop} {...dimensions}/></div>}</div>:<p role="status" className="text-sm">{previewError||'Загружаем изображение…'}</p>}
  {previewError&&<Button type="button" variant="outline" onClick={()=>setPreviewRetry(n=>n+1)}>Повторить предпросмотр</Button>}
  <div id={id+'-src'} tabIndex={-1}><DropZone isDisabled={disabled||busy||cropOpen} className="rounded-lg border border-dashed border-input p-4 text-center outline-none data-[drop-target]:border-primary data-[drop-target]:bg-accent focus-visible:ring-2 focus-visible:ring-ring" getDropOperation={types=>accepted.some(t=>types.has(t))?'copy':'cancel'} onDrop={async event=>{const item=event.items.find(item=>item.kind==='file');if(item?.kind==='file')await upload(await item.getFile())}}>
   <Text slot="label" className="mb-2 block text-sm text-muted-foreground">JPEG, PNG или WebP, до 10 МБ</Text>
   <FileTrigger acceptedFileTypes={accepted} onSelect={files=>{const f=files?.[0];if(f)void upload(f)}}><AriaButton className={buttonVariants({variant:'outline'})} isDisabled={disabled||busy||cropOpen}>Заменить изображение</AriaButton></FileTrigger>
  </DropZone></div>
  {busy&&<div role="status" className="flex items-center gap-3 text-sm">Обрабатываем изображение…{abort.current&&<Button type="button" variant="ghost" onClick={()=>{generation.current++;abort.current?.abort();setBusy(false)}}>Отменить загрузку</Button>}</div>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {retry&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{if(file.current)void upload(file.current)}}>Повторить загрузку</Button>}
  <Field><FieldLabel htmlFor={id+'-alt'}>Описание изображения</FieldLabel><Input id={id+'-alt'} value={value.alt} maxLength={500} disabled={busy||cropOpen} onChange={e=>onChange({...value,alt:e.target.value})}/></Field>
  {slot!=='app'&&<Field><FieldLabel htmlFor={id+'-caption'}>Подпись под изображением</FieldLabel><Input id={id+'-caption'} value={value.caption} maxLength={500} disabled={busy||cropOpen} onChange={e=>onChange({...value,caption:e.target.value})}/></Field>}
  {croppable&&!cropOpen&&<Button id={id+'-crop'} type="button" variant="outline" disabled={busy||!src} onClick={()=>{rollback.current=value;setRegion({...value.crop});setCropOpen(true)}}>{slot==='phone'?'Выбрать область номера':'Настроить область изображения'}</Button>}
  {cropOpen&&<div id={id+'-crop'} tabIndex={-1} className="space-y-4 rounded-lg border p-4"><p className="text-sm">{slot==='phone'?'Выберите область номера на исходном изображении. Полный скриншот останется целым.':'Выберите показываемую область изображения.'}</p>
   {(['x','y','width','height'] as const).map((key,i)=>{const labels=['Отступ слева','Отступ сверху','Ширина области','Высота области'];const max=key==='x'?1-region.width:key==='y'?1-region.height:key==='width'?1-region.x:1-region.y;return <Field key={key}><FieldLabel htmlFor={id+'-crop-'+key}>{labels[i]}: {Math.round(region[key]*1000)/10}%</FieldLabel><input id={id+'-crop-'+key} type="range" className="w-full accent-primary" min={(key==='width'||key==='height')?.001:0} max={max} step={.001} value={region[key]} disabled={busy} onChange={e=>setRegion(old=>({...old,[key]:Number(e.target.value)}))}/></Field>})}
   <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy||!supportCropValid(region)} onClick={()=>void applyCrop()}>Применить область</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{onChange(rollback.current);setCropOpen(false);setError('')}}>Отмена</Button></div>
  </div>}
 </fieldset>
}

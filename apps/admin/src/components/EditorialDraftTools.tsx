import { useState } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { requestJson } from '../lib/admin-api.mjs'
import { editorialChanges } from '../lib/editorial-review.mjs'
import { newsFieldLabel } from '../lib/news-presentation.mjs'
import { useEditorialDraft, type EditorialWorkspace } from './useEditorialDraft'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Field, FieldLabel } from './ui/field'

export const editorialOverlay='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6'
export const editorialModal='max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-xl border bg-background p-4 text-foreground shadow-lg outline-none sm:p-6'
export function editorialValue(value:unknown):string {
  if(value===null||value===undefined||value==='')return 'Не задано'
  if(typeof value==='string')return value
  if(Array.isArray(value))return value.map(editorialValue).join('\n')
  if(typeof value==='object') {
    const item=value as Record<string,unknown>
    if(item.text)return String(item.text)
    if(item.content)return editorialValue(item.content)
    if(item.type==='doc')return 'Текст пуст'
    return Object.entries(item).filter(([key])=>!['version','type'].includes(key)).map(([key,val])=>`${newsFieldLabel(key)}: ${editorialValue(val)}`).join('\n')
  }
  return String(value)
}
export function EditorialComparison({before,after}:{before:unknown;after:unknown}) {
  const changes=editorialChanges(before,after)
  return <div className="space-y-4">{changes.length===0?<p>Различий нет.</p>:changes.map(change=><section key={change.path} className="space-y-2"><h3 className="text-sm font-semibold">{newsFieldLabel(change.path)}</h3><div className="grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-lg border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Серверная / выбранная редакция</p><p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">{editorialValue(change.before)}</p></div><div className="min-w-0 rounded-lg border border-primary/30 bg-primary/5 p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Ваш текущий черновик</p><p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">{editorialValue(change.after)}</p></div></div></section>)}</div>
}
export function EditorialDraftFeedback<T extends {version:string}>({draft}:{draft:ReturnType<typeof useEditorialDraft<T>>}) {
  const [server,setServer]=useState<EditorialWorkspace<T>|null>(null),[open,setOpen]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function compare(){setBusy(true);setError('');try{setServer(await draft.loadServer());setOpen(true)}catch(error){setError(error instanceof Error?error.message:'Не удалось загрузить серверную версию')}finally{setBusy(false)}}
  const labels={saved:'Черновик сохранён',dirty:'Есть несохранённые изменения',saving:'Сохраняем…',error:'Не удалось сохранить черновик',conflict:'Черновик изменился в другой вкладке'}
  return <div className="space-y-3">
    <p role="status" aria-live="polite" className={`text-sm ${['error','conflict'].includes(draft.saving.status)?'text-destructive':'text-muted-foreground'}`}>{draft.saving.status==='saved'&&draft.saving.revision===0?'Нет несохранённых изменений':labels[draft.saving.status]}{draft.saving.savedAt&&draft.saving.status==='saved'?` · ${new Date(draft.saving.savedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`:''}</p>
    {!draft.saving.recoveryAvailable&&<Alert><AlertDescription>В этом браузере недоступна временная копия. Дождитесь серверного сохранения перед закрытием страницы.</AlertDescription></Alert>}
    {draft.saving.status==='error'&&<Alert variant="destructive"><AlertDescription>{draft.saving.error instanceof Error?draft.saving.error.message:'Связь с сервером прервана.'} Введённый текст остаётся в редакторе. <Button type="button" variant="link" onClick={()=>void draft.flush().catch(()=>undefined)}>Повторить сохранение</Button></AlertDescription></Alert>}
    {draft.saving.status==='conflict'&&<Alert variant="destructive"><AlertDescription>Автосохранение приостановлено. Сравните версии перед продолжением. <Button type="button" variant="link" disabled={busy} onClick={()=>void compare()}>Сравнить версии</Button></AlertDescription></Alert>}
    {draft.candidates.length>0&&<Alert><AlertDescription><p>Найдены несохранённые изменения в этом браузере. Последняя копия: {new Date(draft.candidates[0].updatedAt).toLocaleString('ru-RU')}.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>draft.restoreLocal(draft.candidates[0])}>Восстановить копию</Button><Button type="button" variant="ghost" onClick={draft.dismissRecovery}>Оставить серверную версию</Button></div></AlertDescription></Alert>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className={editorialOverlay}><Modal className={editorialModal}><Dialog className="space-y-5 outline-none"><Heading slot="title" className="text-lg font-semibold">Сравнение версий</Heading><p className="text-sm text-muted-foreground">Выберите основу для дальнейшего редактирования. Опубликованный сайт не изменится. Если серверная версия снова изменится, редактор повторно остановит сохранение.</p>{server&&<EditorialComparison before={server.content} after={draft.content}/>}<div className="flex flex-wrap gap-2"><Button type="button" onClick={()=>{if(server){draft.resolve(server,true);setOpen(false)}}}>Продолжить с моим текстом</Button><Button type="button" variant="outline" onClick={()=>{if(server){draft.resolve(server,false);setOpen(false)}}}>Взять серверную версию</Button><Button type="button" variant="ghost" onClick={()=>setOpen(false)}>Решить позже</Button></div></Dialog></Modal></ModalOverlay>
  </div>
}
interface HistoryRow {revision:number;createdAt:string;publishedAt:string|null;checkpoint:boolean}
export function EditorialHistory<T extends {version:string}>({apiUrl,draft,disabled=false}:{apiUrl:string;draft:ReturnType<typeof useEditorialDraft<T>>;disabled?:boolean}) {
  const [open,setOpen]=useState(false),[rows,setRows]=useState<HistoryRow[]>([]),[selected,setSelected]=useState<{revision:number;content:T}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function show(){setOpen(true);setBusy(true);setError('');setSelected(null);try{await draft.flush();setRows(await requestJson<HistoryRow[]>(apiUrl,`${draft.endpoint}/history`))}catch(error){setError(error instanceof Error?error.message:'Не удалось загрузить историю')}finally{setBusy(false)}}
  async function select(revision:number){setBusy(true);setError('');try{setSelected(await requestJson(apiUrl,`${draft.endpoint}/history/${revision}`))}catch(error){setError(error instanceof Error?error.message:'Редакция недоступна')}finally{setBusy(false)}}
  async function restore(){if(!selected)return;setBusy(true);setError('');try{const current=await draft.flush();await requestJson(apiUrl,`${draft.endpoint}/restore`,{method:'POST',body:{revision:selected.revision,expectedRevision:current.revision}});await draft.acceptExternal(current.fingerprint);setOpen(false)}catch(error){setError(error instanceof Error?error.message:'Не удалось восстановить редакцию. Текущий текст остался в редакторе.')}finally{setBusy(false)}}
  return <><Button type="button" variant="outline" disabled={disabled} onClick={()=>void show()}>История</Button><ModalOverlay isOpen={open} onOpenChange={value=>{if(!busy)setOpen(value)}} isDismissable={!busy} className={editorialOverlay}><Modal className={editorialModal}><Dialog className="space-y-5 outline-none"><Heading slot="title" className="text-lg font-semibold">История редакций</Heading><p className="text-sm text-muted-foreground">Опубликованные версии и последние 20 контрольных сохранений. Восстановление меняет только черновик.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{busy&&<p role="status">Загружаем…</p>}<Field><FieldLabel htmlFor="editorial-history-revision">Редакция для сравнения</FieldLabel><select id="editorial-history-revision" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" disabled={busy} value={selected?.revision??''} onChange={event=>void select(Number(event.target.value))}><option value="" disabled>Выберите редакцию</option>{rows.map(row=><option key={row.revision} value={row.revision}>№ {row.revision} · {new Date(row.createdAt).toLocaleString('ru-RU')}{row.publishedAt?' · опубликована':''}</option>)}</select></Field>{selected&&<EditorialComparison before={selected.content} after={draft.content}/>}<div className="flex flex-wrap gap-2"><Button type="button" disabled={!selected||busy} onClick={()=>void restore()}>Восстановить в черновик</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Закрыть</Button></div></Dialog></Modal></ModalOverlay></>
}

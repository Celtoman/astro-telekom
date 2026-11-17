import type { Editor } from '@tiptap/react'
import { SupportRichTextEditor } from './SupportRichTextEditor'
import { SupportImageField } from './SupportImageField'
import { supportValue, supportSetValue, type SupportImage, type SupportImageSlot } from '../../../api/src/support-image-model'
import { useEffect, useRef, useState } from 'react'
import { supportEditableField, supportFieldLabel, type SupportPageContent } from '../../../api/src/support-page-model'
import { supportEditorSections, supportFieldId as fieldId, supportTextValue, setSupportText, supportVariableField } from '../lib/support-editor.mjs'
import { AdminApiError, requestJson, requestSession } from '../lib/admin-api.mjs'
import { editorSiteId } from '../lib/editor-context.mjs'
import { insertVariableAtSelection } from '../lib/variable-insertion.mjs'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminShell } from './AdminShell'
import { VariableInsertionPicker } from './VariableInsertionPicker'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Field, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Alert, AlertDescription } from './ui/alert'

interface Site { id: string; name: string }
interface Workspace { content: SupportPageContent; workingRevision: number; publishedRevision: number | null; missingFields: string[]; published: SupportPageContent | null; previewPath: string | null }
const textareaClass = 'min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary'

export function SupportPageApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = useState<Site[]>([]), [siteId, setSiteId] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null), [content, setContent] = useState<SupportPageContent | null>(null)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [refresh, setRefresh] = useState(0)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [errorField, setErrorField] = useState('')
  const [activeField, setActiveField] = useState<{ path: string; limit: number; variables?: boolean } | null>(null)
  const activeInput = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const richEditor = useRef<Editor | null>(null)
  const [mediaBusy, setMediaBusy] = useState<Record<string,boolean>>({})
  const [editorReset, setEditorReset] = useState(0)
  const busy = Object.values(mediaBusy).some(Boolean)
  const recoveryFocused = useRef(false)
  const dirty = !!workspace && !!content && JSON.stringify(workspace.content) !== JSON.stringify(content)
  useUnsavedChanges(dirty || busy)
  const report = (caught: unknown) => {
    if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace('/login'); return }
    setError(caught instanceof Error ? caught.message : 'Не удалось выполнить действие')
    const field = caught instanceof AdminApiError ? caught.payload?.field : ''
    if (supportEditableField(field)) { setErrorField(field); requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus()) }
  }
  useEffect(() => {
    let current = true
    Promise.all([requestSession<{ user: { id: string; email: string } }>(apiUrl), requestJson<Site[]>(apiUrl, '/admin/sites?summary=true')]).then(([session, sites]) => {
      if (current) { setUser(session.user); setSites(sites); setSiteId(editorSiteId(sites, window.location.search)); setLoading(false) }
    }).catch(caught => { if (current) { report(caught); setLoading(false) } })
    return () => { current = false }
  }, [apiUrl])
  useEffect(() => {
    setWorkspace(null); setContent(null); setError(''); setMessage(''); setActiveField(null); richEditor.current=null; activeInput.current = null; setMediaBusy({}); recoveryFocused.current=false
    if (!siteId) return
    let current = true; setLoading(true)
    requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/support`).then(result => {
      if (current) { setWorkspace(result); setContent(structuredClone(result.content)); setEditorReset(n=>n+1) }
    }).catch(caught => { if (current) report(caught) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [apiUrl, siteId, refresh])
  useEffect(() => {
    if (!content || recoveryFocused.current) return
    const path = new URLSearchParams(window.location.search).get('field')
    if (supportEditableField(path)) {
      const field = document.getElementById(fieldId(path))
      if (field) { field.focus(); field.scrollIntoView({ block: 'center' }); recoveryFocused.current = true }
    }
  }, [content])
  const errorAttrs = (path: string) => ({ 'aria-invalid': errorField === path || undefined, 'aria-describedby': errorField === path && error ? 'support-error' : undefined })
  const update = (mutate: (next: SupportPageContent) => void) => { setContent(old => { if (!old) return old; const next = structuredClone(old); mutate(next); return next }); setMessage(''); setErrorField('') }
  async function save(event: { preventDefault(): void }) {
    event.preventDefault(); if (!workspace || !content || saving || busy) return
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await requestJson<Pick<Workspace, 'content' | 'workingRevision' | 'missingFields'>>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/support`, { method: 'PATCH', body: { expectedWorkingRevision: workspace.workingRevision, content } })
      setWorkspace({ ...workspace, ...result }); setContent(structuredClone(result.content)); setEditorReset(n=>n+1); setErrorField('')
      setMessage(result.missingFields.length ? 'Черновик сохранён. Заполните обязательные поля перед публикацией.' : 'Рабочая версия сохранена. Публикация выполняется отдельно.')
    } catch (caught) { report(caught) } finally { setSaving(false) }
  }
  function moveFaq(index: number, direction: number) {
    const target = index + direction
    if (!content || target < 0 || target >= content.faq.items.length) return
    setActiveField(null); activeInput.current = null
    setEditorReset(n=>n+1)
    update(next => { [next.faq.items[index], next.faq.items[target]] = [next.faq.items[target], next.faq.items[index]] })
    requestAnimationFrame(() => document.getElementById(fieldId(`faq.items.${target}.question`))?.focus())
  }
  function insertCode(code: string) {
    if (saving || !activeField || !content) return
    if (richEditor.current) {
      const editor=richEditor.current
      if (supportTextValue(content,activeField.path).length + code.length + 2 > activeField.limit) { setError('Для подстановки не хватает места в поле. Сократите текст.'); return }
      editor.chain().focus().insertContent({type:'text',text:'{'+code+'}'}).run(); return
    }
    if (!activeInput.current) return
    const { path, limit } = activeField, input = activeInput.current
    const result = insertVariableAtSelection(supportTextValue(content, path), input.selectionStart, input.selectionEnd, code, limit)
    if (!result) { setError('Для подстановки не хватает места в поле. Сократите текст.'); return }
    update(next => { setSupportText(next, path, result.value) })
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(result.selectionStart, result.selectionEnd) })
  }
  if (!user) return <div className="p-6" role="status">{error || 'Загружаем редактор…'}</div>
  const discard = () => (!dirty && !busy) || window.confirm('Отменить несохранённые изменения?')
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 lg:p-8">
    <div><h1 className="text-2xl font-semibold">Техническая поддержка</h1><p className="mt-2 text-sm text-muted-foreground">Общий шаблон для городов. Измените тексты, ссылки, изображения и FAQ. Состав и порядок разделов сохраняются.</p></div>
    <Field><FieldLabel htmlFor="support-site">Сайт</FieldLabel><select id="support-site" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={siteId} disabled={saving || busy} onChange={event => { if (discard()) setSiteId(event.target.value) }}><option value="">Выберите сайт</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
    {error && <Alert variant="destructive"><AlertDescription id="support-error">{error}</AlertDescription></Alert>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {loading && <p role="status">Загружаем страницу…</p>}
    {workspace && content && <form onSubmit={save} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving || busy || !dirty}>{saving ? 'Сохраняем…' : 'Сохранить'}</Button><Button type="button" variant="outline" disabled={saving || busy} onClick={() => { if (discard()) setRefresh(x => x + 1) }}>Обновить данные</Button><a className="text-sm underline" href={`/preview?siteId=${encodeURIComponent(siteId)}&path=${encodeURIComponent(workspace.previewPath || "")}`} onClick={event => { if (!workspace.previewPath) { event.preventDefault(); setError("Нет опубликованного города для предпросмотра."); return } if (dirty || busy) { event.preventDefault(); setError('Сохраните изменения перед предпросмотром.') } }}>Предпросмотр</a><a className="text-sm underline" href={`/seo/templates?siteId=${encodeURIComponent(siteId)}&kind=CITY_SUPPORT`}>SEO страницы</a></div>
      <p className="text-sm text-muted-foreground">Рабочая ревизия: {workspace.workingRevision}. Опубликованная ревизия сайта: {workspace.publishedRevision ?? 'пока не подтверждена'}.</p>
      <fieldset disabled={saving} className="min-w-0 space-y-6">
      {supportEditorSections.map(section => <Card key={section.id}><CardHeader><CardTitle>{section.title}</CardTitle></CardHeader><CardContent className="space-y-5">
        {section.id === 'address' && <p className="text-sm text-muted-foreground">Общая форма проверки подключения. Системные подписи редактируются в общих настройках компонента.</p>}
        {section.fields.map((field: {path:string;label:string;limit:number;variables?:boolean;rich:boolean}) => field.rich ? <SupportRichTextEditor key={field.path} id={fieldId(field.path)} label={field.label} value={supportTextValue(content,field.path)} resetKey={siteId+':'+editorReset} maxLength={field.limit} disabled={saving} invalid={errorField===field.path} describedBy={errorField===field.path?'support-error':undefined} onFocus={editor=>{setActiveField(field);richEditor.current=editor;activeInput.current=null}} onChange={value=>update(n=>setSupportText(n,field.path,value))}/> : <Field key={field.path}><FieldLabel htmlFor={fieldId(field.path)}>{field.label}</FieldLabel>
          {field.limit <= 500 ? <Input id={fieldId(field.path)} value={supportTextValue(content, field.path)} maxLength={field.limit} {...errorAttrs(field.path)} onFocus={e => { setActiveField(field); richEditor.current=null; activeInput.current = e.target }} onChange={e => update(n => { setSupportText(n, field.path, e.target.value) })} />
            : <textarea id={fieldId(field.path)} className={textareaClass} value={supportTextValue(content, field.path)} maxLength={field.limit} {...errorAttrs(field.path)} onFocus={e => { setActiveField(field); activeInput.current = e.target }} onChange={e => update(n => { setSupportText(n, field.path, e.target.value) })} />}
        </Field>)}
        {section.images.map((image:{slot:string;path:string;label:string})=><SupportImageField key={siteId+image.slot} id={fieldId(image.path)} apiUrl={apiUrl} siteId={siteId} slot={image.slot as SupportImageSlot} label={image.label} value={supportValue(content,image.path) as SupportImage} disabled={saving} onChange={value=>update(n=>supportSetValue(n,image.path,value))} onBusyChange={value=>setMediaBusy(old=>old[image.slot]===value?old:{...old,[image.slot]:value})}/>)}
        {section.id === 'faq' && <>
        <CardDescription>Для публикации нужен хотя бы один полный вопрос с ответом.</CardDescription>
        {content.faq.items.map((item, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">Вопрос {index + 1}</legend>
          {(['question', 'answer'] as const).map(field => field==='answer'?<SupportRichTextEditor key={field} id={fieldId(`faq.items.${index}.answer`)} label="Ответ" value={item.answer} resetKey={siteId+':'+editorReset+':'+content.faq.items.length+':'+item.question} maxLength={20000} disabled={saving} invalid={errorField===`faq.items.${index}.answer`} describedBy={errorField===`faq.items.${index}.answer`?'support-error':undefined} onFocus={editor=>{setActiveField({path:`faq.items.${index}.answer`,limit:20000,variables:true});richEditor.current=editor;activeInput.current=null}} onChange={value=>update(n=>{n.faq.items[index].answer=value})}/>:<Field key={field}><FieldLabel htmlFor={fieldId(`faq.items.${index}.${field}`)}>{field === 'question' ? 'Вопрос' : 'Ответ'}</FieldLabel><textarea className={textareaClass} id={fieldId(`faq.items.${index}.${field}`)} {...errorAttrs(`faq.items.${index}.${field}`)} value={item[field]} maxLength={field === 'question' ? 2000 : 20000} onFocus={e => { setActiveField({ path: `faq.items.${index}.${field}`, limit: field === 'question' ? 2000 : 20000, variables: true }); richEditor.current=null; activeInput.current = e.target }} onChange={e => update(n => { n.faq.items[index][field] = e.target.value })} /></Field>)}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={index === 0} onClick={() => moveFaq(index, -1)} aria-label={`Переместить вопрос ${index + 1} выше`}>Выше</Button><Button type="button" variant="outline" disabled={index === content.faq.items.length - 1} onClick={() => moveFaq(index, 1)} aria-label={`Переместить вопрос ${index + 1} ниже`}>Ниже</Button><Button type="button" variant="outline" onClick={() => { update(n => { n.faq.items.splice(index, 1) }); setActiveField(null); activeInput.current = null; requestAnimationFrame(() => (document.getElementById(fieldId(`faq.items.${Math.min(index, content.faq.items.length - 2)}.question`)) || document.getElementById('support-add-faq'))?.focus()) }}>Удалить вопрос {index + 1}</Button></div>
        </fieldset>)}
        <div id={fieldId('faq.items')} tabIndex={-1}><Button id="support-add-faq" type="button" variant="outline" disabled={content.faq.items.length >= 50} onClick={() => { const index = content.faq.items.length; update(n => { n.faq.items.push({ question: '', answer: '' }) }); requestAnimationFrame(() => document.getElementById(fieldId(`faq.items.${index}.question`))?.focus()) }}>Добавить вопрос</Button></div>
        </>}
      </CardContent></Card>)}
      <VariableInsertionPicker apiUrl={apiUrl} siteId={siteId} context="CITY" field={activeField?.variables ? supportVariableField(activeField.path) : null} onInsert={insertCode} />
      </fieldset>
      <p className="text-sm text-muted-foreground">Телефоны и график работы меняются в <a className="underline" href="/variables">общих настройках сайта</a>.</p>
      {workspace.missingFields.length > 0 && <Alert><AlertDescription>Перед публикацией заполните: {workspace.missingFields.map(supportFieldLabel).join(', ')}</AlertDescription></Alert>}
    </form>}
  </div></AdminShell>
}

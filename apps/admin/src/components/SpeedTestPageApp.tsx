import { useEffect, useRef, useState } from 'react'
import { SPEED_TEST_PAGE_SLUG, speedTestEditableField, speedTestFieldLabel, type SpeedTestPageContent } from '../../../api/src/speed-test-page-model'
import { ROUTER_PAGE_SCHEMA, ROUTER_PAGE_SLUG, ROUTER_SECTION_LABELS, routerEditableField, routerFieldLabel, type RouterPageContent } from '../../../api/src/router-page-model'
import type { GeneralHomeFieldRule } from '../../../api/src/general-home-model'
import { speedTestEditorSections, speedTestVariableField } from '../lib/speed-test-editor.mjs'
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
type PageContent = SpeedTestPageContent | RouterPageContent
interface Workspace { content: PageContent; workingRevision: number; publishedRevision: number | null; missingFields: string[]; published: PageContent | null }
const textareaClass = 'min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary'

function routerFields(schema: GeneralHomeFieldRule, path: string): Array<{ path: string; label: string; limit: number; variables: boolean }> {
  if (schema.kind === 'object') return Object.entries(schema.fields).flatMap(([key, field]) => routerFields(field, path ? path + '.' + key : key))
  return schema.kind === 'text' && routerEditableField(path) ? [{ path, label: routerFieldLabel(path), limit: schema.limit, variables: schema.variables }] : []
}

const editors = {
  'speed-test': {
    slug: SPEED_TEST_PAGE_SLUG, seo: 'SPEED_TEST', title: 'Проверка скорости интернета',
    intro: 'Измените заголовок, тексты шести разделов и вопросы. Карточки и порядок разделов сохраняются.',
    sections: speedTestEditorSections, editable: speedTestEditableField, label: speedTestFieldLabel,
  },
  routers: {
    slug: ROUTER_PAGE_SLUG, seo: 'EQUIPMENT_ROUTER', title: 'Роутеры',
    intro: 'Измените тексты блоков и вопросы. Состав моделей, цены и порядок блоков заданы в шаблоне.',
    sections: Object.entries(ROUTER_SECTION_LABELS).map(([id, title]) => ({
      id, title, fields: routerFields(ROUTER_PAGE_SCHEMA, '').filter(field => field.path.startsWith(id + '.')),
    })),
    editable: routerEditableField, label: routerFieldLabel,
  },
} as const

function textValue(content: PageContent, path: string): string {
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], content) as string
}

function setText(content: PageContent, path: string, value: string) {
  const parts = path.split('.')
  const key = parts.pop()!
  const parent = parts.reduce<unknown>((owner, part) => (owner as Record<string, unknown>)[part], content)
  ;(parent as Record<string, unknown>)[key] = value
}

export function SpeedTestPageApp({ apiUrl, editor = 'speed-test' }: { apiUrl: string; editor?: keyof typeof editors }) {
  const config = editors[editor]
  const fieldId = (path: string) => editor + '-' + path.replaceAll('.', '-')
  const errorId = editor + '-error'
  const addFaqId = editor + '-add-faq'
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = useState<Site[]>([]), [siteId, setSiteId] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null), [content, setContent] = useState<PageContent | null>(null)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [refresh, setRefresh] = useState(0)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [errorField, setErrorField] = useState('')
  const [activeField, setActiveField] = useState<{ path: string; limit: number } | null>(null)
  const activeInput = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const recoveryFocused = useRef(false)
  const dirty = !!workspace && !!content && JSON.stringify(workspace.content) !== JSON.stringify(content)
  useUnsavedChanges(dirty)
  const report = (caught: unknown) => {
    if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace('/login'); return }
    setError(caught instanceof Error ? caught.message : 'Не удалось выполнить действие')
    const field = caught instanceof AdminApiError ? caught.payload?.field : ''
    if (config.editable(field)) { setErrorField(field); requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus()) }
  }
  useEffect(() => {
    let current = true
    Promise.all([requestSession<{ user: { id: string; email: string } }>(apiUrl), requestJson<Site[]>(apiUrl, '/admin/sites?summary=true')]).then(([session, sites]) => {
      if (current) { setUser(session.user); setSites(sites); setSiteId(editorSiteId(sites, window.location.search)); setLoading(false) }
    }).catch(caught => { if (current) { report(caught); setLoading(false) } })
    return () => { current = false }
  }, [apiUrl])
  useEffect(() => {
    setWorkspace(null); setContent(null); setError(''); setMessage(''); setActiveField(null); activeInput.current = null
    if (!siteId) return
    let current = true; setLoading(true)
    requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/${editor}`).then(result => {
      if (current) { setWorkspace(result); setContent(structuredClone(result.content)) }
    }).catch(caught => { if (current) report(caught) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [apiUrl, siteId, refresh])
  useEffect(() => {
    if (!content || recoveryFocused.current) return
    const path = new URLSearchParams(window.location.search).get('field')
    if (config.editable(path)) {
      const field = document.getElementById(fieldId(path))
      if (field) { field.focus(); field.scrollIntoView({ block: 'center' }); recoveryFocused.current = true }
    }
  }, [content])
  const errorAttrs = (path: string) => ({ 'aria-invalid': errorField === path || undefined, 'aria-describedby': errorField === path && error ? errorId : undefined })
  const update = (mutate: (next: PageContent) => void) => { setContent(old => { if (!old) return old; const next = structuredClone(old); mutate(next); return next }); setMessage(''); setErrorField('') }
  async function save(event: { preventDefault(): void }) {
    event.preventDefault(); if (!workspace || !content || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await requestJson<Pick<Workspace, 'content' | 'workingRevision' | 'missingFields'>>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/${editor}`, { method: 'PATCH', body: { expectedWorkingRevision: workspace.workingRevision, content } })
      setWorkspace({ ...workspace, ...result }); setContent(structuredClone(result.content)); setErrorField('')
      setMessage(result.missingFields.length ? 'Черновик сохранён. Заполните обязательные поля перед публикацией.' : 'Рабочая версия сохранена. Публикация выполняется отдельно.')
    } catch (caught) { report(caught) } finally { setSaving(false) }
  }
  function moveFaq(index: number, direction: number) {
    const target = index + direction
    if (!content || target < 0 || target >= content.faq.items.length) return
    setActiveField(null); activeInput.current = null
    update(next => { [next.faq.items[index], next.faq.items[target]] = [next.faq.items[target], next.faq.items[index]] })
    requestAnimationFrame(() => document.getElementById(fieldId(`faq.items.${target}.question`))?.focus())
  }
  function insertCode(code: string) {
    if (saving || !activeField || !activeInput.current || !content) return
    const { path, limit } = activeField, input = activeInput.current
    const result = insertVariableAtSelection(textValue(content, path), input.selectionStart, input.selectionEnd, code, limit)
    if (!result) { setError('Для подстановки не хватает места в поле. Сократите текст.'); return }
    update(next => { setText(next, path, result.value) })
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(result.selectionStart, result.selectionEnd) })
  }
  if (!user) return <div className="p-6" role="status">{error || 'Загружаем редактор…'}</div>
  const discard = () => !dirty || window.confirm('Отменить несохранённые изменения?')
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 lg:p-8">
    <div><h1 className="text-2xl font-semibold">{config.title}</h1><p className="mt-2 text-sm text-muted-foreground">{config.intro}</p></div>
    <Field><FieldLabel htmlFor={editor + "-site"}>Сайт</FieldLabel><select id={editor + "-site"} className={textareaClass + ' min-h-9'} value={siteId} disabled={saving} onChange={event => { if (discard()) setSiteId(event.target.value) }}><option value="">Выберите сайт</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
    {error && <Alert variant="destructive"><AlertDescription id={errorId}>{error}</AlertDescription></Alert>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {loading && <p role="status">Загружаем страницу…</p>}
    {workspace && content && <form onSubmit={save} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving || !dirty}>{saving ? 'Сохраняем…' : 'Сохранить'}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => { if (discard()) setRefresh(x => x + 1) }}>Обновить данные</Button><a className="text-sm underline" href={`/preview?siteId=${encodeURIComponent(siteId)}&path=/${config.slug}`} onClick={event => { if (dirty) { event.preventDefault(); setError('Сохраните изменения перед предпросмотром.') } }}>Предпросмотр</a><a className="text-sm underline" href={`/seo/templates?siteId=${encodeURIComponent(siteId)}&kind=${config.seo}`}>SEO страницы</a></div>
      <p className="text-sm text-muted-foreground">Рабочая ревизия: {workspace.workingRevision}. Опубликованная ревизия сайта: {workspace.publishedRevision ?? 'пока не подтверждена'}.</p>
      <fieldset disabled={saving} className="min-w-0 space-y-6">
      {config.sections.map(section => <Card key={section.id}><CardHeader><CardTitle>{section.title}</CardTitle></CardHeader><CardContent className="space-y-5">
        {section.fields.map(field => <Field key={field.path}><FieldLabel htmlFor={fieldId(field.path)}>{field.label}</FieldLabel>
          {field.limit <= 500 ? <Input id={fieldId(field.path)} value={textValue(content, field.path)} maxLength={field.limit} {...errorAttrs(field.path)} onFocus={e => { setActiveField(field); activeInput.current = e.target }} onChange={e => update(n => { setText(n, field.path, e.target.value) })} />
            : <textarea id={fieldId(field.path)} className={textareaClass} value={textValue(content, field.path)} maxLength={field.limit} {...errorAttrs(field.path)} onFocus={e => { setActiveField(field); activeInput.current = e.target }} onChange={e => update(n => { setText(n, field.path, e.target.value) })} />}
        </Field>)}
        {section.id === 'faq' && <>
        <CardDescription>Для публикации нужен хотя бы один полный вопрос с ответом.</CardDescription>
        {content.faq.items.map((item, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">Вопрос {index + 1}</legend>
          {(['question', 'answer'] as const).map(field => <Field key={field}><FieldLabel htmlFor={fieldId(`faq.items.${index}.${field}`)}>{field === 'question' ? 'Вопрос' : 'Ответ'}</FieldLabel><textarea className={textareaClass} id={fieldId(`faq.items.${index}.${field}`)} {...errorAttrs(`faq.items.${index}.${field}`)} value={item[field]} maxLength={field === 'question' ? 2000 : 20000} onFocus={e => { setActiveField({ path: `faq.items.${index}.${field}`, limit: field === 'question' ? 2000 : 20000 }); activeInput.current = e.target }} onChange={e => update(n => { n.faq.items[index][field] = e.target.value })} /></Field>)}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={index === 0} onClick={() => moveFaq(index, -1)} aria-label={`Переместить вопрос ${index + 1} выше`}>Выше</Button><Button type="button" variant="outline" disabled={index === content.faq.items.length - 1} onClick={() => moveFaq(index, 1)} aria-label={`Переместить вопрос ${index + 1} ниже`}>Ниже</Button><Button type="button" variant="outline" onClick={() => { update(n => { n.faq.items.splice(index, 1) }); setActiveField(null); activeInput.current = null; requestAnimationFrame(() => (document.getElementById(fieldId(`faq.items.${Math.min(index, content.faq.items.length - 2)}.question`)) || document.getElementById(addFaqId))?.focus()) }}>Удалить вопрос {index + 1}</Button></div>
        </fieldset>)}
        <div id={fieldId('faq.items')} tabIndex={-1}><Button id={addFaqId} type="button" variant="outline" disabled={content.faq.items.length >= 50} onClick={() => { const index = content.faq.items.length; update(n => { n.faq.items.push({ question: '', answer: '' }) }); requestAnimationFrame(() => document.getElementById(fieldId(`faq.items.${index}.question`))?.focus()) }}>Добавить вопрос</Button></div>
        </>}
      </CardContent></Card>)}
      <VariableInsertionPicker apiUrl={apiUrl} siteId={siteId} context="SITE" field={activeField ? speedTestVariableField(activeField.path) : null} onInsert={insertCode} />
      </fieldset>
      <p className="text-sm text-muted-foreground">Телефоны и график работы меняются в <a className="underline" href="/variables">общих настройках сайта</a>.</p>
      {workspace.missingFields.length > 0 && <Alert><AlertDescription>Перед публикацией заполните: {workspace.missingFields.map(config.label).join(', ')}</AlertDescription></Alert>}
    </form>}
  </div></AdminShell>
}
